# 🏗️ Cursor Architecture & Refactor Questions (Part 3) – Target Architecture & Roadmap

Tento dokument obsahuje strategické otázky pre Cursor, ktoré nadväzujú na:

- `DATA_FLOW_ANALYSIS_ANSWERS.md` (aktuálny stav)
- `CURSOR_AUDIT_QUESTIONS_PART2.md` (deep audit / bottlenecky)

Zamerajú sa na:

- Cieľovú architektúru (Single Source of Truth)
- Redis read model návrh
- Refaktoring API endpointov
- Zjednotenie DTO
- Monitoring a logging
- Roadmap implementácie

---

## 🏗️ 1. Target Architecture – Single Source of Truth

> Chcem, aby Cursor navrhol **cieľovú architektúru** pre market dáta s týmito cieľmi:
>
> - jedno „pravdivé“ miesto pre aktuálne ceny (single source of truth)
> - rýchle čítanie pre:
>
>   - homepage / All stocks
>   - heatmapu
>   - prípadné ďalšie views (watchlist, favourites, earnings, atď.)
>
> - minimum duplikovaných výpočtov medzi BE a FE
> - možnosť pridať ďalšie weby (gainerslosers.com, premarketprice.com, atď.) na ten istý dátový backend
>
> Prosím:
>
> 1. Popíš súčasný stav v jednej schéme (API → worker → DB/Redis → FE).
>
> 2. Navrhni **cieľovú architektúru** na 6–12 mesiacov:
>
>    - ktoré komponenty ostanú
>    - ktoré sa majú nahradiť
>    - ako sa má meniť data flow
>
> 3. Zameraj sa na to, aby:
>
>    - All stocks aj heatmap čítali z rovnakého zdroja
>    - prepočty (percentá, farby, sektorové sumy) boli čo najviac na BE
>    - Redis sa používal ako primárny „read model“

**Súbory na analýzu:**

- `src/app/api/stocks/route.ts`
- `src/app/api/heatmap/route.ts`
- `src/workers/polygonWorker.ts`
- `src/lib/redis.ts`
- `src/lib/redisHelpers.ts`

**Očakávaný výstup:**

- ASCII diagram súčasného stavu
- ASCII diagram cieľovej architektúry
- Zoznam komponentov na zachovanie/nahradenie
- Data flow diagram pre cieľovú architektúru

---

## ⚙️ 2. „Read Model" v Redis – návrh štruktúry

> Chcem mať v Redis-e **optimalizovaný read model** pre všetky FE views.
> Prosím navrhni:
>
> 1. Ako by mal vyzerať „hlavný" kľúč, napr.:
>
>    - `stocks:latest` → JSON s minimal payloadom pre všetky tickery
>    - `heatmap:payload` → už agregované dáta pripravené pre treemap
>    - ZSET indexy pre zoradenia (percentChange, marketCap, atď.)
>
> 2. Aké polia by mal obsahovať 1 stock záznam:
>
>    - symbol, name (?), sector, industry
>    - price, prevClose, change, changePercent
>    - marketCap, volume (ak treba)
>
> 3. Ako by sa toto malo **aktualizovať**:
>
>    - cez worker v batchoch
>    - cez single updaty pri intraday zmenách
>
> 4. Ako z toho spraviť:
>
>    - endpoint pre All stocks (`/api/stocks/optimized`)
>    - endpoint pre heatmapu (`/api/heatmap/optimized`)
>    - endpoint pre favourites / watchlist

**Súčasné Redis kľúče:**

- `stock:{project}:{ticker}` - per-ticker cache
- `heatmap:all-companies` - heatmap payload
- `heatmap:version` - ETag verzia
- `last:{date}:{ticker}` - real-time prices
- `prevClose:{date}:{ticker}` - previous closes

**Čo navrhnúť:**

- Unified Redis schema
- Optimalizovaný payload (minimal fields)
- ZSET indexy pre sorting (percentChange, marketCap)
- Batch update strategy
- Single update strategy (pre real-time)

**Formát odpovede:**

```typescript
// Navrhovaná štruktúra
interface RedisStockModel {
  // Kľúče
  'stocks:latest:{ticker}': StockPayload
  'stocks:index:percentChange': ZSET  // score = percentChange, member = ticker
  'stocks:index:marketCap': ZSET      // score = marketCap, member = ticker
  'heatmap:payload': HeatmapPayload
  'heatmap:sectors': SectorAggregates
}

// Update strategy
- Worker batch: MSET pre všetky tickery
- Real-time: HSET pre jednotlivé tickery
- Index update: ZADD pre ZSET indexy
```

---

## 🧱 3. Refaktor /api/stocks → batch + cache-first

> Cieľ: `/api/stocks` nech:
>
> - **nevolá Polygon sériovo** pre 3000 tickerov
> - používa **Redis read model** ako primárny zdroj
> - Polygon iba fallback / refresh
>
> Prosím:
>
> 1. Najdi aktuálnu implementáciu `/api/stocks` a:
>
>    - popíš, koľko max requestov môže spraviť
>    - kde presne je sériové volanie
>
> 2. Navrhni **nový dizajn**:
>
>    - FE pošle tickers → BE sa pozrie do Redis read modelu
>    - ak ticker chýba alebo je starý, doplní / refreshne cez Polygon
>
> 3. Priprav konkrétny **diff / patch**, ktorý:
>
>    - zavedie túto cache-first logiku
>    - zredukuje počet Polygon volaní
>
> Bonus: navrhni aj jednoduchý **rate-limit guard**, napr. max X Polygon volaní/request.

**Súčasný problém:**

```typescript
// Súčasný kód - sériové volanie
const promises = tickerList.map(async (ticker, index) => {
  if (index > 0) {
    await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms delay
  }
  // fetch Polygon API
});
// Pre 3000 tickerov: 3000 × 200ms = 10 minút
```

**Cieľový dizajn:**

```typescript
// Cache-first logika
1. Skús Redis read model pre všetky tickery (MGET)
2. Identifikuj chýbajúce alebo staré tickery
3. Pre chýbajúce/staré: batch fetch z Polygon (max 10 paralelných)
4. Ulož do Redis read modelu
5. Vráť kombinované dáta (Redis + fresh Polygon)
```

**Čo navrhnúť:**

- Nová cache-first logika
- Batch processing pre Polygon API (Promise.all s limitovanou konkurrenciou)
- Rate limit guard (max X Polygon volaní per request)
- Fallback strategy (ak Redis fail, čo robiť)
- Code diff s konkrétnymi zmenami

---

## 🔁 4. Zjednotenie DTO medzi /api/stocks a /api/heatmap

> Chcem, aby:
>
> - `/api/stocks` aj `/api/heatmap` vracali **rovnaký tvar stock objektu** (DTO)
> - FE komponenty mohli zdieľať typy, selektory, utility
>
> Prosím:
>
> 1. Nájdeš všetky typy, ktoré reprezentujú stock / company (napr. `StockDto`, `HeatmapCompany`, `CompanyNode`, atď.).
>
> 2. Navrhni jeden unified typ, napr. `MarketStockDTO`.
>
> 3. Priprav patch:
>
>    - definícia `MarketStockDTO` v `src/types/market.ts`
>    - /api/stocks a /api/heatmap budú tento typ používať
>    - FE komponenty budú typovo zosúladené.
>
> Cieľ: žiadne „dva odlišné JSON formáty" pre tú istú vec.

**Súčasné typy:**

- `StockData` (v `src/lib/types.ts`)
- `CompanyNode` (v `src/components/MarketHeatmap.tsx`)
- Rôzne formáty v API responses

**Čo navrhnúť:**

```typescript
// Unified DTO
interface MarketStockDTO {
  // Identifikácia
  ticker: string;
  companyName: string;

  // Klasifikácia
  sector: string;
  industry: string;

  // Ceny
  currentPrice: number;
  previousClose: number;
  change: number; // currentPrice - previousClose
  changePercent: number; // (change / previousClose) * 100

  // Market cap
  marketCap: number;
  marketCapDiff: number; // change in market cap

  // Metadata
  lastUpdatedAt: string; // ISO timestamp
  source: "polygon" | "sessionPrice" | "cache";
}
```

**Migračný plán:**

1. Vytvoriť `MarketStockDTO` typ
2. Refaktorovať `/api/stocks` na používanie `MarketStockDTO`
3. Refaktorovať `/api/heatmap` na používanie `MarketStockDTO`
4. Aktualizovať FE komponenty na používanie `MarketStockDTO`
5. Odstrániť staré typy

---

## 📈 5. Monitoring & Logging pre celý pipeline

> Potrebujem mať **prehľad, kde to reálne laguje**.
> Prosím navrhni:
>
> 1. Aké metriky logovať:
>
>    - čas spracovania jedného batchu vo workeri
>    - celkový čas cyklu
>    - čas odpovede `/api/stocks`, `/api/heatmap`
>    - počet Polygon volaní / minútu
>    - cache hit rate v Redis-e
>
> 2. Kam a ako to logovať:
>
>    - konzola + JSON log
>    - prípadne štruktúrované logy (objekt, nie string)
>
> 3. Ako z toho odvodiť:
>
>    - alerty („worker cycle > 15 min", „cache hit rate < 80%")
>    - grafy (ak mám v budúcnosti Prometheus / Grafana)

**Metriky na logovanie:**

**Worker metriky:**

- Batch processing time (per batch)
- Total cycle time (all batches)
- Tickers processed per second
- Polygon API calls per minute
- DB write time (SessionPrice upserts)
- Redis write time

**API metriky:**

- Request duration (`/api/stocks`, `/api/heatmap`)
- Cache hit rate (Redis)
- Polygon API calls per request
- DB query time
- Payload size (bytes)

**Redis metriky:**

- Cache hit/miss ratio
- TTL expiration rate
- Memory usage per key pattern

**Formát logov:**

```typescript
// Štruktúrované logy
{
  timestamp: '2025-01-18T13:40:00Z',
  level: 'info',
  service: 'worker',
  event: 'batch_complete',
  metrics: {
    batchSize: 70,
    duration: 15000,  // ms
    tickersProcessed: 70,
    polygonCalls: 70,
    dbWrites: 70,
    errors: 0
  }
}
```

**Alerty:**

- Worker cycle > 15 min → warning
- Cache hit rate < 80% → warning
- API response time > 5s → error
- Polygon rate limit exceeded → error

---

## 🧭 6. Roadmap – fázy refaktoru

> Na základe aktuálneho stavu a cieľovej architektúry mi navrhni **roadmap** v 3–5 fázach:
>
> - **Fáza 1 (rýchle výhry, 1–2 týždne)**
>
>   - čo upraviť (konkrétne PR / moduly)
>
> - **Fáza 2 (stabilný read model, 2–4 týždne)**
>
>   - presun read path do Redis
>
> - **Fáza 3 (scalability & multi-project, 4–8 týždňov)**
>
>   - podporu pre ďalšie projekty (PremarketPrice, GainersLosers, atď.)
>
> - (voliteľne) Fáza 4 – real-time / WebSockets
>
> Pri každej fáze:
>
> - ktoré súbory sa budú najviac meniť
> - ako sa zmení flow
> - aké riziká treba riešiť (backwards compatibility, migrácie)

**Formát roadmapy:**

### Fáza 1: Rýchle výhry (1–2 týždne)

**Cieľ:** Opraviť najväčšie bottlenecky bez zmeny architektúry

**Úlohy:**

1. Batch processing v `/api/stocks` (Promise.all s limitovanou konkurrenciou)
2. Optimalizácia DB queries (composite indexy)
3. Zjednotenie DTO (`MarketStockDTO`)
4. Základné metriky a logovanie

**Súbory:**

- `src/app/api/stocks/route.ts`
- `src/lib/types.ts` (nový `MarketStockDTO`)
- `src/app/api/heatmap/route.ts` (migrácia na `MarketStockDTO`)

**Riziká:**

- Backwards compatibility (staré FE môže očakávať starý formát)
- Testovanie (potrebné testy pre nový batch processing)

---

### Fáza 2: Stabilný read model (2–4 týždne)

**Cieľ:** Presunúť read path do Redis read modelu

**Úlohy:**

1. Vytvoriť Redis read model štruktúru
2. Worker aktualizuje Redis read model (nielen DB)
3. `/api/stocks` a `/api/heatmap` čítajú z Redis read modelu
4. Polygon API len ako fallback/refresh

**Súbory:**

- `src/lib/redis.ts` (nové funkcie pre read model)
- `src/workers/polygonWorker.ts` (aktualizácia Redis read modelu)
- `src/app/api/stocks/route.ts` (cache-first logika)
- `src/app/api/heatmap/route.ts` (cache-first logika)

**Riziká:**

- Migrácia existujúcich dát do Redis read modelu
- Synchronizácia medzi DB a Redis
- Cache invalidation strategy

---

### Fáza 3: Scalability & Multi-project (4–8 týždňov)

**Cieľ:** Podpora pre viacero projektov na jednom backend

**Úlohy:**

1. Project-aware Redis kľúče (`stocks:{project}:latest`)
2. Unified API s project parametrom
3. Worker podporuje viacero projektov
4. Monitoring a alerting pre každý projekt

**Súbory:**

- `src/lib/redis.ts` (project-aware kľúče)
- `src/app/api/stocks/route.ts` (project parameter)
- `src/app/api/heatmap/route.ts` (project parameter)
- `src/workers/polygonWorker.ts` (multi-project support)

**Riziká:**

- Data isolation medzi projektmi
- Performance impact (viac projektov = viac dát)
- Migration existujúcich projektov

---

### Fáza 4: Real-time / WebSockets (voliteľné, 4–8 týždňov)

**Cieľ:** Real-time updates cez WebSockets

**Úlohy:**

1. WebSocket server pre real-time price updates
2. Redis Pub/Sub pre broadcast updates
3. FE WebSocket klient pre live updates
4. Fallback na polling ak WebSocket fail

**Súbory:**

- `src/lib/websocket-server.ts` (už existuje, rozšíriť)
- `src/hooks/useWebSocket.ts` (už existuje, rozšíriť)
- `src/workers/polygonWorker.ts` (Redis Pub/Sub publish)

**Riziká:**

- WebSocket scalability (connection limits)
- Message ordering a deduplication
- Fallback strategy

---

## 📋 Checklist pre Cursor

Pri odpovediach na tieto otázky, prosím:

- [ ] Navrhni konkrétnu architektúru s diagramami
- [ ] Poskytni code diffs pre refaktoring
- [ ] Odhadni časovú náročnosť každej fázy
- [ ] Identifikuj riziká a závislosti
- [ ] Navrhni migračný plán (backwards compatibility)
- [ ] Zahrň monitoring a alerting strategy

---

## 🎯 Očakávaný výsledok

Po zodpovedaní týchto otázok by sme mali mať:

1. **Cieľovú architektúru** - Single Source of Truth, unified read model
2. **Redis read model návrh** - optimalizovaná štruktúra pre všetky views
3. **Refaktoring plán** - konkrétne code diffs pre `/api/stocks`
4. **Unified DTO** - jeden typ pre všetky API responses
5. **Monitoring strategy** - metriky, logy, alerty
6. **Roadmap** - 3–5 fáz implementácie s časovými odhadmi

---

## 📝 Poznámky

- Tieto otázky nadväzujú na Part 1 a Part 2
- Zameraj sa na **merateľné zlepšenia** a **konkrétne implementácie**
- Navrhni **incrementálny prístup** (fázy, nie big bang refactor)
- Zohľadni **backwards compatibility** a **migračné riziká**
