#!/bin/bash
# Safe zero-502 deploy script for premarketprice
# Usage: ./scripts/deploy-production.sh
set -e

APP="premarketprice"
DIR="/var/www/premarketprice"

echo "▶ [1/5] Git pull"
cd "$DIR" && git pull origin main

echo "▶ [2/5] Stop PM2 before build (prevents crash loop during next build)"
pm2 stop "$APP" || true

echo "▶ [3/5] Build (memory-limited to protect Docker containers on shared host)"
# Cap Node.js heap at 1.5GB so next build doesn't trigger OOM killer
# on Docker containers (verifa_arq_worker etc.) sharing the 8GB server.
# 4GB swap was added to absorb peak usage without killing processes.
NODE_OPTIONS="--max-old-space-size=1536" npm run build

echo "▶ [4/5] Start PM2"
pm2 start ecosystem.config.cjs --only "$APP" --env production
pm2 restart pmp-polygon-worker 2>/dev/null || true
pm2 restart post-market-daily-reset 2>/dev/null || true

echo "▶ [5/5] Reload nginx (config changes)"
cp "$DIR/nginx.conf" /etc/nginx/nginx.conf && nginx -t && nginx -s reload

echo ""
echo "✅ Deploy complete"
pm2 list --no-color | grep "$APP"
