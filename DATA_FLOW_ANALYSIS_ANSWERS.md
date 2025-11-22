# Analýza dátového flow - Odpovede na otázky

## 1. High-level mapa dát (od API po FE)

### 1.1 Externé API zdroje

**Polygon.io:**
- **Súbory:**
  - `src/workers/polygonWorker.ts` - hlavný worker pre batch ingest
  - `src/app/api/stocks/route.ts` - priame volania Polygon API pre jednotlivé tickery
  - `src/lib/marketCapUtils.ts` - pomocné funkcie pre market cap výpočty
- **Funkcie:**
  - `ingestBatch()` - batch processing 70 tickerov
  - `fetchPolygonSnapshot()` - získanie snapshot dát
  - `getCurrentPrice()`, `getPreviousClose()` - získanie cien
- **Endpointy:**
  - `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`
  - Rate limit: 5 req/s (300 req/min)

**Finnhub:**
- **Súbory:**
  - `src/app/api/earnings-finnhub/route.ts`
- **Použitie:** Earnings calendar data

**Yahoo Finance:**
- **Súbory:**
  - `src/lib/yahooFinanceScraper.ts`
  - `src/app/api/cron/earnings-calendar/route.ts`
- **Použitie:** Earnings calendar scraping

### 1.2 Ukladanie dát - Prisma modely a Redis

| Model/Tabuľka | Kde sa plní | Na čo sa používa |
|--------------|-------------|------------------|
| **Ticker** | `polygonWorker.ts` (upsert), `scripts/bootstrap-static-data.ts` | Static data (symbol, name, sector, industry, sharesOutstanding) |
| **SessionPrice** | `polygonWorker.ts` (ingestBatch) | Aktuálne ceny (pre-market, live, after-hours) - **POUŽÍVA HEATMAP** |
| **DailyRef** | `polygonWorker.ts` (saveRegularClose, bootstrapPreviousCloses) | Previous close, today open, regular close - **POUŽÍVA HEATMAP** |
| **EarningsCalendar** | `src/app/api/cron/earnings-calendar/route.ts` | Earnings schedule |

| Redis kľúč | Kde sa plní | TTL | Použitie |
|------------|-------------|-----|----------|
| `stock:{project}:{ticker}` | `src/app/api/stocks/route.ts` | 120s | **POUŽÍVA ALL STOCKS** |
| `heatmap:all-companies` | `src/app/api/heatmap/route.ts` | 10s | **POUŽÍVA HEATMAP** |
| `heatmap:version` | `src/app/api/heatmap/route.ts` | 10s | ETag verzia pre heatmap |
| `last:{date}:{ticker}` | `polygonWorker.ts` | - | Real-time price updates |
| `prevClose:{date}:{ticker}` | `polygonWorker.ts` | - | Previous close prices |

### 1.3 API endpointy

| Endpoint | Zdroj dát | Použitie |
|----------|-----------|----------|
| `/api/stocks?tickers=...` | Polygon API (priamo) + Redis cache | **ALL STOCKS (`/`)** |
| `/api/heatmap` | DB (SessionPrice, DailyRef, Ticker) + Redis cache | **HEATMAP (`/heatmap`)** |
| `/api/stocks/optimized` | DB (SessionPrice, DailyRef) | Stocks page |
| `/api/earnings-finnhub` | Finnhub API | Today's Earnings section |

### 1.4 FE komponenty

| Stránka/Komponent | Endpoint | Fetch strategy |
|-------------------|----------|----------------|
| `src/app/HomePage.tsx` (All stocks) | `/api/stocks?tickers=...&t=${Date.now()}` | `cache: 'no-store'` + timestamp |
| `src/app/heatmap/page.tsx` | `/api/heatmap` (cez `ResponsiveMarketHeatmap`) | `cache: 'no-store'` + ETag |
| `src/components/ResponsiveMarketHeatmap.tsx` | `/api/heatmap` | ETag support, auto-refresh 30s |

### 1.5 Dátový flow

```
EXTERNÉ API → WORKER → DB/Redis → API ROUTE → FE
```

**All stocks flow:**
```
Polygon API → /api/stocks → Redis cache (120s TTL) → HomePage.tsx
  ↓
  (ak cache miss)
  ↓
Polygon API (priamo) → Redis cache → HomePage.tsx
```

**Heatmap flow:**
```
Polygon API → polygonWorker.ts (každých 60s, batch 70 tickerov, delay 10s)
  ↓
SessionPrice + DailyRef (DB)
  ↓
/api/heatmap → Redis cache (10s TTL) + ETag → ResponsiveMarketHeatmap.tsx
```

**Kľúčový rozdiel:**
- **All stocks:** Polygon API priamo (ak cache miss) → vždy aktuálne (max 2 min staré)
- **Heatmap:** DB (SessionPrice) → závisí od workeru → môže byť staršie (max ~7-10 min po optimalizácii)

---

## 2. Fetchovanie dát z externých API (cron, pipeline)

### 2.1 Zoznam súborov a funkcií

**Polygon API volania:**

1. **`src/workers/polygonWorker.ts`**
   - `ingestBatch(tickers, apiKey)` - batch processing
   - `fetchPolygonSnapshot(tickers, apiKey)` - paralelné volania (Promise.all)
   - **Frekvencia:** každých 60s
   - **Batch size:** 70 tickerov
   - **Delay medzi batchmi:** 10s (optimalizované z 60s)
   - **Celkový cyklus:** ~7 min pre 3000 tickerov

2. **`src/app/api/stocks/route.ts`**
   - Priame volania Polygon API pre jednotlivé tickery
   - **Sériové volanie:** `tickerList.map(async (ticker) => { await fetch(...) })`
   - **Delay:** 200ms medzi requestmi
   - **Timeout:** 5s per request
   - **Retry:** nie (len error handling)

### 2.2 Úzke hrdlá

**Problém 1: Sériové volanie v `/api/stocks`**
```typescript
// Súčasný kód - sériové volanie
const promises = tickerList.map(async (ticker, index) => {
  if (index > 0) {
    await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
  }
  // fetch Polygon API
});
```
- **Problém:** Pre 3000 tickerov: 3000 × 200ms = 10 minút
- **Riešenie:** Batch processing s Promise.all (napr. 10 paralelných requestov)

**Problém 2: Worker batch delay**
- **Pred optimalizáciou:** 60s delay → 43 min cyklus
- **Po optimalizácii:** 10s delay → ~7 min cyklus ✅

### 2.3 Cron/Pipeline

**Worker (`polygonWorker.ts`):**
- **Frekvencia:** `setInterval(ingestLoop, 60000)` - každých 60s
- **Trvanie:** ~7 min pre kompletný cyklus (3000 tickerov)
- **Paralelizácia:** Batch processing (70 tickerov) s Promise.all v rámci batchu
- **Optimalizácia:** Delay medzi batchmi znížený z 60s na 10s

**Cron jobs:**
- `src/app/api/cron/earnings-calendar/route.ts` - denné aktualizácie earnings
- `src/app/api/cron/verify-sector-industry/route.ts` - denná kontrola sector/industry

### 2.4 Rozdiel medzi All stocks a Heatmap

| Aspekt | All stocks | Heatmap |
|--------|------------|---------|
| **Zdroj dát** | Polygon API (priamo) | DB (SessionPrice) |
| **Aktualizácia** | Okamžitá (ak cache miss) | Závisí od workeru (60s + batch delay) |
| **Max stálosť** | 2 min (cache TTL) | ~7-10 min (worker cyklus) |

---

## 3. Ukladanie dát – DB, tabuľky, Redis

### 3.1 Prisma modely

**SessionPrice:**
- **Stĺpce:** `symbol`, `date`, `session`, `lastPrice`, `lastTs`, `changePct`, `updatedAt`
- **Indexy:** `[date, session]`, `[symbol, session]`, `[lastTs]`, `[changePct]`
- **Kde sa plní:** `polygonWorker.ts` (ingestBatch)
- **Kde sa číta:** `/api/heatmap` (pre heatmap), `/api/stocks/optimized`
- **FE použitie:** Heatmap

**DailyRef:**
- **Stĺpce:** `symbol`, `date`, `previousClose`, `todayOpen`, `regularClose`
- **Indexy:** `[date]`, `[symbol]`, `[symbol, date]` (unique)
- **Kde sa plní:** `polygonWorker.ts` (saveRegularClose, bootstrapPreviousCloses)
- **Kde sa číta:** `/api/heatmap` (pre heatmap), `/api/stocks`
- **FE použitie:** Heatmap, All stocks (pre percentChange)

**Ticker:**
- **Stĺpce:** `symbol`, `name`, `sector`, `industry`, `sharesOutstanding`
- **Indexy:** `[sector]`, `[sharesOutstanding]`
- **Kde sa plní:** `scripts/bootstrap-static-data.ts`, `polygonWorker.ts` (upsert)
- **Kde sa číta:** `/api/heatmap` (pre sector/industry)
- **FE použitie:** Heatmap (pre sektorové zoskupenie)

### 3.2 Rozdiel medzi `/` a `/heatmap`

**All stocks (`/`):**
- **Číta z:** Redis cache (`stock:{project}:{ticker}`) alebo Polygon API priamo
- **Aktualizácia:** Okamžitá (ak cache miss)

**Heatmap (`/heatmap`):**
- **Číta z:** DB (SessionPrice, DailyRef, Ticker)
- **Aktualizácia:** Závisí od workeru (každých 60s, batch processing)

**Výsledok:** Heatmap používa iný zdroj dát (DB namiesto Polygon API), ktorý sa aktualizuje pomalšie.

### 3.3 Redis cache

**All stocks:**
- **Kľúč:** `stock:{project}:{ticker}`
- **TTL:** 120s
- **Kde sa nastavuje:** `src/app/api/stocks/route.ts` (setCachedData)

**Heatmap:**
- **Kľúč:** `heatmap:all-companies`
- **TTL:** 10s (optimalizované z 30s)
- **Kde sa nastavuje:** `src/app/api/heatmap/route.ts` (setCachedData)
- **ETag kľúč:** `heatmap:version`
- **ETag TTL:** 10s

---

## 4. FE fetchovanie – porovnanie `/` vs `/heatmap`

### 4.1 Endpointy a fetch strategy

**All stocks (`src/app/HomePage.tsx`):**
```typescript
fetch(`/api/stocks?tickers=${tickers.join(',')}&project=${project}&limit=3000&t=${Date.now()}`, {
  cache: 'no-store'  // ✅ Vždy fresh
})
```
- **Endpoint:** `/api/stocks`
- **Cache:** `'no-store'`
- **Timestamp:** `&t=${Date.now()}` - zabezpečuje fresh dáta
- **Component:** Client Component

**Heatmap (`src/components/ResponsiveMarketHeatmap.tsx`):**
```typescript
fetch(url.toString(), {
  cache: 'no-store',  // ✅ Vždy fresh
  headers: {
    'If-None-Match': lastEtag  // ETag support
  }
})
```
- **Endpoint:** `/api/heatmap`
- **Cache:** `'no-store'`
- **ETag:** Podporuje 304 Not Modified
- **Component:** Client Component

### 4.2 Cache nastavenia

**All stocks:**
- ✅ `cache: 'no-store'` - vždy fresh
- ✅ Timestamp v URL - zabezpečuje fresh dáta
- ❌ Žiadny ISR/revalidate

**Heatmap:**
- ✅ `cache: 'no-store'` - vždy fresh
- ✅ ETag support - 304 Not Modified (len ak dáta < 5 min staré)
- ❌ Žiadny ISR/revalidate

### 4.3 Rozdiel v endpointoch

- **All stocks:** `/api/stocks` - Polygon API priamo
- **Heatmap:** `/api/heatmap` - DB (SessionPrice)

**Výsledok:** Rôzne endpointy = rôzne zdroje dát = rôzna aktuálnosť.

### 4.4 Payload veľkosť

**All stocks:**
- ~3000 tickerov
- Každý ticker: `{ ticker, companyName, sector, industry, marketCap, percentChange, marketCapDiff, currentPrice }`
- **Odhad:** ~500KB JSON

**Heatmap:**
- ~615 tickerov (len tickery s sector/industry)
- Rovnaká štruktúra ako All stocks
- **Odhad:** ~100KB JSON

---

## 5. Cache, ETag, stale-while-revalidate

### 5.1 ETag implementácia

**All stocks (`/api/stocks`):**
- ❌ **Nepoužíva ETag**
- ✅ Používa timestamp v URL (`&t=${Date.now()}`)

**Heatmap (`/api/heatmap`):**
- ✅ **Používa ETag** (`heatmap:version`)
- ✅ **Kontrola stálosti:** 304 len ak dáta < 5 min staré
- ✅ **Increment verzie:** Ak dáta > 5 min staré, incrementni verziu

### 5.2 Cache-Control headers

**All stocks:**
- ❌ Žiadne explicitné Cache-Control headers

**Heatmap:**
- ✅ `Cache-Control: public, max-age=10, stale-while-revalidate=30`
- ✅ `ETag: "h-{version}"`

### 5.3 ETag logika

**Heatmap ETag check:**
```typescript
// 1. Skontroluj maxUpdatedAt z SessionPrice
const dataAgeMs = maxUpdatedAt ? Date.now() - maxUpdatedAt.getTime() : Infinity;

// 2. Ak dáta < 5 min staré a ETag match → 304
if (ifNoneMatch === etag && dataAgeMs < MAX_DATA_AGE_FOR_ETAG) {
  return 304;
}

// 3. Ak dáta > 5 min staré → incrementni verziu
if (dataAgeMs > MAX_DATA_AGE_FOR_ETAG) {
  newVersion = currentVersion + 1; // Force refresh
}
```

### 5.4 FE cache layer

**All stocks:**
- ❌ Žiadny localStorage cache

**Heatmap:**
- ❌ Žiadny localStorage cache
- ✅ ETag v state (`lastEtag`)
- ✅ Auto-refresh každých 30s

---

## 6. Potenciálne úzke hrdlá v kóde (výkon)

### 6.1 FE výpočty

**Heatmap (`MarketHeatmap.tsx`):**
- **D3 treemap:** Výpočet hierarchie a layoutu
- **Memoizácia:** `useMemo` pre filteredLeaves
- **Optimalizácia:** ✅ Už implementované

**All stocks:**
- **Sorting:** Na FE (useSortableData hook)
- **Filtering:** Na FE
- **Optimalizácia:** ✅ Už implementované

### 6.2 BE výpočty

**`/api/stocks`:**
- **Market cap výpočty:** Pre každý ticker (computeMarketCap)
- **Percent change:** Pre každý ticker (computePercentChange)
- **Optimalizácia:** ✅ Už v cache (120s TTL)

**`/api/heatmap`:**
- **DB queries:** SessionPrice, DailyRef, Ticker
- **Market cap výpočty:** Pre každý ticker
- **Optimalizácia:** ✅ Cache (10s TTL), ETag support

### 6.3 N+1 queries

**`/api/stocks`:**
- ❌ **Problém:** Sériové volania Polygon API (200ms delay)
- ✅ **Riešenie:** Batch processing s Promise.all (možné vylepšenie)

**`/api/heatmap`:**
- ✅ **OK:** Batch DB queries (findMany s `where: { symbol: { in: tickerSymbols } }`)
- ✅ **OK:** Redis batch (getCachedData pre celý payload)

### 6.4 Odhad času requestu

**`/api/stocks` (3000 tickerov, cache miss):**
- Polygon API: 3000 × 200ms = 10 min (sériové)
- **Optimalizácia potrebná:** Batch processing

**`/api/heatmap` (615 tickerov):**
- DB queries: ~500ms (SessionPrice + DailyRef + Ticker)
- Market cap výpočty: ~100ms
- **Celkom:** ~600ms (s cache hit: ~10ms)

### 6.5 Navrhované optimalizácie

1. **Batch processing v `/api/stocks`:**
   - Promise.all s limitovanou konkurrenciou (10 paralelných)
   - Znížiť čas z 10 min na ~1-2 min

2. **Prioritizácia tickerov vo workeri:**
   - Top 500 podľa market cap: každých 10s
   - Zvyšok: každých 60s

3. **Predpočítané agregáty:**
   - Worker môže už spočítať sektorové sumy
   - Uložiť do Redis: `heatmap:sectors:{date}`
   - API len vráti hotový výsledok

---

## 7. Špecificky k problému: All stocks aktuálne, heatmap „zamrznutá"

### 7.1 Endpointy

**All stocks:**
- `/api/stocks?tickers=...&t=${Date.now()}`
- **Zdroj:** Polygon API (priamo) + Redis cache

**Heatmap:**
- `/api/heatmap`
- **Zdroj:** DB (SessionPrice, DailyRef, Ticker) + Redis cache

### 7.2 Tabulky/Redis kľúče a aktualizácia

| Zdroj | Aktualizácia | Použitie |
|-------|--------------|----------|
| **Redis `stock:{project}:{ticker}`** | Pri každom requeste (ak cache miss) | All stocks |
| **DB SessionPrice** | Worker každých 60s, batch 70 tickerov, delay 10s | Heatmap |
| **Redis `heatmap:all-companies`** | Pri každom requeste (ak cache miss) | Heatmap |

**Problém:** SessionPrice sa aktualizuje pomalšie (worker cyklus ~7 min) než Polygon API cache (okamžitá aktualizácia).

### 7.3 Cache nastavenia

**API endpointy:**
- **All stocks:** Žiadne explicitné cache headers, timestamp v URL
- **Heatmap:** `Cache-Control: public, max-age=10, stale-while-revalidate=30`, ETag

**Frontend fetch:**
- **All stocks:** `cache: 'no-store'` + timestamp
- **Heatmap:** `cache: 'no-store'` + ETag

**Lokálny storage:**
- ❌ Žiadny localStorage cache

### 7.4 Presný dôvod rozdielu

1. **Iný zdroj dát:**
   - All stocks: Polygon API priamo
   - Heatmap: DB (SessionPrice) → závisí od workeru

2. **Dlhšie intervaly aktualizácie:**
   - All stocks: Okamžitá (ak cache miss)
   - Heatmap: Worker cyklus ~7 min (po optimalizácii)

3. **ETag logika:**
   - Heatmap používa ETag, ktorý môže vrátiť 304 aj pri starších dátach (ale už opravené - 304 len ak < 5 min)

### 7.5 Navrhované riešenia

**Riešenie 1: Zjednotiť zdroj dát (ODPORÚČANÉ)**
- Heatmap by mal používať rovnaký endpoint ako All stocks (`/api/stocks`)
- Alebo: All stocks by mal čítať z DB (SessionPrice) namiesto Polygon API

**Riešenie 2: Zrýchliť worker (UŽ IMPLEMENTOVANÉ)**
- ✅ Batch delay znížený z 60s na 10s
- ✅ Celkový cyklus: ~7 min (namiesto 43 min)

**Riešenie 3: Hybridný prístup**
- Top 500 tickerov: aktualizovať každých 10s
- Zvyšok: každých 60s

**Riešenie 4: Predpočítané agregáty**
- Worker už spočíta heatmap dáta a uloží do Redis
- API len vráti hotový výsledok

---

## Zhrnutie a odporúčania

### Hlavné zistenia

1. **All stocks a Heatmap používajú rôzne zdroje dát:**
   - All stocks: Polygon API priamo
   - Heatmap: DB (SessionPrice) → závisí od workeru

2. **Worker aktualizuje SessionPrice pomalšie:**
   - Pred optimalizáciou: ~43 min cyklus
   - Po optimalizácii: ~7 min cyklus ✅

3. **ETag logika už je optimalizovaná:**
   - 304 len ak dáta < 5 min staré ✅
   - Increment verzie ak dáta > 5 min staré ✅

### Odporúčania

1. **Krátkodobé (UŽ IMPLEMENTOVANÉ):**
   - ✅ Znížiť batch delay vo workeri (10s namiesto 60s)
   - ✅ Znížiť cache TTL pre heatmap (10s namiesto 30s)
   - ✅ Upraviť ETag logiku (kontrola stálosti dát)

2. **Strednodobé:**
   - Prioritizácia tickerov vo workeri (top 500 častejšie)
   - Batch processing v `/api/stocks` (Promise.all s konkurrenciou)

3. **Dlhodobé:**
   - Zjednotiť zdroj dát (všetko z DB alebo všetko z Polygon API)
   - Predpočítané agregáty pre heatmap (worker už spočíta a uloží)

### Očakávané výsledky

**Pred optimalizáciou:**
- Heatmap: dáta môžu byť staršie až 43+ minút
- All stocks: dáta max 2 minúty staré

**Po optimalizácii:**
- Heatmap: dáta max ~7-10 minút staré ✅
- All stocks: dáta max 2 minúty staré (bez zmeny)
- ETag logika zabezpečuje, že staré dáta sa nevrátia ako 304 ✅

