#!/bin/bash
# Production Health Check Script for PreMarketPrice
# Usage: ssh root@89.185.250.213 'bash -s' < scripts/health-check-prod.sh

set -e
cd /var/www/premarketprice

echo "=============================================="
echo " PMP Production Health Check"
echo " $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=============================================="

# 1. NGINX
echo ""
echo "=== NGINX STATUS ==="
if systemctl is-active --quiet nginx; then
  echo "✅ nginx: running"
else
  echo "❌ nginx: NOT RUNNING"
  systemctl status nginx --no-pager -l 2>&1 | tail -5
fi

echo ""
echo "=== NGINX ERRORS (last 24h) ==="
NGINX_ERRORS=$(find /var/log/nginx/error.log -mmin -1440 -exec grep -c "error\|502\|503\|504" {} \; 2>/dev/null || echo "0")
echo "Error count: $NGINX_ERRORS"
if [ "$NGINX_ERRORS" -gt "0" ] 2>/dev/null; then
  echo "Recent errors:"
  tail -20 /var/log/nginx/error.log | grep -i "error\|502\|503\|504" | tail -5
fi

echo ""
echo "=== NGINX ACCESS - Bad Status Codes (last 100 requests) ==="
tail -100 /var/log/nginx/access.log 2>/dev/null | awk '{print $9}' | sort | uniq -c | sort -rn | head -10

# 2. PM2 Processes
echo ""
echo "=== PM2 PROCESSES ==="
pm2 jlist 2>/dev/null | python3 -c '
import sys,json
ps=json.load(sys.stdin)
for p in ps:
    e=p["pm2_env"]
    name=p["name"].ljust(35)
    status=e["status"]
    restarts=e["restart_time"]
    icon="✅" if status=="online" or (status=="stopped" and e.get("cron_restart")) else "❌"
    if status=="stopped" and e.get("cron_restart"):
        status="waiting (cron)"
    print(f"  {icon} {name} {status.ljust(18)} restarts: {restarts}")
' 2>/dev/null || pm2 list

# 3. App HTTP checks
echo ""
echo "=== HTTP ENDPOINT CHECKS ==="
for endpoint in "/" "/api/healthz" "/api/health" "/api/health/worker" "/api/health/redis"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:3000${endpoint}" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ]; then
    echo "  ✅ $endpoint -> $CODE"
  else
    echo "  ❌ $endpoint -> $CODE"
  fi
done

# 4. External check (via nginx)
echo ""
echo "=== EXTERNAL ACCESS ==="
EXT_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://premarketprice.com/" 2>/dev/null || echo "000")
if [ "$EXT_CODE" = "200" ]; then
  echo "  ✅ https://premarketprice.com/ -> $EXT_CODE"
else
  echo "  ❌ https://premarketprice.com/ -> $EXT_CODE"
fi

# 5. Redis
echo ""
echo "=== REDIS ==="
REDIS_PING=$(redis-cli ping 2>/dev/null)
if [ "$REDIS_PING" = "PONG" ]; then
  echo "  ✅ Redis: PONG"
  UNIVERSE=$(redis-cli SCARD universe:sp500 2>/dev/null)
  echo "  Universe tickers: $UNIVERSE"
  MEM=$(redis-cli INFO memory 2>/dev/null | grep used_memory_human | tr -d '\r')
  echo "  Memory: $MEM"
else
  echo "  ❌ Redis: NOT RESPONDING"
fi

# 6. Database
echo ""
echo "=== DATABASE ==="
DB_FILE="prisma/data/premarket.db"
if [ -f "$DB_FILE" ]; then
  SIZE=$(du -h "$DB_FILE" | cut -f1)
  echo "  ✅ SQLite DB exists: $SIZE"
  TICKER_COUNT=$(node -e 'const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.ticker.count().then(c=>{console.log(c);p.$disconnect()})' 2>/dev/null)
  echo "  Ticker count: $TICKER_COUNT"
else
  echo "  ❌ SQLite DB not found!"
fi

# 7. Disk & Memory
echo ""
echo "=== SYSTEM RESOURCES ==="
echo "Disk:"
df -h / | tail -1 | awk '{print "  Used: "$3" / "$2" ("$5" full)"}'
echo "Memory:"
free -h | grep Mem | awk '{print "  Used: "$3" / "$2" (available: "$7")"}'
echo "Load:"
uptime | awk -F'load average:' '{print "  "$2}'

# 8. Recent PM2 errors (last hour)
echo ""
echo "=== RECENT ERRORS (last 1h) ==="
for logfile in logs/pm2/*-error*.log; do
  RECENT=$(find "$logfile" -mmin -60 2>/dev/null)
  if [ -n "$RECENT" ]; then
    ERRORS=$(awk -v cutoff="$(date -d '1 hour ago' '+%Y-%m-%d %H:%M' 2>/dev/null || date -v-1H '+%Y-%m-%d %H:%M')" '$0 >= cutoff' "$logfile" 2>/dev/null | grep -ci "error\|fatal\|crash\|ECONNREFUSED\|timeout" 2>/dev/null || echo "0")
    if [ "$ERRORS" -gt "0" ] 2>/dev/null; then
      BASENAME=$(basename "$logfile")
      echo "  ⚠️  $BASENAME: $ERRORS error(s)"
    fi
  fi
done
echo "  (check with: pm2 logs --err --nostream --lines 20)"

# 9. SSL Certificate
echo ""
echo "=== SSL CERTIFICATE ==="
EXPIRY=$(echo | openssl s_client -servername premarketprice.com -connect premarketprice.com:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$EXPIRY" ]; then
  echo "  Expires: $EXPIRY"
else
  echo "  ⚠️  Could not check SSL"
fi

echo ""
echo "=============================================="
echo " Health check complete"
echo "=============================================="
