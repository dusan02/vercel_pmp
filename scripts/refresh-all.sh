#!/bin/bash
# Refresh all tickers analysis data
# Usage: ssh root@SERVER 'bash /var/www/premarketprice/scripts/refresh-all.sh'

# Kill any existing refresh process
pkill -f "refresh-all-tickers" 2>/dev/null
sleep 1

# Clear old log
rm -f /tmp/refresh-all.log

# Start fresh
cd /var/www/premarketprice
setsid npx tsx src/scripts/refresh-all-tickers.ts > /tmp/refresh-all.log 2>&1 &
PID=$!

echo "✅ Refresh started. PID: $PID"
echo "📋 Log: /tmp/refresh-all.log"
echo "🔍 Check: tail -5 /tmp/refresh-all.log"
