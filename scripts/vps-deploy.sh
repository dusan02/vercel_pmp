#!/bin/bash
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

echo "=== Installing dependencies ==="
corepack enable pnpm 2>&1 || true
corepack pnpm install 2>&1 | tail -5

echo "=== Prisma generate ==="
npx prisma generate 2>&1 | tail -3

echo "=== Building ==="
npx next build --webpack 2>&1 | tail -20

echo "=== Build complete ==="
cat .next/BUILD_ID
echo

echo "=== Restarting PM2 ==="
pm2 delete premarketprice 2>&1 || true
sleep 2
pm2 start ecosystem.config.cjs --only premarketprice 2>&1 | tail -3
sleep 15

echo "=== Testing ==="
curl -s -o /dev/null -w 'earnings=%{http_code}\n' http://localhost:3000/earnings
curl -s -o /dev/null -w 'dates=%{http_code}\n' http://localhost:3000/api/earnings/dates
curl -s -o /dev/null -w 'date-route=%{http_code}\n' http://localhost:3000/earnings/date/2026-09-10
curl -s -o /dev/null -w 'root=%{http_code}\n' http://localhost:3000/

echo "=== Done ==="
