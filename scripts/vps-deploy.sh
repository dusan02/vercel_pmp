#!/bin/bash
# Manual fallback deploy — the normal path is GitHub Actions (.github/workflows/deploy.yml).
set -e
cd /var/www/premarketprice

echo "=== Killing stale build processes ==="
pkill -f "next build" 2>/dev/null || true
sleep 2

echo "=== Updating git remote ==="
git remote set-url origin https://github.com/dusan02/vercel_pmp.git
git fetch origin main 2>&1 | tail -3

echo "=== Resetting to origin/main ==="
git reset --hard origin/main 2>&1 | tail -3

echo "=== Installing dependencies (incremental) ==="
npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -5

echo "=== Prisma generate ==="
npx prisma generate 2>&1 | tail -3

echo "=== Building (heap capped for shared 4GB VPS) ==="
export NODE_OPTIONS="--max-old-space-size=1536"
npm run build 2>&1 | tail -20

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
curl -s -o /dev/null -w 'root=%{http_code}\n' http://localhost:3001/
curl -s -o /dev/null -w 'earnings=%{http_code}\n' http://localhost:3001/earnings
curl -s -o /dev/null -w 'dates=%{http_code}\n' http://localhost:3001/api/earnings/dates
curl -s -o /dev/null -w 'llms=%{http_code}\n' http://localhost:3001/llms.txt

echo "=== Done ==="
