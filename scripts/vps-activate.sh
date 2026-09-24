#!/bin/bash
# Artifact deploy activation — invoked by .github/workflows/deploy.yml.
# CI builds the Next.js output and ships it as a tarball; this script swaps
# it in atomically and restarts the app. No `next build` runs on the VPS.
#
# Usage: bash scripts/vps-activate.sh <git-sha> <tarball-path>
set -e
# Same pipefail rationale as vps-deploy.sh — a failing pipe stage must
# not be masked by a later command's exit code.
set -o pipefail
# deploy.yml polls this log detached — a bare `exit 1` would otherwise look
# identical to "still running" and burn the whole poll timeout.
trap 'rc=$?; [ "$rc" -ne 0 ] && echo "❌ ACTIVATION_FAILED rc=$rc"' EXIT
cd /var/www/premarketprice

SHA="${1:?missing git sha}"
TARBALL="${2:-/tmp/next-build.tar.gz}"

# Deploy mutex — artifact deploys and manual builds (vps-deploy.sh) share
# this lock so a second deploy exits instead of racing (the "another next
# build is already running" 3× failure mode).
exec 9>/var/lock/pmp-deploy.lock
if ! flock -n 9; then
  echo "⚠️  another deploy holds /var/lock/pmp-deploy.lock — exiting"
  exit 1
fi

echo "=== Updating git remote ==="
git remote set-url origin https://github.com/dusan02/vercel_pmp.git
git fetch origin main 2>&1 | tail -3

# Unpushed local commits are discarded by the reset below — that is how the
# post-market cron scripts were silently lost (Sep 2026). Warn loudly so a
# human can abort and push them first if this ever happens again.
UNPUSHED=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "$UNPUSHED" != "0" ]; then
  echo "⚠️  WARNING: $UNPUSHED unpushed local commit(s) will be DISCARDED:"
  git log --oneline origin/main..HEAD | head -10
  echo "⚠️  If any of these matter, abort now (Ctrl-C) and push them first."
  sleep 5
fi

echo "=== Resetting to $SHA ==="
# Reset to the exact SHA the artifact was built from — repo files and
# .next output must never come from different commits.
git reset --hard "$SHA" 2>&1 | tail -3

echo "=== Installing dependencies (incremental) ==="
# One-time migration: pnpm-structured node_modules (corepack pnpm v10 blocks
# native build scripts → broken better-sqlite3). Wipe once, then npm manages it.
if [ -d node_modules/.pnpm ]; then
  echo "pnpm node_modules detected — wiping for clean npm install (one-time)"
  rm -rf node_modules
fi
npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -5

echo "=== Prisma generate ==="
npx prisma generate 2>&1 | tail -3

echo "=== Unpacking prebuilt .next ==="
STAGE=/var/www/premarketprice/.deploy-stage
rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -xzf "$TARBALL" -C "$STAGE"
if [ ! -f "$STAGE/.next/BUILD_ID" ]; then
  echo "❌ artifact missing .next/BUILD_ID — refusing to deploy"
  exit 1
fi

echo "=== Swapping .next ==="
rm -rf .next.prev
mv .next .next.prev 2>/dev/null || true
mv "$STAGE/.next" .next
rm -rf "$STAGE" "$TARBALL"
# Preserve the runtime ISR/fetch cache across swaps — hardlinks cost nothing
# and keep revalidate windows warm instead of cold-starting every deploy.
if [ -d .next.prev/cache ]; then
  # -n (no-clobber): the CI artifact may already ship its own fetch-cache
  # entries — colliding filenames must be skipped, not abort the swap.
  cp -aln .next.prev/cache/. .next/cache/ 2>/dev/null || true
fi
# Drop the build-time sitemap prerender. CI builds run without a real DB, so
# the artifact's sitemap.xml.body is the gutted fallback (~500 URLs instead
# of ~2400) and ISR happily serves it until a restart. Deleting it forces
# the first request to regenerate with real DB data; the runtime outage
# guard in sitemap.ts throws instead of caching a gutted version.
rm -f .next/server/app/sitemap.xml* 2>/dev/null || true
find .next/cache -name '*sitemap*' -delete 2>/dev/null || true

rollback() {
  echo "❌ Rolling back to previous build"
  rm -rf .next
  mv .next.prev .next
  pm2 restart premarketprice --update-env 2>&1 | tail -3 || true
}

echo "=== Restarting PM2 ==="
if pm2 describe premarketprice > /dev/null 2>&1; then
  pm2 restart premarketprice --update-env 2>&1 | tail -3
else
  pm2 start ecosystem.config.cjs --only premarketprice 2>&1 | tail -3
fi
# Register any ecosystem app missing from PM2 (idempotent). pm2 start alone
# does NOT register newly added apps — a silent gap is how the post-market
# cron died. Note: starting a cron app also runs it once immediately, so
# cron routes must be safe to invoke at any time (or self-guard).
# tr normalizes single→double quotes so both quoting styles match.
# A failed cron registration warns but must not fail the whole deploy.
for app in $(tr "'" '"' < ecosystem.config.cjs | grep -o 'name: *"[^"]*"' | cut -d'"' -f2); do
  if ! pm2 describe "$app" > /dev/null 2>&1; then
    echo "registering missing PM2 app: $app"
    pm2 start ecosystem.config.cjs --only "$app" 2>&1 | tail -2 || echo "⚠️  could not register $app — check manually"
  fi
done
pm2 save
sleep 15

echo "=== Testing ==="
code=000
for i in $(seq 1 12); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/ || true)
  [ "$code" = "200" ] && break
  echo "waiting for app ($i/12), got $code"
  sleep 5
done
if [ "$code" != "200" ]; then
  echo "❌ App did not become healthy after deploy"
  pm2 logs premarketprice --lines 30 --nostream || true
  rollback
  exit 1
fi
curl -s -o /dev/null -w 'root=%{http_code}\n' http://localhost:3001/
curl -s -o /dev/null -w 'earnings=%{http_code}\n' http://localhost:3001/earnings
curl -s -o /dev/null -w 'dates=%{http_code}\n' http://localhost:3001/api/earnings/dates
curl -s -o /dev/null -w 'llms=%{http_code}\n' http://localhost:3001/llms.txt

# Content regression guard. The artifact's SSG pages were prerendered in CI
# WITHOUT production data (dummy API keys, no Redis/DB) — they serve an
# empty shell until the first request triggers ISR regeneration. Trigger
# regen for the data-heavy routes first, then poll until real content
# arrives. Note this verifies the DB-backed render (mover links, archive
# dates) — the rank pipeline itself is legitimately empty overnight and
# cannot be checked here.
for p in /premarket-movers /premarket-gainers /premarket-losers /heatmap; do
  curl -s -o /dev/null --max-time 30 "http://localhost:3001$p" || true
done
sleep 10
MOVERS_LINKS=0
for i in $(seq 1 6); do
  MOVERS_HTML=$(curl -s --max-time 30 http://localhost:3001/premarket-movers || true)
  # grep -o | wc -l counts OCCURRENCES — grep -c would count matching LINES
  # and Next serves minified HTML on ~2 lines, so -c always returns ~2.
  MOVERS_LINKS=$(printf '%s' "$MOVERS_HTML" | grep -o '/analysis/' | wc -l || true)
  echo "movers analysis links (try $i/6): $MOVERS_LINKS"
  [ "$MOVERS_LINKS" -ge 15 ] && break
  [ "$i" -lt 6 ] && sleep 15
done
if [ "$MOVERS_LINKS" -lt 15 ]; then
  echo "❌ /premarket-movers has only $MOVERS_LINKS analysis links — data pipeline broken"
  rollback
  exit 1
fi

# Sitemap sanity — trigger regeneration (we deleted the build prerender
# above) and verify it contains DB-backed sections. A gutted sitemap is an
# SEO regression, not an outage, so warn loudly instead of rolling back.
SITEMAP_URLS=0
for i in $(seq 1 4); do
  SITEMAP_URLS=$(curl -s --max-time 60 http://localhost:3001/sitemap.xml | grep -o '<loc>' | wc -l || true)
  echo "sitemap URLs (try $i/4): $SITEMAP_URLS"
  [ "$SITEMAP_URLS" -ge 1000 ] && break
  [ "$i" -lt 4 ] && sleep 15
done
if [ "$SITEMAP_URLS" -lt 1000 ]; then
  echo "⚠️  WARNING: sitemap.xml has only $SITEMAP_URLS URLs (expected ~2400) — DB sections missing, investigate sitemap.ts eligibility queries"
fi

echo "=== Done ==="
