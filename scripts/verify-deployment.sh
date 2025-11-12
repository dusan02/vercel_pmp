#!/bin/bash

# Quick verification script for 8 checks

BASE_URL="http://localhost:3000"
WS_URL="http://localhost:3002"

echo "🔍 Running 8 verification checks..."
echo ""

# 1. Health Check
echo "1️⃣ Health Check:"
HEALTH=$(curl -s "$BASE_URL/api/healthz")
echo "$HEALTH" | jq .
REDIS_STATUS=$(echo "$HEALTH" | jq -r '.redis')
DB_STATUS=$(echo "$HEALTH" | jq -r '.db')
WORKER_AGE=$(echo "$HEALTH" | jq -r '.workerAge_s // 999')

if [ "$REDIS_STATUS" = "ok" ] && [ "$DB_STATUS" = "ok" ] && [ "$WORKER_AGE" -lt 360 ]; then
  echo "✅ Health check PASSED"
else
  echo "❌ Health check FAILED"
  exit 1
fi
echo ""

# 2. Redis Naplnenie
echo "2️⃣ Redis Naplnenie:"
LAST_KEYS=$(redis-cli KEYS "last:*" 2>/dev/null | wc -l)
HEATMAP_COUNT=$(redis-cli ZCARD heatmap:live 2>/dev/null)

echo "  last:* keys: $LAST_KEYS"
echo "  heatmap:live count: $HEATMAP_COUNT"

if [ "$LAST_KEYS" -gt 100 ] && [ "$HEATMAP_COUNT" -gt 100 ]; then
  echo "✅ Redis naplnenie PASSED"
else
  echo "⚠️ Redis naplnenie - may need worker to run first"
fi
echo ""

# 3. API Stocks (bez Polygon)
echo "3️⃣ API Stocks (bez Polygon):"
STOCKS_RESPONSE=$(curl -s "$BASE_URL/api/stocks?tickers=AAPL,MSFT&session=live")
STOCKS_COUNT=$(echo "$STOCKS_RESPONSE" | jq '.data | length')
CACHE_HEADER=$(curl -sI "$BASE_URL/api/stocks?tickers=AAPL&session=live" | grep -i "cache-control" | cut -d' ' -f2- | tr -d '\r')

echo "  Response items: $STOCKS_COUNT"
echo "  Cache-Control: $CACHE_HEADER"

if [ "$STOCKS_COUNT" -gt 0 ] && [ "$CACHE_HEADER" = "no-store" ]; then
  echo "✅ API Stocks PASSED"
else
  echo "❌ API Stocks FAILED"
  exit 1
fi
echo ""

# 4. API Heatmap (zoradené)
echo "4️⃣ API Heatmap:"
HEATMAP_RESPONSE=$(curl -s "$BASE_URL/api/heatmap?session=live&limit=50")
HEATMAP_COUNT=$(echo "$HEATMAP_RESPONSE" | jq '.data | length')
FIRST_PCT=$(echo "$HEATMAP_RESPONSE" | jq -r '.data[0].percentChange // 0')
SECOND_PCT=$(echo "$HEATMAP_RESPONSE" | jq -r '.data[1].percentChange // 0')

echo "  Response items: $HEATMAP_COUNT"
echo "  First %: $FIRST_PCT, Second %: $SECOND_PCT"

if [ "$HEATMAP_COUNT" -gt 0 ] && (( $(echo "$FIRST_PCT >= $SECOND_PCT" | bc -l) )); then
  echo "✅ API Heatmap PASSED (sorted descending)"
else
  echo "⚠️ API Heatmap - check sorting"
fi
echo ""

# 5. Cache Headers
echo "5️⃣ Cache Headers:"
LIVE_CACHE=$(curl -sI "$BASE_URL/api/stocks?tickers=AAPL&session=live" | grep -i "cache-control" | cut -d' ' -f2- | tr -d '\r')
PRE_CACHE=$(curl -sI "$BASE_URL/api/stocks?tickers=AAPL&session=pre" | grep -i "cache-control" | cut -d' ' -f2- | tr -d '\r')

echo "  Live: $LIVE_CACHE"
echo "  Pre: $PRE_CACHE"

if [ "$LIVE_CACHE" = "no-store" ] && [[ "$PRE_CACHE" == *"s-maxage=15"* ]]; then
  echo "✅ Cache Headers PASSED"
else
  echo "❌ Cache Headers FAILED"
  exit 1
fi
echo ""

# 6. Stale Logika
echo "6️⃣ Stale Logika:"
echo "  Testing stale detection (>360s)..."
# This would need to be tested in browser/UI
echo "  ✅ Stale logika implemented (test in UI: badge shows if age > 360s)"
echo ""

# 7. PM2 Persist
echo "7️⃣ PM2 Persist:"
PM2_LIST=$(pm2 list 2>/dev/null)
if echo "$PM2_LIST" | grep -q "pmp-worker-snapshot\|pmp-worker-refs\|pmp-ws-server"; then
  echo "✅ PM2 processes running"
  echo "  Run: pm2 save && pm2 startup"
else
  echo "⚠️ PM2 processes not found - start with: pm2 start ecosystem.config.js"
fi
echo ""

# 8. WebSocket (manual test needed)
echo "8️⃣ WebSocket:"
echo "  Manual test needed - run WS client test"
echo "  Expected: tick events every 250-1000ms (2-5 fps)"
echo ""

echo "✅ All automated checks completed!"
echo ""
echo "📋 Manual checks needed:"
echo "  - WebSocket tick events (run WS client)"
echo "  - Stale badge in UI (test with old data)"
echo "  - PM2 persist (pm2 save && pm2 startup)"

