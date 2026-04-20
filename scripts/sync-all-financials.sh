#!/bin/bash
# Daily sync of all financial statements from Finnhub
# Recommended cron: 0 4 * * * /var/www/premarketprice/scripts/sync-all-financials.sh >> /var/log/pmp-sync-financials.log 2>&1

cd /var/www/premarketprice || exit 1

echo "=== Financial Sync Started: $(date -u) ==="

COUNT=0
TOTAL=$(sqlite3 prisma/data/premarket.db "SELECT COUNT(DISTINCT symbol) FROM Ticker;")

sqlite3 prisma/data/premarket.db "SELECT symbol FROM Ticker ORDER BY symbol;" | while IFS= read -r t; do
  COUNT=$((COUNT + 1))
  curl -s -X POST "http://localhost:3000/api/analysis/$t" > /dev/null 2>&1
  echo "[$COUNT/$TOTAL] $t"
  sleep 1.2
done

echo "=== Financial Sync Completed: $(date -u) ==="
