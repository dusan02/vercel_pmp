# 📊 Report: Fetchovanie dát v PremarketPrice.com

## 🎯 Prehľad

Aplikácia **premarketprice.com** je zameraná na zobrazenie **pre-market cien** pre všetky tickery. Systém automaticky načítava a aktualizuje dáta 24/7, s dôrazom na pre-market session (4:00-9:30 ET).

---

## 🔄 Logika fetchovania dát

### 1. **Polygon Worker (Hlavný proces)**

**Súbor:** `src/workers/polygonWorker.ts`

#### A. Batch Ingest Proces

```
1. Fetch snapshot z Polygon API (batch 60-70 tickerov)
   ↓
2. Normalizácia dát (extrahovanie cien z min.c/day.c/lastTrade)
   ↓
3. Výpočet market cap a percent change
   ↓
4. Upsert do DB (Ticker, SessionPrice, DailyRef)
   ↓
5. Zapísanie do Redis (hot cache + ranking indexes)
   ↓
6. Publikovanie do Redis Pub/Sub (pre WebSocket updates)
```

#### B. Session Detection

Worker automaticky detekuje aktuálnu session podľa ET času:

- **Pre-market:** 4:00-9:30 ET → Načítava pre-market ceny (`min.c`)
- **Live trading:** 9:30-16:00 ET → Načítava live ceny (`day.c`, `lastTrade.p`)
- **After-hours:** 16:00-20:00 ET → Načítava after-hours ceny (`min.c`)
- **Closed:** 20:00-4:00 ET (pracovný deň) → Načítava dostupné ceny
- **Weekend/Holiday:** Iba bootstrap previous closes

#### C. Prioritizácia Tickerov

- **Premium tickery (top 200):** Update každých **60 sekúnd** (live trading)
- **Ostatné tickery:** Update každých **5 minút**
- **Pre-market/After-hours:** Všetky tickery každých **5 minút**

#### D. Rate Limiting

- **Polygon API limit:** 5 req/s = 300 req/min
- **Konzervatívny limit:** 250 req/min (zostáva buffer)
- **Batch size:** 60-70 tickerov na request
- **Delay medzi batchmi:** ~17 sekúnd

#### E. Circuit Breaker

- **Threshold:** 5 failures za 2 minúty
- **Recovery:** Automatické po 60 sekundách
- **Ochrana:** Predchádza preťaženiu API pri chybách

---

### 2. **Normalizácia dát**

**Funkcia:** `normalizeSnapshot()`

Priorita zdrojov cien:

1. `lastTrade.p` (najaktuálnejšia cena)
2. `lastQuote.p` (quote cena)
3. `min.c` (pre-market/after-hours cena) ⭐ **KRITICKÉ PRE PRE-MARKET**
4. `day.c` (denná zatváracia cena)

**Problém riešený:** Predtým používala `day.c`, ktoré je `0` keď je trh zatvorený. Teraz používa `min.c` pre pre-market ceny.

---

### 3. **Worker Loop**

**Interval:** Kontrola každých **30 sekúnd**

**Logika:**

```typescript
if (session === "closed" && isWeekendOrHoliday) {
  // Iba bootstrap previous closes
} else {
  // INGEST DÁTA - aj pre pre-market/after-hours!
  // Pre-market: každých 5 min
  // Live: premium 60s, ostatné 5min
}
```

**Kľúčová zmena:** Worker **NEPRESTÁVA** načítavať dáta keď je trh zatvorený (okrem víkendov/sviatkov). To je kritické pre premarketprice.com!

---

## 💾 Ukladanie dát

### 1. **Database (SQLite + Prisma)**

#### A. Ticker Tabuľka

```prisma
model Ticker {
  symbol              String    @id
  name                String?
  sector              String?
  industry            String?
  sharesOutstanding   Float?

  // Cached values pre sorting
  lastPrice         Float?
  lastChangePct     Float?
  lastMarketCap     Float?
  lastMarketCapDiff Float?
  lastPriceUpdated  DateTime?
}
```

**Použitie:**

- Statické dáta (názov, sektor, odvetvie)
- Cached hodnoty pre efektívne sorting v SQL
- Indexy: `lastPrice`, `lastChangePct`, `lastMarketCap`, `lastMarketCapDiff`

#### B. SessionPrice Tabuľka

```prisma
model SessionPrice {
  symbol    String
  date      DateTime
  session   String  // 'pre' | 'live' | 'after'
  lastPrice Float
  lastTs    DateTime
  changePct Float
  quality   String  // 'delayed_15m' | 'rest' | 'snapshot'
}
```

**Použitie:**

- Historické ceny pre každú session (pre-market, live, after-hours)
- Používa sa pre **heatmap** zobrazenie
- Indexy: `[date, session]`, `[symbol, session]`, `[lastTs]`

#### C. DailyRef Tabuľka

```prisma
model DailyRef {
  symbol        String
  date          DateTime
  previousClose Float
  todayOpen     Float?
  regularClose  Float?
}
```

**Použitie:**

- Previous close (pre výpočet percent change)
- Today open, regular close
- Indexy: `[date]`, `[symbol]`, unique `[symbol, date]`

---

### 2. **Redis Cache**

#### A. Hot Cache

- **Kľúč:** `stock:{symbol}` (hash)
- **TTL:** 24h (live), 7 dní (pre/after)
- **Obsah:** `p` (price), `c` (changePct), `m` (marketCap), `d` (marketCapDiff)

#### B. Last Price Cache

- **Kľúč:** `last:{date}:{session}:{symbol}`
- **TTL:** 24h (live), 7 dní (pre/after)
- **Obsah:** JSON s cenou, changePct, marketCap, atď.

#### C. Ranking Indexes (ZSET)

- **Kľúč:** `rank:{field}:{date}:{session}:{dir}`
- **Field:** `price`, `chg` (changePct), `capdiff` (marketCapDiff)
- **Dir:** `asc` alebo `desc`
- **Použitie:** Rýchle sorting pre `/api/stocks/optimized`

#### D. Stats Cache (HSET)

- **Kľúč:** `stats:{date}:{session}`
- **Obsah:** Min/max hodnoty pre price, marketCap, changePct
- **Použitie:** Rýchle získanie rozsahu hodnôt

#### E. Previous Close Cache

- **Kľúč:** `prevClose:{date}:{symbol}`
- **TTL:** 24h
- **Použitie:** Rýchly prístup k previous close pre výpočty

---

## ⏰ Rozvrh a plánovanie

### 1. **Polygon Worker (Snapshot Mode)**

**Frekvencia:**

- **Kontrola:** Každých **30 sekúnd**
- **Pre-market (4:00-9:30 ET):** Všetky tickery každých **5 minút**
- **Live trading (9:30-16:00 ET):**
  - Premium tickery (top 200): každých **60 sekúnd**
  - Ostatné tickery: každých **5 minút**
- **After-hours (16:00-20:00 ET):** Všetky tickery každých **5 minút**
- **Closed (20:00-4:00 ET, pracovný deň):** Načítava dostupné ceny každých **5 minút**
- **Weekend/Holiday:** Iba bootstrap previous closes

**Batch processing:**

- Batch size: 60-70 tickerov
- Delay medzi batchmi: ~17 sekúnd
- Pre 615 tickerov: ~10 batchov = ~3 minúty na celý cyklus

---

### 2. **Polygon Worker (Refs Mode)**

**Úlohy:**

- **03:30 ET:** Refresh universe (pridanie nových tickerov)
- **04:00 ET:** Bootstrap previous closes (ak chýbajú)
- **16:00 ET:** Save regular close, switch to after-hours

**Frekvencia:** Kontrola každú **minútu**

---

### 3. **Cron Jobs (Vercel)**

**Vercel Cron konfigurácia** (`vercel.json`):

```json
{
  "crons": [
    {
      "path": "/api/cron/verify-sector-industry",
      "schedule": "0 2 * * *" // 02:00 UTC (denne)
    },
    {
      "path": "/api/cron/update-static-data",
      "schedule": "0 6 * * *" // 06:00 UTC (denne)
    }
  ]
}
```

**Manuálne cron joby:**

- `/api/cron/earnings-calendar` - Earnings calendar update
- `/api/cron/blog` - Blog scheduler

---

### 4. **Background Preloader**

**PM2 Cron** (`ecosystem.config.js`):

- **Schedule:** `*/5 13-20 * * 1-5` (každých 5 min, 13:00-20:00 UTC, Mon-Fri)
- **Účel:** Bulk preload dát počas trading hours

---

## 🛠️ Technológie

### 1. **Externé API**

#### A. Polygon.io

- **Endpoint:** `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers`
- **Rate limit:** 5 req/s (300 req/min)
- **Batch support:** Až 100 tickerov na request (používame 60-70)
- **Dáta:**
  - `lastTrade.p` - najaktuálnejšia cena
  - `min.c` - pre-market/after-hours cena
  - `day.c` - denná zatváracia cena
  - `prevDay.c` - predchádzajúca zatváracia cena

#### B. Finnhub

- **Použitie:** Earnings calendar data

#### C. Yahoo Finance (Scraper)

- **Použitie:** Earnings calendar scraping

---

### 2. **Database**

- **Type:** SQLite (development), PostgreSQL (production)
- **ORM:** Prisma
- **Indexy:** Optimalizované pre sorting a filtering
- **Architektúra:** SQL-first (database-first)

---

### 3. **Cache**

- **Type:** Redis (Upstash v production, in-memory v development)
- **Struktúry:**
  - **Strings:** `last:{date}:{session}:{symbol}`
  - **Hashes:** `stock:{symbol}`
  - **ZSET:** `rank:{field}:{date}:{session}:{dir}`
  - **HSET:** `stats:{date}:{session}`
- **TTL:** 24h (live), 7 dní (pre/after)

---

### 4. **Worker Framework**

- **Runtime:** Node.js + TypeScript
- **Executor:** `tsx` (TypeScript executor)
- **Process Manager:** PM2 (production)
- **Error Handling:** Circuit breaker, retry logic, DLQ (Dead Letter Queue)

---

### 5. **Real-time Updates**

- **WebSocket:** Socket.io
- **Pub/Sub:** Redis Pub/Sub
- **Broadcast:** Každých 100ms (dynamicky upravované podľa aktivity)

---

## 🔍 Kľúčové vlastnosti

### 1. **Pre-market Focus**

- Worker **NEPRESTÁVA** načítavať dáta keď je trh zatvorený
- Používa `min.c` pre pre-market ceny (nie `day.c` ktoré je 0)
- Aktualizácia každých 5 minút v pre-market session

### 2. **Idempotent Updates**

- Upsert do DB len ak je timestamp novší
- Predchádza prepisovaniu novších dát staršími

### 3. **Atomic Operations**

- Redis MULTI/EXEC pre atomic updates
- Všetky ranking indexes sa updatujú naraz

### 4. **Rate Limiting Protection**

- Circuit breaker pre ochranu API
- Retry logic s exponential backoff
- Dynamic batch delays

### 5. **Prioritizácia**

- Top 200 tickerov dostávajú častejšie updates
- Ostatné tickery majú nižšiu frekvenciu (šetrí API calls)

---

## 📈 Výkon

### Batch Processing

- **615 tickerov:** ~10 batchov × 17s delay = **~3 minúty** na celý cyklus
- **Premium tickery (200):** Update každých 60s
- **Ostatné (415):** Update každých 5 min

### API Calls

- **Max:** 250 req/min (konzervatívny limit)
- **Skutočné:** ~10 batchov/min = **~10 req/min** (veľa rezervy)

### Database Writes

- **Upsert:** Len ak je timestamp novší
- **Batch:** 60-70 tickerov naraz
- **Indexy:** Optimalizované pre rýchle queries

---

## 🎯 Záver

Systém je navrhnutý pre **24/7 fetchovanie pre-market cien** s dôrazom na:

- ✅ Automatické načítavanie aj keď je trh zatvorený
- ✅ Efektívne batch processing
- ✅ Rate limiting protection
- ✅ Real-time updates cez WebSocket
- ✅ SQL-first architektúra pre rýchle queries
- ✅ Redis cache pre hot data

**Kritická vlastnosť:** Worker načítava pre-market ceny pre **všetky tickery** každých 5 minút v pre-market session, čo je základná funkcia premarketprice.com!
