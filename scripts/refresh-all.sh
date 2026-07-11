#!/bin/bash
# Refresh all tickers analysis data via pm2
# Usage: ssh root@SERVER 'bash /var/www/premarketprice/scripts/refresh-all.sh'

cd /var/www/premarketprice

# Stop any existing refresh process
pm2 delete refresh-all 2>/dev/null

# Clear old log
rm -f /tmp/refresh-all.log

# Start via pm2 (survives SSH disconnect, auto-deletes when done)
pm2 start npx --name refresh-all -- tsx src/scripts/refresh-all-tickers.ts

echo "✅ Refresh started via pm2"
echo "⏱️  Takes ~12 minutes for 597 tickers"
echo "📋 Check: pm2 logs refresh-all --lines 5 --nostream"
echo "🧹 Auto-deletes when finished (script calls process.exit)"
