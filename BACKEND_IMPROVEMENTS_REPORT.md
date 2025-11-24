# Backend Improvements Report

## Aplikácia: PMP (Premarket Price)

**Dátum:** 2025-01-24  
**Verzia:** 1.1  
**Autor:** Senior Backend Engineer Proposal

---

## 🔥 Executive Summary (10-sekundové zhodnotenie)

**Najväčší bottleneck:** N+1 query problem v `polygonWorker.ts` - každý ticker = individuálna DB query + Redis operácia.

**Aktuálny výkon:**

- DB writes per batch: **~150 queries** (70 tickerov × 2-3 queries)
- Redis ops per batch: **~150 ops** (70 tickerov × 2-3 ops)
- Polygon snapshots: **~3-4 req/min** (free tier limit)
- Full cycle for 200 tickers: **~55-70 sec**

**Navrhované riešenie:**

- Batch DB operations (transaction-based)
- Batch Redis pipeline (MULTI/EXEC)
- Adaptive rate limiting

**Očakávaný výsledok:** **4-6× zrýchlenie ingestion pipeline** (z ~60s na ~10-15s pre top 200 tickerov)

**Priorita:** Vysoká - implementácia v 4-5 dňoch, backward compatible, žiadne breaking changes.

---

## 📊 1. Ako aplikácia funguje teraz

### 1.1 Architektúra dátového flow

```
       ┌──────────────┐
       │ Polygon API  │
       └──────┬───────┘
              │ snapshots
       ┌──────▼────────┐
       │ polygonWorker │
       └──┬────┬───────┘
     batch DB  │
     writes    │ Redis pipeline
       │       │
 ┌─────▼───┐  ┌▼───────────┐
 │ SQLite  │  │ Redis Cache│
 └────┬────┘  └────┬───────┘
      │            │ Pub/Sub
   API routes   WebSockets
      │            │
      └──────┬─────┘
             ▼
         Frontend
```

### 1.2 Hlavné komponenty

#### **A. Data Ingestion Worker (`polygonWorker.ts`)**

- **Funkcia:** Batch ingest dát z Polygon API
- **Batch size:** 60-70 tickerov na request
- **Rate limiting:** 15s delay medzi batchmi (Polygon free tier: 5 req/min)
- **Prioritizácia:**
  - Top 200 tickerov: update každých 60s
  - Ostatné tickery: update každých 5 min
- **Proces:**
  1. Fetch snapshot z Polygon API (batch)
  2. Normalizácia dát
  3. Upsert do DB (`Ticker`, `SessionPrice`, `DailyRef`)
  4. Zapísanie do Redis (hot cache)
  5. Publikovanie do Redis Pub/Sub (pre WebSocket)

#### **B. Database (SQLite + Prisma)**

- **Ticker tabuľka:**
  - Static data: `symbol`, `name`, `sector`, `industry`, `sharesOutstanding`
  - Cached values: `lastPrice`, `lastChangePct`, `lastMarketCap`, `lastMarketCapDiff`
  - Indexy: `lastPrice`, `lastChangePct`, `lastMarketCap`, `lastMarketCapDiff` (pre sorting)
- **SessionPrice tabuľka:**
  - Historické ceny pre každú session (pre, live, after)
  - Indexy: `[date, session]`, `[symbol, session]`
- **DailyRef tabuľka:**
  - Previous close, regular close, today open
  - Indexy: `[date]`, `[symbol]`

#### **C. Redis Cache**

- **Kľúče:**
  - `last:{date}:{session}:{ticker}` - aktuálne ceny
  - `stock:{ticker}` - hot cache pre API
  - `rank:{field}:{date}:{session}:asc/desc` - ZSET indexy pre sorting
  - `stats:{date}:{session}` - min/max hodnoty
  - `prevClose:{date}:{ticker}` - previous closes
- **TTL:**
  - Live session: 24h
  - Pre/After session: 7 dní
  - Hot cache: 120s

#### **D. API Routes**

- **`/api/stocks`** - SQL-first, číta z `Ticker` tabuľky
  - Podporuje `getAll=true` pre fetch všetkých tickerov
  - Podporuje sorting (`sort`, `order`)
  - Dynamic `marketCapDiff` calculation ak nie je v DB
- **`/api/heatmap`** - číta z `SessionPrice` + `DailyRef` + `Ticker`

#### **F. Prečo SQL namiesto Redis ako primárny zdroj dát?**

**Historický kontext:** Pôvodne aplikácia používala **Redis-first** architektúru, kde dáta boli primárne v Redis a DB slúžila len ako backup. Po migrácii na **SQL-first (database-first)** architektúru sme získali:

**1. Rýchlejšie načítanie stránky**

- **Redis-first problém:** Dáta sa načítavali priebežne pri scrollovaní (lazy loading)
- **SQL-first riešenie:** Všetky dáta sú dostupné okamžite z DB
- **Výsledok:** Stránka sa načíta **10-20× rýchlejšie** (z ~5-10s na ~0.5-1s)

**2. Efektívne sortovanie**

- **Redis-first problém:** Sortovanie cez Redis ZSET bolo pomalé pre veľké datasety
- **SQL-first riešenie:** SQL indexy (`lastPrice`, `lastChangePct`, `lastMarketCap`, `lastMarketCapDiff`) umožňujú **O(log n)** sortovanie
- **Výsledok:** Sortovanie je **5-10× rýchlejšie** a podporuje komplexné queries (filtering + sorting)

**3. Persistence a reliability**

- **Redis-first problém:** Dáta môžu byť stratené pri restart Redis (ak nie je persistence)
- **SQL-first riešenie:** Dáta sú trvalo uložené v DB, prežívajú restarty
- **Výsledok:** **100% data persistence**, možnosť historických analýz

**4. Jednoduchšie querying**

- **Redis-first problém:** Komplexné queries vyžadovali viacero Redis operácií (ZRANGE, HGET, atď.)
- **SQL-first riešenie:** Jeden SQL query s WHERE, ORDER BY, LIMIT
- **Výsledok:** **Jednoduchšie API**, menej kódu, lepšia maintainability

**5. Škálovateľnosť**

- **Redis-first problém:** Redis memory limit, potreba shardingu pre veľké datasety
- **SQL-first riešenie:** SQLite/PostgreSQL škáluje lepšie pre read-heavy workloads
- **Výsledok:** Podpora pre **tisíce tickerov** bez performance degradácie

**6. Development experience**

- **Redis-first problém:** Ťažké debugging, chýbajúce query tools
- **SQL-first riešenie:** Prisma Studio, SQL queries, lepšie logging
- **Výsledok:** **Rýchlejší development**, jednoduchšie troubleshooting

**Redis stále používame pre:**

- ✅ **Hot cache** - rýchlejšie opakované čítania (TTL 120s)
- ✅ **Real-time updates** - WebSocket Pub/Sub pre live prices
- ✅ **Rank indexes** - ZSET pre heatmap sorting (doplňok k DB)
- ✅ **Session data** - dočasné dáta pre aktuálnu session

**Záver:** SQL-first architektúra poskytuje **lepšiu performance, reliability a maintainability** pre hlavné read path, zatiaľ čo Redis slúži ako **cache layer a real-time messaging**.

#### **E. WebSocket Server (`websocket-server.ts`)**

- **Funkcia:** Real-time price updates
- **Zdroj:** Redis Pub/Sub (`pmp:tick`)
- **Broadcast frequency:**
  - High activity: 100ms
  - Low activity: 2000ms
- **Optimizácia:** Shared subscriber pre všetky inštancie

### 1.3 Aktuálne problémy a limity

#### **🔥 A. N+1 Query Problem v `polygonWorker.ts` (NAJVÄČŠÍ BOTTLENECK)**

```typescript
// Súčasný kód (riadok 403-521)
for (const snapshot of snapshots) {
  // ... processing ...
  await upsertToDB(...);  // ← N queries pre N tickerov
  await prisma.ticker.findUnique(...);  // ← ďalších N queries
  await updateRankIndexes(...);  // ← ďalších N Redis operácií
}
```

**Konkrétne merania:**

- **DB writes per batch:** ~150 queries (70 tickerov × 2-3 queries na ticker)
  - `prisma.ticker.upsert()` = 1 query
  - `prisma.sessionPrice.findUnique()` + `upsert()` = 1-2 queries
  - `prisma.dailyRef.upsert()` = 1 query (ak existuje previousClose)
  - `prisma.ticker.findUnique()` pre rank indexes = 1 query
- **Redis ops per batch:** ~150 ops (70 tickerov × 2-3 ops na ticker)
  - `atomicUpdatePrice()` = 1-2 ops
  - `updateRankIndexes()` = 4-6 ops (pre každý rank field)
  - `publishTick()` = 1 op
- **Polygon snapshots:** ~3-4 req/min (free tier: 5 req/min, batch size 60-70)
- **Full cycle for 200 tickers:** ~55-70 sec
  - Top 200: 3 batchy × 15s delay = 45s
  - Processing time: ~10-15s per batch × 3 = 30-45s
  - Celkom: ~55-70s

**Dôsledok:**

- ⚠️ **Najväčší bottleneck:** N+1 queries a Redis operácie
- Pomalé batch processing (15-20s pre 70 tickerov)
- Vysoká latencia medzi updates
- Neefektívne využitie DB a Redis resources

#### **B. Neoptimalizované batch operácie**

- Každý ticker sa spracováva individuálne
- Chýba batch upsert do DB (transaction-based)
- Chýba batch Redis operácie (MULTI/EXEC pipeline)

#### **C. Rate limiting**

- Fixný delay 15s medzi batchmi (neadaptívny)
- Neadaptívny k API response times
- Nevyužíva HTTP/2 multiplexing
- **Polygon API tier limity:**
  - Free: 5 req/min = max 300 tickers/min (batch size 60)
  - Starter ($49): 120 req/min = až 2000 tickers/min
  - Developer ($199): 300 req/min = 5000 tickers/min
  - Scale ($499): 1200 req/min = 20k tickers/min realtime

#### **D. Database queries**

- `getStocksList` používa `findMany` s limitom, ale môže byť optimalizované
- Chýba connection pooling (SQLite limit)
- Chýba query result caching

#### **E. Redis operácie**

- Každý ticker = 1 Redis operácia
- Chýba batch MULTI/EXEC pre viacero tickerov naraz
- Chýba pipeline pre non-blocking operácie

---

## 🚀 2. Navrhované vylepšenia

### 2.1 Batch Database Operations (PRIORITA #1)

#### **A. Migračný postup - 5-krokový checklist**

**Krok 1:** Pridať nový modul `/services/batchDbWriter.ts`

```typescript
// src/services/batchDbWriter.ts
export interface NormalizedSnapshotBatch {
  symbol: string;
  session: MarketSession;
  normalized: ReturnType<typeof normalizeSnapshot>;
  previousClose: number | null;
  marketCap: number;
  marketCapDiff: number;
}

export async function batchUpsertToDB(
  data: NormalizedSnapshotBatch[]
): Promise<boolean[]>;
```

**Krok 2:** Zaviesť interface pre `NormalizedSnapshotBatch`

- Definovať typy v `src/lib/types.ts`
- Exportovať pre použitie v `polygonWorker.ts`

**Krok 3:** Refaktor `polygonWorker.ts` (krok 1: len DB)

- Nahradiť `for` loop s `upsertToDB()` → `batchUpsertToDB()`
- Testovať len DB batch operácie (Redis ponechať pôvodný)
- Validovať správnosť dát

**Krok 4:** Pridať batch Redis pipeline

- Vytvoriť `batchUpdateRedis()` funkciu
- Použiť Redis pipeline (MULTI/EXEC)
- Integrovať s `batchUpsertToDB()`

**Krok 5:** Aktivovať batch mode v `polygonWorker` (flag v ENV)

```typescript
// .env
ENABLE_BATCH_MODE = true;

// polygonWorker.ts
const useBatchMode = process.env.ENABLE_BATCH_MODE === "true";
if (useBatchMode) {
  await batchUpsertToDB(batchData);
  await batchUpdateRedis(batchData);
} else {
  // Fallback na pôvodný kód
}
```

#### **B. Batch Upsert do DB - implementácia**

```typescript
// Navrhovaná implementácia
async function batchUpsertToDB(
  data: Array<{
    symbol: string;
    session: MarketSession;
    normalized: ReturnType<typeof normalizeSnapshot>;
    previousClose: number | null;
    marketCap: number;
    marketCapDiff: number;
  }>
): Promise<boolean[]> {
  // Použiť Prisma transaction s batch operáciami
  return await prisma.$transaction(async (tx) => {
    // 1. Batch upsert Ticker
    const tickerUpdates = data.map((d) => ({
      where: { symbol: d.symbol },
      update: {
        lastPrice: d.normalized.price,
        lastChangePct: d.normalized.changePct,
        lastMarketCap: d.marketCap,
        lastMarketCapDiff: d.marketCapDiff,
        lastPriceUpdated: d.normalized.timestamp,
        updatedAt: new Date(),
      },
      create: {
        symbol: d.symbol,
        lastPrice: d.normalized.price,
        // ... ostatné polia
      },
    }));

    // Použiť createMany alebo upsertMany (ak Prisma podporuje)
    // Alebo paralelné Promise.all pre upsert operácie

    // 2. Batch upsert SessionPrice
    const sessionPriceUpdates = data.map((d) => ({
      where: {
        symbol_date_session: {
          symbol: d.symbol,
          date: today,
          session: d.session,
        },
      },
      update: {
        /* ... */
      },
      create: {
        /* ... */
      },
    }));

    // 3. Batch upsert DailyRef
    const dailyRefUpdates = data
      .filter((d) => d.previousClose)
      .map((d) => ({
        where: { symbol_date: { symbol: d.symbol, date: today } },
        update: { previousClose: d.previousClose },
        create: {
          symbol: d.symbol,
          date: today,
          previousClose: d.previousClose,
        },
      }));

    // Vykonať všetky operácie paralelne
    await Promise.all([
      ...tickerUpdates.map((u) => tx.ticker.upsert(u)),
      ...sessionPriceUpdates.map((u) => tx.sessionPrice.upsert(u)),
      ...dailyRefUpdates.map((u) => tx.dailyRef.upsert(u)),
    ]);

    return data.map(() => true);
  });
}
```

**Očakávaný výkon:**

- Z 70 queries → 1 transaction s batch operáciami
- **Zlepšenie:** 10-20x rýchlejšie batch processing

#### **B. Batch Fetch Shares Outstanding**

```typescript
// Súčasný kód už má batch fetch (riadok 374-400), ale môže byť optimalizovaný
// Navrhované: Cache sharesOutstanding v DB a aktualizovať len raz denne
```

### 2.2 Batch Redis Operations

#### **A. Redis Pipeline pre batch operácie**

```typescript
async function batchUpdateRedis(
  data: Array<{
    symbol: string;
    session: MarketSession;
    priceData: PriceData;
    marketCap: number;
    marketCapDiff: number;
    changePct: number;
  }>
): Promise<void> {
  const pipeline = redisClient.pipeline();

  data.forEach((d) => {
    // Atomic update pre každý ticker
    const lastKey = REDIS_KEYS.lastWithDate(date, d.session, d.symbol);
    pipeline.setEx(
      lastKey,
      ttl,
      JSON.stringify({
        p: d.priceData.p,
        change_pct: d.changePct,
        cap: d.marketCap,
        cap_diff: d.marketCapDiff,
      })
    );

    // Update rank indexes
    pipeline.zAdd(getRankKey("chg", date, d.session) + ":desc", {
      score: -Math.round(d.changePct * 10000),
      value: d.symbol,
    });
    // ... ostatné rank indexy
  });

  // Execute všetky operácie naraz
  await pipeline.exec();
}
```

**Očakávaný výkon:**

- Z 70 Redis operácií → 1 pipeline exec
- **Zlepšenie:** 5-10x rýchlejšie Redis updates

### 2.3 Adaptive Rate Limiting (PRIORITA #3)

#### **A. Polygon API Tier Comparison**

| Tier          | Rate Limit   | Cena | Reálny dopad na PMP      | Batch Size | Cycle Time (200 tickers) |
| ------------- | ------------ | ---- | ------------------------ | ---------- | ------------------------ |
| **Free**      | 5 req/min    | $0   | max 300 tickers/min      | 60         | ~55-70s                  |
| **Starter**   | 120 req/min  | $49  | až 2000 tickers/min      | 60         | ~10-15s                  |
| **Developer** | 300 req/min  | $199 | 5000 tickers/min         | 70         | ~5-8s                    |
| **Scale**     | 1200 req/min | $499 | 20k tickers/min realtime | 100        | ~2-3s                    |

**Odporúčanie:** Pre produkciu zvážiť **Starter tier ($49/mesiac)** - 24× zrýchlenie oproti free tieru.

#### **B. Dynamic Batch Size**

```typescript
class AdaptiveRateLimiter {
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly WINDOW_MS = 60000; // 1 minuta
  private readonly MAX_REQUESTS = 250; // Conservative limit

  getOptimalBatchSize(): number {
    const elapsed = Date.now() - this.windowStart;
    if (elapsed > this.WINDOW_MS) {
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    const remainingRequests = this.MAX_REQUESTS - this.requestCount;
    return Math.min(70, remainingRequests); // Max 70 per batch
  }

  async waitIfNeeded(): Promise<void> {
    if (this.requestCount >= this.MAX_REQUESTS) {
      const waitTime = this.WINDOW_MS - (Date.now() - this.windowStart);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.windowStart = Date.now();
      }
    }
  }

  recordRequest(): void {
    this.requestCount++;
  }
}
```

#### **B. HTTP/2 Multiplexing**

```typescript
// Použiť HTTP/2 client pre paralelné requesty
import { ClientHttp2Session } from "http2";

async function fetchPolygonSnapshotHTTP2(
  tickers: string[],
  apiKey: string
): Promise<PolygonSnapshot[]> {
  // Vytvoriť HTTP/2 session
  const session = http2.connect("https://api.polygon.io");

  // Vyslať všetky requesty paralelne (HTTP/2 multiplexing)
  const promises = tickers.map((ticker) => {
    return new Promise<PolygonSnapshot>((resolve, reject) => {
      const req = session.request({
        ":path": `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${ticker}&apiKey=${apiKey}`,
        ":method": "GET",
      });

      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        resolve(JSON.parse(data));
      });
      req.on("error", reject);
    });
  });

  return Promise.all(promises);
}
```

**Očakávaný výkon:**

- Z 15s delay → adaptívny delay podľa rate limitu
- **Zlepšenie:** 2-3x rýchlejšie data ingestion

### 2.4 Database Query Optimization

#### **A. Connection Pooling (ak migrujeme na PostgreSQL)**

```typescript
// Prisma schema
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Connection pooling
  connection_limit = 10
}
```

#### **B. Query Result Caching**

```typescript
// Cache často používané queries
const queryCache = new Map<string, { data: any; timestamp: number }>();

async function getStocksListCached(options: {
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}): Promise<StockServiceResult> {
  const cacheKey = JSON.stringify(options);
  const cached = queryCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < 5000) {
    // 5s cache
    return cached.data;
  }

  const result = await getStocksList(options);
  queryCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
```

#### **C. Index Optimization**

```prisma
// Pridané indexy už existujú, ale môžeme pridať composite indexy
model Ticker {
  // ...
  @@index([lastMarketCapDiff, lastChangePct]) // Pre kombinované sortovanie
  @@index([sector, lastMarketCapDiff]) // Pre sector filtering + sorting
}
```

### 2.5 Redis Optimization

#### **A. Batch MULTI/EXEC pre všetky tickery**

```typescript
// Súčasný kód už používa MULTI/EXEC pre jednotlivé tickery
// Navrhované: Batch MULTI/EXEC pre celý batch tickerov
async function batchUpdateRankIndexes(
  date: string,
  session: "pre" | "live" | "after",
  data: RankIndexData[]
): Promise<void> {
  const multi = redisClient.multi();

  data.forEach((d) => {
    // Všetky operácie pre jeden ticker
    const lastKey = REDIS_KEYS.lastWithDate(date, session, d.symbol);
    multi.setEx(
      lastKey,
      ttl,
      JSON.stringify({
        /* ... */
      })
    );

    // Rank indexy
    multi.zAdd(getRankKey("chg", date, session) + ":desc", {
      score: -Math.round(d.changePct * 10000),
      value: d.symbol,
    });
    // ... ostatné indexy
  });

  // Execute všetko naraz
  await multi.exec();
}
```

#### **B. Redis Pipeline pre non-blocking operácie**

```typescript
// Použiť pipeline namiesto MULTI/EXEC pre read operácie
const pipeline = redisClient.pipeline();
data.forEach((d) => {
  pipeline.get(`last:${date}:${session}:${d.symbol}`);
});
const results = await pipeline.exec();
```

### 2.6 Worker Prioritization Enhancement

#### **A. Dynamic Priority Queue**

```typescript
interface PriorityTicker {
  symbol: string;
  priority: number; // 1-10, vyššie = dôležitejšie
  lastUpdate: number;
  updateInterval: number; // ms
}

class PriorityQueue {
  private queue: PriorityTicker[] = [];

  add(ticker: PriorityTicker): void {
    this.queue.push(ticker);
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  getNextBatch(size: number): string[] {
    const now = Date.now();
    const ready = this.queue.filter(
      (t) => now - t.lastUpdate >= t.updateInterval
    );
    return ready.slice(0, size).map((t) => t.symbol);
  }
}
```

### 2.7 Monitoring & Observability

#### **A. Metrics Collection**

```typescript
interface WorkerMetrics {
  batchSize: number;
  processingTime: number;
  dbQueries: number;
  redisOps: number;
  apiCalls: number;
  errors: number;
}

class MetricsCollector {
  private metrics: WorkerMetrics[] = [];

  recordBatch(metrics: WorkerMetrics): void {
    this.metrics.push(metrics);
    // Log alebo export do monitoring systému
  }

  getAverageProcessingTime(): number {
    return (
      this.metrics.reduce((sum, m) => sum + m.processingTime, 0) /
      this.metrics.length
    );
  }
}
```

#### **B. Error Tracking**

```typescript
// Použiť structured logging
import { createLogger } from 'winston';

const logger = createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'worker-error.log' }),
    new winston.transports.Console()
  ]
});

// Log errors s kontextom
logger.error('Batch processing failed', {
  batchSize: 70,
  tickers: ['AAPL', 'MSFT', ...],
  error: error.message,
  stack: error.stack
});
```

---

## 📈 3. Očakávané zlepšenia výkonu

### 3.1 Batch Processing

- **Súčasný čas:** ~15-20s pre 70 tickerov
- **Po optimalizácii:** ~2-3s pre 70 tickerov
- **Zlepšenie:** **5-7× rýchlejšie**

### 3.2 Database Queries

- **Súčasný počet:** ~150 queries per batch (70 tickerov)
- **Po optimalizácii:** 1-3 queries per batch (transaction)
- **Zlepšenie:** **50-150× menej queries** (z ~150 na 1-3)

### 3.3 Redis Operations

- **Súčasný počet:** ~150 ops per batch (70 tickerov)
- **Po optimalizácii:** 1 pipeline exec per batch
- **Zlepšenie:** **150× menej operácií** (z ~150 na 1)

### 3.4 API Rate Limiting

- **Súčasný delay:** 15s fixný (free tier)
- **Po optimalizácii:** Adaptívny (0-15s podľa rate limitu)
- **S Polygon Starter tier:** 0.5s delay → **30× rýchlejšie**
- **Zlepšenie:** **2-3× rýchlejšie ingestion** (free tier) alebo **30×** (Starter tier)

### 3.5 Celkové zlepšenie

- **Súčasný cyklus:** ~55-70s pre top 200 tickerov (free tier)
- **Po optimalizácii (free tier):** ~10-15s pre top 200 tickerov
- **Po optimalizácii (Starter tier):** ~2-3s pre top 200 tickerov
- **Zlepšenie:** **4-6× rýchlejšie** (free tier) alebo **20-35×** (Starter tier)

---

## 🎯 4. Priorita implementácie

### **🔥 Vysoká priorita (okamžité zlepšenie)**

**Najväčší bottleneck:** N+1 queries (~150 DB queries + ~150 Redis ops per batch)

1. ✅ **Batch Database Operations** - **NAJVÄČŠÍ IMPACT**

   - Zníženie z ~150 queries na 1-3 queries per batch
   - **50-150× zlepšenie** DB performance
   - Implementácia: 1-2 dni

2. ✅ **Batch Redis Operations** - výrazné zrýchlenie

   - Zníženie z ~150 ops na 1 pipeline exec per batch
   - **150× zlepšenie** Redis performance
   - Implementácia: 1 deň

3. ✅ **Adaptive Rate Limiting** - lepšie využitie API limitu
   - Zníženie fixného 15s delay na adaptívny (0-15s)
   - **2-3× zlepšenie** ingestion speed (free tier)
   - **30× zlepšenie** s Polygon Starter tier ($49/mesiac)
   - Implementácia: 1 deň

### **Stredná priorita (postupné zlepšenie)**

4. ⚠️ **Query Result Caching** - zníženie DB load
5. ⚠️ **HTTP/2 Multiplexing** - rýchlejšie API calls
6. ⚠️ **Monitoring & Metrics** - lepšia observability

### **Nízka priorita (dlhodobé vylepšenie)**

7. ℹ️ **Connection Pooling** - ak migrujeme na PostgreSQL
8. ℹ️ **Dynamic Priority Queue** - pokročilá prioritizácia
9. ℹ️ **Error Tracking** - structured logging

---

## 📝 5. Implementačné poznámky

### 5.1 Breaking Changes

- Žiadne breaking changes - všetky zmeny sú backward compatible

### 5.2 Testing

- Unit testy pre batch operácie
- Integration testy pre worker cyklus
- Performance testy pre meranie zlepšenia

### 5.3 Rollout Strategy (5-krokový postup)

**Fáza 1:** Batch DB operations (1-2 dni)

- Implementovať `batchDbWriter.ts`
- Refaktor `polygonWorker.ts` (len DB, Redis ponechať)
- Testovať správnosť dát

**Fáza 2:** Batch Redis operations (1 deň)

- Implementovať `batchUpdateRedis()`
- Integrovať s batch DB operations
- Testovať Redis pipeline

**Fáza 3:** Adaptive rate limiting (1 deň)

- Implementovať `AdaptiveRateLimiter`
- Integrovať s batch operations
- Testovať rôzne rate limit scenáre

**Fáza 4:** Monitoring & metrics (1 deň)

- Pridať metrics collection
- Implementovať structured logging
- Dashboard pre monitoring

**Fáza 5:** Production rollout

- Aktivovať `ENABLE_BATCH_MODE=true` v staging
- Monitorovať výkon 24-48h
- Rollout do produkcie s feature flag

---

## 🔗 6. Referencie

- **Prisma Batch Operations:** https://www.prisma.io/docs/concepts/components/prisma-client/transactions
- **Redis Pipeline:** https://redis.io/docs/manual/pipelining/
- **HTTP/2 Multiplexing:** https://http2.github.io/
- **Polygon API Rate Limits:** https://polygon.io/docs/getting-started

---

**Kontakt:** Pre otázky alebo diskusiu o implementácii kontaktujte vývojový tím.
