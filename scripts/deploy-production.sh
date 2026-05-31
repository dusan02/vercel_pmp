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

echo "▶ [3/5] Build"
npm run build

echo "▶ [4/5] Start PM2"
pm2 start ecosystem.config.cjs --only "$APP" --env production

echo "▶ [5/5] Reload nginx (config changes)"
cp "$DIR/nginx.conf" /etc/nginx/nginx.conf && nginx -t && nginx -s reload

echo ""
echo "✅ Deploy complete"
pm2 list --no-color | grep "$APP"
