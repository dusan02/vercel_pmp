# 🚀 Nastavenie produkcie - Automatické spúšťanie procesov

## 📋 Prehľad

Tento dokument popisuje, ako sú nastavené automatické procesy (crony, workers) na produkcii a ako ich spustiť lokálne.

## 🔄 Automatické procesy

### 1. **Server (Next.js + WebSocket)**
- **Súbor:** `server.ts`
- **Spustenie:** `npm run dev:server` alebo `npm run start`
- **Funkcie:**
  - Next.js API server
  - WebSocket server (Socket.io)
  - Sector/Industry Scheduler (denne o 02:00 UTC)
- **Status:** ✅ Automaticky spustený pri štarte servera

### 2. **Polygon Worker (Snapshot Mode)**
- **Súbor:** `src/workers/polygonWorker.ts`
- **Spustenie:** `MODE=snapshot npx tsx src/workers/polygonWorker.ts`
- **Funkcie:**
  - Kontinuálne načítava ceny z Polygon API
  - Update každých 60s (premium tickery) alebo 5min (ostatné)
  - Automaticky detekuje market session (pre-market, live, after-hours)
- **PM2 Config:** `ecosystem.config.js` → `pmp-polygon-worker`
- **Status:** ⚠️ Musí byť spustený manuálne alebo cez PM2

### 3. **Refs Worker**
- **Súbor:** `src/workers/polygonWorker.ts`
- **Spustenie:** `MODE=refs npx tsx src/workers/polygonWorker.ts`
- **Funkcie:**
  - Načítava previous closes a regular closes
  - Beží raz denne
- **PM2 Config:** `ecosystem.config.js` → `pmp-refs-worker`
- **Status:** ⚠️ Musí byť spustený manuálne alebo cez PM2

### 4. **Bulk Preloader**
- **Súbor:** `src/workers/backgroundPreloader.ts`
- **Spustenie:** `npx tsx src/workers/backgroundPreloader.ts`
- **Funkcie:**
  - Pre-loaduje dáta pre bulk endpoints
  - Beží každých 5 minút počas trading hours
- **PM2 Config:** `ecosystem.config.js` → `pmp-bulk-preloader` (cron: `*/5 13-20 * * 1-5`)
- **Status:** ⚠️ Musí byť spustený manuálne alebo cez PM2

## 📅 Cron Jobs (Vercel)

### Vercel Cron Jobs
Definované v `vercel.json`:
- **Verify Sector/Industry:** `0 2 * * *` (denne o 02:00 UTC)
- **Update Static Data:** `0 6 * * *` (denne o 06:00 UTC)

### Lokálne Schedulery
- **Sector/Industry Scheduler:** Automaticky spustený v `server.ts` (denne o 02:00 UTC)

## 🔧 Spustenie všetkých procesov

### Lokálne (Development)

```bash
# 1. Spustiť server (Next.js + WebSocket + Scheduler)
npm run dev:server

# 2. Spustiť Polygon Worker (v novom termináli)
MODE=snapshot ENABLE_WEBSOCKET=true npx tsx src/workers/polygonWorker.ts

# 3. (Voliteľné) Spustiť Refs Worker
MODE=refs ENABLE_WEBSOCKET=true npx tsx src/workers/polygonWorker.ts

# 4. (Voliteľné) Force Ingest pre aktuálne dáta
npx tsx scripts/force-ingest.ts
```

### Produkcia (PM2)

```bash
# 1. Spustiť všetky procesy cez PM2
pm2 start ecosystem.config.js

# 2. Kontrola statusu
pm2 status

# 3. Logy
pm2 logs

# 4. Restart
pm2 restart ecosystem.config.js

# 5. Stop
pm2 stop ecosystem.config.js
```

### Produkcia (Vercel)

**Automatické:**
- Cron jobs bežia automaticky podľa `vercel.json`
- Server beží automaticky po deploy

**Workers:**
- Musia bežať ako samostatné procesy (napr. na VPS alebo cez externý service)
- Alebo použiť Vercel Cron Jobs pre jednorazové úlohy

## ⚠️ Dôležité poznámky

### 1. **Pricing State Machine**
- Počas víkendu/holiday: `canIngest: false`
- Pre force ingest: použiť `force=true` parameter
- Skript: `scripts/force-ingest.ts` (používa `force=true`)

### 2. **PM2 Interpreter**
- PM2 nemôže nájsť `tsx` priamo
- Riešenie: Použiť `npx tsx` alebo upraviť `ecosystem.config.js`:
  ```js
  interpreter: 'npx',
  interpreter_args: 'tsx'
  ```

### 3. **Redis**
- Ak Redis nie je dostupný, používa sa in-memory cache
- Pre produkciu: Nastaviť `UPSTASH_REDIS_REST_URL` a `UPSTASH_REDIS_REST_TOKEN`

## 📊 Monitoring

### API Endpoints
- **Health:** `http://localhost:3000/api/health`
- **WebSocket Status:** `http://localhost:3000/api/websocket`
- **Cron Status:** `http://localhost:3000/api/cron/status`

### Scripts
- **Monitor Worker Progress:** `npm run bulk:monitor`
- **Check DB Progress:** `npm run bulk:check-db`
- **Check Status:** `npm run bulk:status`

## ✅ Checklist pre produkciu

- [ ] Server beží (`npm run start` alebo PM2)
- [ ] WebSocket server aktívny (`/api/websocket`)
- [ ] Sector/Industry Scheduler aktívny (`/api/cron/status`)
- [ ] Polygon Worker beží (`MODE=snapshot`)
- [ ] Refs Worker beží (`MODE=refs`) - voliteľné
- [ ] Redis nakonfigurovaný (pre produkciu)
- [ ] Cron jobs nastavené (Vercel alebo PM2)
- [ ] Force ingest spustený (ak je víkend/holiday)

## 🔍 Riešenie problémov

### Worker nebeží
1. Skontrolovať PM2 status: `pm2 status`
2. Skontrolovať logy: `pm2 logs pmp-polygon-worker`
3. Spustiť manuálne: `MODE=snapshot npx tsx src/workers/polygonWorker.ts`

### Staré ceny
1. Skontrolovať, či worker beží
2. Spustiť force ingest: `npx tsx scripts/force-ingest.ts`
3. Skontrolovať pricing state: `http://localhost:3000/api/cron/status`

### WebSocket nefunguje
1. Skontrolovať `ENABLE_WEBSOCKET=true`
2. Skontrolovať status: `http://localhost:3000/api/websocket`
3. Skontrolovať logy servera

