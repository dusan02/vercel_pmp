#!/bin/bash
# ============================================================
# Production Health Check - PreMarketPrice
# Usage: bash scripts/prod-health.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✅ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; }
info() { echo -e "  ${BLUE}ℹ️  $1${NC}"; }

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  🏥 PRODUCTION HEALTH CHECK - $(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"

# ── 1. PM2 PROCESSES ─────────────────────────────────────────
echo ""
echo -e "${BOLD}📋 PM2 PROCESSES${NC}"

check_pm2_process() {
  local name=$1
  local status
  status=$(pm2 jlist 2>/dev/null | node -e "
    const list = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const p = list.find(p => p.name === '$name');
    if (!p) { process.stdout.write('missing'); process.exit(); }
    process.stdout.write(p.pm2_env.status + ':' + p.pid + ':' + Math.round(p.monit?.memory/1024/1024) + 'MB');
  " 2>/dev/null)
  
  if [[ "$status" == "online"* ]]; then
    local pid=$(echo $status | cut -d: -f2)
    local mem=$(echo $status | cut -d: -f3)
    ok "$name → online (PID: $pid, Mem: $mem)"
  elif [[ "$status" == "stopped"* ]]; then
    warn "$name → stopped (expected for cron jobs)"
  elif [[ "$status" == "missing" ]]; then
    fail "$name → NOT FOUND in PM2"
  else
    fail "$name → $status"
  fi
}

check_pm2_process "premarketprice"
check_pm2_process "pmp-polygon-worker"
check_pm2_process "pmp-bulk-preloader"

# Restart count warnings
RESTART_COUNT=$(pm2 jlist 2>/dev/null | node -e "
  const list = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const p = list.find(p => p.name === 'pmp-polygon-worker');
  if(p) process.stdout.write(String(p.pm2_env.restart_time));
" 2>/dev/null)
if [ -n "$RESTART_COUNT" ]; then
  if [ "$RESTART_COUNT" -gt 100 ]; then
    warn "pmp-polygon-worker restarted ${RESTART_COUNT}x (high! check crash logs)"
  else
    info "pmp-polygon-worker restarts: ${RESTART_COUNT}x"
  fi
fi

# ── 2. REDIS ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🗄️  REDIS${NC}"

if redis-cli ping 2>/dev/null | grep -q "PONG"; then
  ok "Redis is responding"
  
  UNIVERSE_SIZE=$(redis-cli SCARD universe:sp500 2>/dev/null)
  if [ "$UNIVERSE_SIZE" -gt 300 ]; then
    ok "Universe: ${UNIVERSE_SIZE} tickers in universe:sp500"
  elif [ "$UNIVERSE_SIZE" -gt 0 ]; then
    warn "Universe: only ${UNIVERSE_SIZE} tickers (expected ~359)"
  else
    fail "Universe: EMPTY! Run: ./node_modules/.bin/tsx scripts/populate-universe.ts"
  fi

  # Check recent price keys in Redis
  PRICE_KEYS=$(redis-cli KEYS "price:*:live" 2>/dev/null | wc -l)
  if [ "$PRICE_KEYS" -gt 50 ]; then
    ok "Redis price keys: ${PRICE_KEYS} live prices cached"
  elif [ "$PRICE_KEYS" -gt 0 ]; then
    warn "Redis price keys: only ${PRICE_KEYS} live prices (low)"
  else
    info "Redis price keys: 0 live prices (normal outside trading hours)"
  fi
else
  fail "Redis is NOT responding!"
fi

# ── 3. DATABASE ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}🐘 DATABASE${NC}"

DB_CHECK=$(node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  try {
    const count = await prisma.ticker.count();
    const stale = await prisma.ticker.count({
      where: { updatedAt: { lt: new Date(Date.now() - 2*3600*1000) } }
    });
    const fresh = count - stale;
    console.log('OK:' + count + ':' + fresh + ':' + stale);
  } catch(e) {
    console.log('ERROR:' + e.message.split('\n')[0]);
  } finally {
    await prisma.\$disconnect();
  }
}
main();
" 2>/dev/null)

if [[ "$DB_CHECK" == OK:* ]]; then
  TOTAL=$(echo $DB_CHECK | cut -d: -f2)
  FRESH=$(echo $DB_CHECK | cut -d: -f3)
  STALE=$(echo $DB_CHECK | cut -d: -f4)
  ok "Database connected: ${TOTAL} tickers total"
  if [ "$STALE" -gt 50 ]; then
    warn "Stale prices (>2h): ${STALE} tickers (normal during off-hours)"
  else
    ok "Fresh prices (<2h): ${FRESH} tickers"
  fi
else
  fail "Database error: $DB_CHECK"
fi

# ── 4. RECENT WORKER ACTIVITY ────────────────────────────────
echo ""
echo -e "${BOLD}⚙️  WORKER ACTIVITY (last 5 min)${NC}"

LOG_FILE="/var/www/premarketprice/logs/pm2/polygon-worker-out-1.log"
if [ -f "$LOG_FILE" ]; then
  LAST_LOG=$(tail -n 1 "$LOG_FILE" | awk '{print $1, $2}')
  INGEST_COUNT=$(tail -n 50 "$LOG_FILE" | grep -c "snapshot batch\|Ingesting\|tickers processed" 2>/dev/null || echo 0)
  SKIP_COUNT=$(tail -n 10 "$LOG_FILE" | grep -c "skipping ingest\|Weekend/Holiday" 2>/dev/null || echo 0)
  ERROR_COUNT=$(tail -n 50 "$LOG_FILE" | grep -c "ERROR\|error\|failed" 2>/dev/null || echo 0)
  
  info "Last log entry: $LAST_LOG"
  
  if [ "$SKIP_COUNT" -gt 0 ]; then
    warn "Worker is skipping ingest (market closed / off-hours)"
  elif [ "$INGEST_COUNT" -gt 0 ]; then
    ok "Worker actively ingesting data (${INGEST_COUNT} events in last 50 lines)"
  else
    warn "No recent ingest activity detected"
  fi

  if [ "$ERROR_COUNT" -gt 5 ]; then
    fail "High error count in recent logs: ${ERROR_COUNT} errors"
    info "Run: pm2 logs pmp-polygon-worker --lines 30 --err"
  fi
else
  fail "Worker log file not found: $LOG_FILE"
fi

# Recent error log
ERR_FILE="/var/www/premarketprice/logs/pm2/polygon-worker-error-1.log"
if [ -f "$ERR_FILE" ]; then
  RECENT_ERRORS=$(tail -n 20 "$ERR_FILE" | grep -c "Error\|error\|P2025\|ECONNREFUSED" 2>/dev/null || echo 0)
  if [ "$RECENT_ERRORS" -gt 0 ]; then
    warn "Recent errors in error log (${RECENT_ERRORS} lines) - check: pm2 logs pmp-polygon-worker --err"
  else  
    ok "No critical errors in recent error log"
  fi
fi

# ── 5. MARKET SESSION ─────────────────────────────────────────
echo ""
echo -e "${BOLD}🕐 MARKET SESSION${NC}"

SESSION_INFO=$(node -e "
const { Intl } = global;
const now = new Date();
const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false }).format(now);
const etParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
const dow = etParts.find(p => p.type === 'weekday')?.value;
const h = parseInt(etParts.find(p => p.type === 'hour')?.value);
const m = parseInt(etParts.find(p => p.type === 'minute')?.value);
const mins = h * 60 + m;
let session = 'unknown';
if (dow === 'Saturday' || (dow === 'Sunday' && mins < 1080)) session = 'WEEKEND_CLOSED';
else if (mins >= 240 && mins < 570) session = 'PRE_MARKET';
else if (mins >= 570 && mins < 960) session = 'LIVE';
else if (mins >= 960 && mins < 1200) session = 'AFTER_HOURS';
else session = 'OVERNIGHT_CLOSED';
console.log(et + ' ET | Session: ' + session);
" 2>/dev/null)

info "Current time: $SESSION_INFO"

# ── 6. DISK & MEMORY ─────────────────────────────────────────
echo ""
echo -e "${BOLD}💻 SYSTEM RESOURCES${NC}"

MEM_AVAIL=$(free -m | awk 'NR==2{printf "%.0f%%", $7/$2*100}')
DISK_USE=$(df -h / | awk 'NR==2{print $5}')
LOAD=$(uptime | awk -F'load average:' '{print $2}' | xargs)

info "Memory available: ${MEM_AVAIL}"
info "Disk usage (/): ${DISK_USE}"
info "Load average: ${LOAD}"

DISK_PCT=$(df / | awk 'NR==2{print $5}' | tr -d '%')
if [ "$DISK_PCT" -gt 85 ]; then
  fail "Disk is ${DISK_USE} used - dangerously full!"
elif [ "$DISK_PCT" -gt 70 ]; then
  warn "Disk is ${DISK_USE} used"
else
  ok "Disk OK (${DISK_USE} used)"
fi

# ── SUMMARY ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Useful commands:${NC}"
echo -e "  pm2 logs pmp-polygon-worker --lines 20"
echo -e "  redis-cli SCARD universe:sp500"
echo -e "  ./node_modules/.bin/tsx scripts/check-worker-status.ts"
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
