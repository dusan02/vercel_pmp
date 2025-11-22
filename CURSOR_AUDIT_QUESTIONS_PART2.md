# 🔥 Advanced Cursor Audit Questions (Part 2) – Deep Performance & Consistency Check

Tento dokument obsahuje pokročilé technické otázky pre Cursor, ktoré nadväzujú na `DATA_FLOW_ANALYSIS_ANSWERS.md` a zamerajú sa na:
- Performance bottlenecky
- Race conditions
- API konzistenciu
- Redis optimalizáciu
- DB query optimalizáciu
- Frontend performance
- Skryté bugy a nekonzistencie

---

## 🔧 1. API Consistency Audit

> Prosím skontroluj celý projekt a odpovedz na tieto otázky:
>
> **1) Sú na všetkých API route jednotné pravidlá:**
>
> * `cache: 'no-store'`?
> * správne nastavovanie `Cache-Control`?
> * rovnaký formát chybových odpovedí?
> * rovnaký návratový payload pre tickery?
>
> **2) Existuje niekde API route, ktorá:**
>
> * používa dlhší ISR alebo implicitný Next.js cache?
> * generuje staršie dáta než ostatné endpointy?
> * má nestabilný alebo nepredvídateľný JSON tvar?
>
> **3) Sú endpointy `/api/stocks` a `/api/heatmap` konzistentné v tom:**
>
> * odkiaľ berú percentuálnu zmenu?
> * ako rátajú `changePercent`, `marketCap`, `prevClose`?
> * či rátajú rozdiel medzi *fresh* a *SessionPrice*?

**Súbory na kontrolu:**
- `src/app/api/stocks/route.ts`
- `src/app/api/heatmap/route.ts`
- `src/app/api/stocks/optimized/route.ts`
- `src/app/api/earnings-finnhub/route.ts`

**Čo hľadať:**
- Rozdiely v `Cache-Control` headers
- Rozdiely v error response formáte
- Rozdiely v výpočte `percentChange` (SessionPrice.changePct vs computePercentChange)
- Rozdiely v `marketCap` výpočte
- ISR/revalidate nastavenia

---

## ⚡ 2. Redis Deep Check

> Prosím skontroluj kompletné používanie Redis cache a odpovedz:
>
> **1) Sú Redis kľúče správne invalidované?**
>
> * `heatmap:*`
> * `stock:*`
> * `heatmap:version`
> * `session-price:*`
>
> **2) Je niekde problém typu:**
>
> * "old key overwritten with stale data"?
> * TTL neexistuje kde má byť?
> * TTL má iný formát (sekundy vs ms)?
>
> **3) Existuje niektorý cache key, ktorý vôbec neexpiruje?**
>
> **4) Má `/api/heatmap` riziko, že si prečíta cache *pred* tým, ako worker uloží nové dáta?**
>
> **5) Navrhni ako zefektivniť Redis volania:**
>
> * použitie `MGET`
> * pipelining
> * batching
> * zmenšenie payloadu

**Súbory na kontrolu:**
- `src/lib/redis.ts`
- `src/lib/redisHelpers.ts`
- `src/app/api/stocks/route.ts` (getCachedData, setCachedData)
- `src/app/api/heatmap/route.ts` (getCachedData, setCachedData)
- `src/workers/polygonWorker.ts` (Redis zápisy)

**Čo hľadať:**
- Redis kľúče bez TTL
- Nekonzistentné TTL formáty (sekundy vs milisekundy)
- Race conditions pri zápise/čítaní
- Možnosť použiť MGET namiesto viacerých GET
- Možnosť použiť pipeline pre batch operácie

---

## 🧵 3. Worker Race Condition Audit

> Pozri worker (`polygonWorker.ts`) a odpovedz:
>
> **1) Môže nastať race condition:**
>
> * pri zápise do DB (SessionPrice)?
> * pri zápise do Redis?
> * pri incrementovaní verzie heatmapy?
>
> **2) Ak worker beží dlhšie než interval, môže sa pustiť druhá inštancia?**
>
> **3) Môže worker použiť stale list tickerov?**
>
> **4) Odhaľ možné deadlocky / blocking queries.**

**Súbory na kontrolu:**
- `src/workers/polygonWorker.ts`
- `src/lib/redisAtomic.ts`
- `src/app/api/heatmap/route.ts` (ETag increment)

**Čo hľadať:**
- Concurrent writes do SessionPrice (upsert s `where` unique constraint)
- Concurrent writes do Redis (atomic operations)
- ETag version increment (race condition?)
- Worker interval vs execution time
- Ticker list staleness (getUniverse)

---

## 🛠 4. DB Performance & Query Optimization Audit

> Skontroluj všetky queries, ktoré používajú:
>
> * SessionPrice
> * DailyRef
> * Ticker
>
> Identifikuj:
>
> 1. full table scans
> 2. ORDER BY ktoré nepoužívajú index
> 3. GROUP BY ktoré sú pomalé
> 4. queries, ktoré idú cez veľa joinov ale nepotrebujú to
> 5. miesta, kde by pomohol *composite index*
>
> A navrhni presne, ktoré indexy by urýchlili heatmapu alebo `/api/stocks`.

**Súbory na kontrolu:**
- `src/app/api/heatmap/route.ts` (Prisma queries)
- `src/app/api/stocks/route.ts` (Prisma queries)
- `src/workers/polygonWorker.ts` (Prisma upserts)
- `prisma/schema.prisma` (existujúce indexy)

**Queries na kontrolu:**
```typescript
// Heatmap queries
prisma.sessionPrice.findMany({
  where: { symbol: { in: tickerSymbols }, date: { gte: weekAgo, lt: tomorrow } },
  orderBy: [{ lastTs: 'desc' }, { session: 'asc' }]
})

prisma.dailyRef.findMany({
  where: { symbol: { in: tickerSymbols }, date: { gte: weekAgo, lt: tomorrow } },
  orderBy: { date: 'desc' }
})

prisma.ticker.findMany({
  where: { sector: { not: null }, industry: { not: null } }
})
```

**Čo hľadať:**
- Full table scans (EXPLAIN QUERY PLAN)
- ORDER BY bez indexu
- WHERE podmienky bez indexu
- Možnosť composite indexov (napr. `[symbol, date, session]` pre SessionPrice)
- N+1 queries

---

## 🧩 5. Frontend Performance Audit

> Preskúmaj všetky FE komponenty (najmä heatmapu) a odpovedz:
>
> **1) Sú niekde ťažké výpočty pri každom renderi?**
>
> * d3 treemap
> * sortovanie
> * prepočítavanie sektorov
>
> **2) Ktoré FE výpočty by bolo lepšie presunúť na BE?**
>
> **3) Používa heatmapa zbytočne veľký payload?**
>
> * napr. názvy spoločností, ktoré nepotrebuje
> * percentuálna zmena sa rátá aj na FE aj na BE
> * duplicity v objektoch
>
> **4) Môže heatmapa trpieť tzv. "double render cost"?**
>
> * Client component + useEffect + resizing observer
>
> **5) Nájsť memory leak v Reacte (ak existuje).**

**Súbory na kontrolu:**
- `src/components/MarketHeatmap.tsx` (d3 treemap)
- `src/components/ResponsiveMarketHeatmap.tsx` (data fetching, resizing)
- `src/app/HomePage.tsx` (sorting, filtering)
- `src/hooks/useSortableData.ts`

**Čo hľadať:**
- useMemo/useCallback chýbajúce
- Re-renders pri každej zmene
- D3 treemap výpočty pri každom renderi
- ResizeObserver memory leaks
- Event listeners bez cleanup
- State updates po unmount

---

## 🐛 6. Hidden Bugs / Inconsistencies

> Prosím skontroluj celý projekt a odpovedz:
>
> **1) Môžu percentá "skákať"?**
> (iné zdroje: DB vs Polygon)
>
> **2) Môže FE prebrať staršie dáta keď BE vráti 304?**
>
> **3) Používa sa niekde `force-cache` alebo default cache?**
>
> **4) Môže byť problém s časovými zónami pri DailyRef?**
>
> **5) Môžu byť SessionPrice a Polygon API desynchronizované?**
>
> **6) Nájdi rozdiely medzi tým, čo používa heatmapa a čo používa homepage.**
>
> **7) Skontroluj či dataset pre heatmapu NIKDY neobsahuje starší timestamp než All stocks.**

**Súbory na kontrolu:**
- `src/app/api/stocks/route.ts` (percentChange výpočet)
- `src/app/api/heatmap/route.ts` (percentChange výpočet)
- `src/lib/marketCapUtils.ts` (computePercentChange)
- `src/components/ResponsiveMarketHeatmap.tsx` (304 handling)
- `src/lib/timeUtils.ts` (timezone handling)

**Čo hľadať:**
- Rozdiely v percentChange výpočte (SessionPrice.changePct vs computePercentChange)
- 304 Not Modified handling (staré dáta?)
- Timezone issues (ET vs UTC)
- Timestamp porovnania (lastTs vs updatedAt)
- Data staleness porovnanie (heatmap vs All stocks)

---

## 🚀 7. Critical path: what slows the app MOST?

> Na základe celej analýzy označ 3 najväčšie bottlenecky projektu.
> Pre každý urob:
>
> * prečo je to problém
> * dôkaz z kódu
> * presný upgrade plán (patch diffs)
> * časová náročnosť a dopad na výkon
> * riziká implementácie

**Oblasti na analýzu:**
1. `/api/stocks` - sériové volania Polygon API (3000 × 200ms = 10 min)
2. Worker batch processing - delay medzi batchmi (už optimalizované)
3. DB queries - full table scans alebo chýbajúce indexy
4. FE rendering - d3 treemap výpočty pri každom renderi
5. Redis cache - neefektívne volania (MGET vs GET)

**Formát odpovede:**
```
### Bottleneck 1: [Názov]

**Problém:**
[Popis problému]

**Dôkaz z kódu:**
```typescript
// Súbor: path/to/file.ts
// Riadok: X-Y
[Kód]
```

**Upgrade plán:**
```diff
- [Starý kód]
+ [Nový kód]
```

**Časová náročnosť:** [X hodín]
**Dopad na výkon:** [Y% zlepšenie]
**Riziká:** [Zoznam rizík]
```

---

## 📋 Checklist pre Cursor

Pri odpovediach na tieto otázky, prosím:

- [ ] Uveď konkrétne súbory a riadky kódu
- [ ] Poskytni merateľné metriky (čas, veľkosť payloadu, atď.)
- [ ] Navrhni konkrétne riešenia s code diffs
- [ ] Odhadni časovú náročnosť implementácie
- [ ] Identifikuj riziká a závislosti
- [ ] Porovnaj "pred" a "po" scenáre

---

## 🎯 Očakávaný výsledok

Po zodpovedaní týchto otázok by sme mali mať:

1. **Kompletnú mapu bottleneckov** - kde presne sa stráca čas
2. **Konkrétne patchy** - ready-to-apply code changes
3. **Zjednotený pipeline** - konzistentné API a cache stratégie
4. **Identifikované race conditions** - a ako ich opraviť
5. **Optimalizačný plán** - prioritizovaný zoznam vylepšení
6. **Ultra-rýchlu verziu** - roadmap na maximálny výkon

---

## 📝 Poznámky

- Tieto otázky nadväzujú na `DATA_FLOW_ANALYSIS_ANSWERS.md`
- Odpovede by mali byť technické a konkrétne
- Zameraj sa na merateľné zlepšenia výkonu
- Identifikuj aj "low-hanging fruits" (jednoduché opravy s veľkým dopadom)

