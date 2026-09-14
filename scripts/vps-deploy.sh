#!/bin/bash
# Manual fallback deploy — the normal path is GitHub Actions (.github/workflows/deploy.yml).
set -e
# CRITICAL: `npm run build 2>&1 | tail -20` masks the build's exit code
# (pipeline status = tail's status). Without pipefail a FAILED build fell
# through to `pm2 restart` → app crash-looped on an incomplete .next → 502.
set -o pipefail
cd /var/www/premarketprice

echo "=== Killing stale build processes ==="
# [n] bracket trick — never match this script's own command line
pkill -f "[n]ext build" 2>/dev/null || true
sleep 2

echo "=== Updating git remote ==="
git remote set-url origin https://github.com/dusan02/vercel_pmp.git
git fetch origin main 2>&1 | tail -3

echo "=== Resetting to origin/main ==="
git reset --hard origin/main 2>&1 | tail -3

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

echo "=== Building (heap capped for shared 4GB VPS) ==="
export NODE_OPTIONS="--max-old-space-size=1536"
# Retry loop: the RUNNING app writes ISR cache files into .next during the
# build's cleanup — an occasional ENOTEMPTY race kills one attempt; a retry
# almost always succeeds. With pipefail + set -e, 3 failed attempts stop the
# deploy safely BEFORE pm2 restart (the previous build keeps serving).
BUILD_OK=0
for attempt in 1 2 3; do
  echo "--- build attempt $attempt/3 ---"
  if npm run build 2>&1 | tail -20; then
    BUILD_OK=1
    break
  fi
  echo "build attempt $attempt failed"
  sleep 5
done
if [ "$BUILD_OK" != "1" ]; then
  echo "❌ Build failed 3× — keeping the previous build live, aborting deploy"
  exit 1
fi

echo "=== Build complete ==="
cat .next/BUILD_ID
echo

echo "=== Restarting PM2 ==="
if pm2 describe premarketprice > /dev/null 2>&1; then
  pm2 restart premarketprice --update-env 2>&1 | tail -3
else
  pm2 start ecosystem.config.cjs --only premarketprice 2>&1 | tail -3
fi
# Register cron apps that are new in this release (idempotent)
pm2 start ecosystem.config.cjs --only cron-blog-snapshot 2>/dev/null || pm2 restart cron-blog-snapshot
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
  exit 1
fi
curl -s -o /dev/null -w 'root=%{http_code}\n' http://localhost:3001/
curl -s -o /dev/null -w 'earnings=%{http_code}\n' http://localhost:3001/earnings
curl -s -o /dev/null -w 'dates=%{http_code}\n' http://localhost:3001/api/earnings/dates
curl -s -o /dev/null -w 'llms=%{http_code}\n' http://localhost:3001/llms.txt

echo "=== Done ==="
