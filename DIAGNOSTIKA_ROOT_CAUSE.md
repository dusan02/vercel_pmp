# 🔍 Diagnostika Root Cause: Prečo je veľa 0% a sivé

## 🎯 Executive Summary

**Root Cause:** Mix 2 vecí:
1. **Polygon často nemá PM print/quote** → padáš na `prevDay.c` (stale) alebo `null` (0)
2. **UX pravidlo "ak chýba ref alebo cena → percentChange = 0" + `colorScale(0)` = sivá** → vyzerá to ako "nemáme dáta"

**Presný problém:**
- `changePercent = 0` → `colorScale(0)` = `#374151` (sivá farba) - **ROOT CAUSE**
- `isStale` sa **NEPOUŽÍVA** pre farbu - farba je len z `colorScale(changePercent)`
- Ak `currentPrice > 0` ale `previousClose = 0` → `changePercent = 0` → sivá farba

**Kľúčové zistenie:**
- Farba sa určuje **ZLEN** z `colorScale(changePercent)` v `MarketHeatmap.tsx:1068`
- `isStale` sa posiela do frontendu, ale **NEPOUŽÍVA sa** pre farbu
- `colorScale(0)` = `#374151` (gray-700) - **sivá farba**

---

## Odpovede na otázky A-F

### A) Je to "no PM trades" alebo "broken pipeline"?

#### 1. Koľko tickerov má v pre-market reálne `effectivePrice.source != 'regularClose'`?

**Odpoveď:** **Nevieme presne** - nie je to logované

**Kód:**
```typescript
// priceResolver.ts:135-292
export function resolveEffectivePrice(...): EffectivePrice | null {
  // Pre pre-market:
  // Priority 1: lastTrade.p (ak valid)
  // Priority 2: min.c (ak valid)
  // Priority 3: lastQuote.p (ak valid)
  // Fallback: prevDay.c (stale) → source='regularClose'
  // Ak nič: return null
}
```

**Problém:** `source` sa loguje len v debug móde, nie v produkcii

**Čo treba:**
- Pridať logging: `console.log(\`${symbol}: source=${effectivePrice.source}\`)`
- Alebo metrics: `metrics.increment('price_source', { source: effectivePrice.source })`

---

#### 2. Koľko tickerov vracia `resolveEffectivePrice() === null`?

**Odpoveď:** **Nevieme presne** - nie je to logované

**Kód:**
```typescript
// polygonWorker.ts:177-179
if (!effectivePrice || effectivePrice.price <= 0) {
  return null; // normalizeSnapshot vráti null
}

// polygonWorker.ts:808-810
if (!normalized) {
  results.push({ 
    symbol, 
    price: 0, 
    changePct: 0, 
    success: false, 
    error: 'No price data' 
  });
}
```

**Problém:** `error: 'No price data'` sa loguje len pre GOOG/GOOGL (debug)

**Čo treba:**
- Pridať counter: `nullPriceCount++` a logovať na konci batchu
- Alebo metrics: `metrics.increment('price_resolve_null')`

---

#### 3. Pre tie tickery so `price=0`: čo konkrétne chýba v snapshot-e?

**Odpoveď:** **Nevieme presne** - nie je to logované

**Kód:**
```typescript
// priceResolver.ts:291-292
// No valid pre-market price found
return null; // Ak ani prevDay.c nie je
```

**Problém:** Nevieme, či chýba `lastTrade`, `min`, `lastQuote`, alebo `prevDay`

**Čo treba:**
- Pridať detailný log pred `return null`:
```typescript
console.log(`❌ ${snapshot.ticker}: No PM price - lastTrade=${!!snapshot.lastTrade}, min=${!!snapshot.min}, lastQuote=${!!snapshot.lastQuote}, prevDay=${!!snapshot.prevDay}`);
```

---

#### 4. Je to vždy tie isté tickery, alebo sa to mení každý deň?

**Odpoveď:** **Nevieme** - nie je to trackované

**Čo treba:**
- Pridať tracking do DB alebo Redis:
  - `ticker_no_pm_data:${symbol}:${date}` = count
  - Alebo `ticker_no_pm_data:${symbol}` = last seen date

---

### B) Je problém v výbere ceny (resolver), alebo v tom čo renderujeme?

#### 5. V heatmape: sivá farba je naviazaná na `isStale` alebo na `changePct === 0`?

**Odpoveď:** **Farba sa určuje z `colorScale(changePercent)` - ak `changePercent = 0`, farba je neutrálna (nie sivá, ale môže vyzerať sivá)**

**Backend (heatmap/route.ts):**
```typescript
// heatmap/route.ts:605-619
results.push({
  ticker,
  companyName: tickerInfo.name || ticker,
  currentPrice,
  percentChange: changePercent, // Môže byť 0
  marketCap,
  marketCapDiff,
  isStale, // Posiela sa do frontendu (ale NEPOUŽÍVA sa pre farbu)
  // ...
});
```

**Frontend (MarketHeatmap.tsx):**
```typescript
// MarketHeatmap.tsx:1067-1068
const v = metric === 'mcap' ? (company.marketCapDiff ?? 0) : company.changePercent;
const tileColor = colorScale(v); // Farba sa určuje ZLEN z changePercent alebo marketCapDiff
```

**Frontend (HeatmapTile.tsx):**
```typescript
// HeatmapTile.tsx:81
backgroundColor: color, // Používa sa len colorScale(v), NIE isStale
```

**Zistenie:** `isStale` sa **NEPOUŽÍVA** pre farbu - farba je len z `colorScale(changePercent)`

**Presná odpoveď:**
```typescript
// heatmapColors.ts:18-19
domain: [-5, -2, 0, 2, 5],
range: ['#ef4444', '#f87171', '#374151', '#4ade80', '#22c55e'],
//                                    ^^^^^^^^
//                                    Sivá farba pre 0%
```

**`colorScale(0)` = `#374151`** (gray-700 v Tailwind) - **SIVÁ FARBA**

**Výsledok:** Ak `changePercent = 0` → farba je **sivá** (`#374151`)

---

#### 6. Ak je `source='regularClose'` (fallback), prečo to má byť sivé?

**Odpoveď:** **Je to UX rozhodnutie** - `isStale = true` pre fallback

**Kód:**
```typescript
// priceResolver.ts:282-288
if (snapshot.prevDay?.c && snapshot.prevDay.c > 0) {
  return {
    price: snapshot.prevDay.c,
    source: 'regularClose',
    timestamp: new Date(candidateTsMs),
    isStale: true, // Explicitne označené ako stale
    staleReason: 'No valid pre-market price; falling back to previous close'
  };
}
```

**Problém:** `isStale = true` → frontend zobrazí sivú farbu

**Otázka:** Je to správne? Alebo by sme mali mať:
- `isStale = false` (zobrazí farbu, aj keď je to fallback)
- `hasNoPMData = true` (nový flag pre "no PM trades")

---

#### 7. Prečo `stockService.ts` forced fallbackuje na 0 namiesto "posledná známa percentChange" (z DB)?

**Odpoveď:** **Je to vedomý business requirement** - lepšie než stale percentá

**Kód:**
```typescript
// stockService.ts:328-333
// CRITICAL: Always use calculated percentChange if we have valid reference price
// Don't fallback to s.lastChangePct (it may be stale) - same as heatmap API
// This ensures consistency between heatmap and tables
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : 0; // Return 0 instead of stale lastChangePct
```

**Dôvod:** Komentár hovorí "lepšie než stale lastChangePct"

**Otázka:** Je to stále správne? Alebo by sme mali:
- Použiť `s.lastChangePct` ak `currentPrice > 0` ale `previousClose = 0`?
- Alebo explicitne označiť "no reference price" namiesto `0%`?

---

### C) Reference price: niekde môže byť "všetko ok, len chýba prevClose"

#### 8. Pre tickery s `currentPrice > 0` a stále `0%`: je `previousClose` null/0?

**Odpoveď:** **ÁNO** - to je presne príčina

**Kód:**
```typescript
// stockService.ts:331-333
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : 0; // Ak previousClose = 0, percentChange = 0
```

**Kód:**
```typescript
// priceResolver.ts:515-520
if (!referencePrice || referencePrice <= 0) {
  return {
    changePct: 0,
    reference: { used: null, price: null }
  };
}
```

**Problém:** Ak `previousClose = 0`, `changePct = 0` → sivá farba

---

#### 9. Z ktorého zdroja sa berie `previousClose` v heatmap route: Redis vs DB? A kedy to môže byť prázdne?

**Odpoveď:** **Redis → DB → Polygon** (fallback chain)

**Kód:**
```typescript
// heatmap/route.ts:200-250
// 1. Redis cache (fast)
const prevCloseBatchMap = await getPrevClose(todayTradingDateStr, tickers);

// 2. DB fallback
if (prevCloseBatchMap.size === 0) {
  const dailyRefs = await prisma.dailyRef.findMany({
    where: { symbol: { in: tickers }, date: todayTradingDay },
    select: { symbol: true, previousClose: true }
  });
  // ...
}

// 3. Ticker table fallback
const previousClose = (tickerInfoFromMap?.latestPrevClose || 0) || (previousCloseMap.get(ticker) || 0);
```

**Kedy môže byť prázdne:**
1. **Redis cache expired** (TTL)
2. **DB nemá DailyRef** pre dnešný trading day
3. **Ticker.latestPrevClose = null/0** (broken ticker)
4. **Model A mismatch** - používa sa zlý trading date key

---

#### 10. Je Model A aplikovaný aj v heatmap endpoint, alebo len vo workerovi?

**Odpoveď:** **ÁNO** - Model A je aplikovaný aj v heatmap

**Kód:**
```typescript
// heatmap/route.ts:200-210
// Model A: prevCloseKey(todayTradingDay) = close(yesterdayTradingDay)
const todayTradingDay = getLastTradingDay(calendarDateET);
const todayTradingDateStr = getDateET(todayTradingDay);

const prevCloseBatchMap = await getPrevClose(todayTradingDateStr, tickers);
```

**Kód:**
```typescript
// heatmap/route.ts:525-527
// Prefer denormalized prev close (fast), fallback to DailyRef-derived map
const tickerInfoFromMap = tickerMap.get(ticker);
previousClose = (tickerInfoFromMap?.latestPrevClose || 0) || (previousCloseMap.get(ticker) || 0);
```

**Problém:** Ak `latestPrevCloseDate != yesterdayTradingDay`, `latestPrevClose` môže byť stale

**Čo treba:**
- Skontrolovať, či `latestPrevCloseDate` sa kontroluje v heatmap endpoint

---

### D) Timing a frekvencie: je 5 min realita?

#### 11. Keď je session = `pre`, skutočne prebehne refresh všetkých non-premium do 5 min?

**Odpoveď:** **Teoreticky áno, prakticky závisí od rate limitov**

**Kód:**
```typescript
// polygonWorker.ts:1508-1510
const isPreMarketOrAfterHours = session === 'pre' || session === 'after' || (session === 'closed' && !isWeekendOrHoliday);
const PREMIUM_INTERVAL = isPreMarketOrAfterHours ? 5 * 60 * 1000 : 60 * 1000; // 5min pre-market
const REST_INTERVAL = 5 * 60 * 1000; // 5 min pre všetky
```

**Kód:**
```typescript
// polygonWorker.ts:1554-1559
// Polygon API: 5 req/s = 300 req/min
// Conservative: use 250 req/min to leave buffer
const MAX_REQUESTS_PER_MINUTE = 250;
const batchSize = 70;
const delayBetweenBatches = Math.ceil((60 * 1000) / (MAX_REQUESTS_PER_MINUTE / batchSize)); // ~17s
```

**Výpočet:**
- 500 tickerov / 70 per batch = ~7 batchov
- 7 batchov × 17s delay = ~2 min (len delay)
- + API čas = ~3-4 min celkovo

**Problém:** Ak je viac ako 500 tickerov, môže to trvať dlhšie ako 5 min

---

#### 12. Koľko tickerov reálne stihne jeden ingest cyklus pri batch size 70 a rate limitoch?

**Odpoveď:** **Závisí od rate limitov a počtu batchov**

**Výpočet:**
- **Rate limit:** 250 req/min (conservative)
- **Batch size:** 70 tickerov
- **Batches per minute:** 250 / 70 = ~3.5 batchov/min
- **Tickerov za minútu:** 3.5 × 70 = ~245 tickerov/min

**Pre 500 tickerov:**
- 500 / 245 = ~2 min (teoreticky)
- + overhead = ~3-4 min (realisticky)

**Problém:** Ak je 600+ tickerov, jeden cyklus môže trvať 5+ min → niektoré tickery preskočia interval

---

#### 13. Čo sa stane pri Polygon error / rate limit: retry? skip? a zostane ticker "zamrznutý"?

**Odpoveď:** **Retry s circuit breaker, ale môže skipnúť batch**

**Kód:**
```typescript
// polygonWorker.ts:88-92
if (polygonCircuitBreaker.isOpen) {
  console.warn('⚠️ Polygon circuit breaker is OPEN, skipping API calls');
  return []; // Vráti prázdny array
}
```

**Kód:**
```typescript
// polygonWorker.ts:112-116
if (!response.ok) {
  polygonCircuitBreaker.recordFailure();
  console.error(`Polygon API error: ${response.status} ${response.statusText}`);
  continue; // Skip tento batch
}
```

**Kód:**
```typescript
// polygonWorker.ts:132-135
catch (error) {
  polygonCircuitBreaker.recordFailure();
  console.error(`Error fetching batch ${i}-${i + batchSize}:`, error);
  // Continue to next batch (skip failed batch)
}
```

**Problém:**
- Ak circuit breaker je OPEN → **všetky batchy sa skipnú** → tickery zostanú "zamrznuté"
- Ak jeden batch failne → **len ten batch sa skipne** → tickery v tom batchi zostanú "zamrznuté"

**Čo treba:**
- Trackovať, ktoré tickery boli skipnuté
- Retry skipnuté tickery v ďalšom cykle

---

### E) Biznis rozhodnutie: čo má heatmapa ukazovať keď "nie sú PM obchody"

#### 14. Ak ticker nemá PM print: chceš zobraziť?

**Odpoveď:** **Musíme sa rozhodnúť** - aktuálne je to **B) "0%" a sivé**

**Aktuálne správanie:**
- `source='regularClose'` → `isStale=true` → sivá farba
- `price=0` → `changePct=0` → sivá farba

**Možnosti:**
- **A) "No PM trades yet"** (neutral farba) - potrebuje nový flag
- **B) "0%" ale nie sivé** - zmeniť `isStale` logiku
- **C) "posledná after-hours zmena"** - potrebuje after-hours tracking
- **D) "gap vs close"** - potrebuje extended hours tracking

---

#### 15. Má byť cieľ **100% coverage farieb**, aj keď to nebude striktne "premarket"?

**Odpoveď:** **Musíme sa rozhodnúť** - aktuálne je to **NIE** (sivá = no PM data)

**Aktuálne správanie:**
- `isStale=true` → sivá farba (explicitne UX rozhodnutie)

**Otázka:** Chceš:
- **"Pravdivú" heatmapu** (sivá = no PM trades) - aktuálne
- **"Živú" heatmapu** (farba aj bez PM printu) - potrebuje zmeny

---

### F) Monitoring / dôkaz

#### 16. Spravte diagnostiku: top 20 najčastejších tickerov, ktoré sú v premarket stále `source='regularClose'` alebo `null`.

**Odpoveď:** **Potrebujeme skript na diagnostiku**

**Čo treba:**
- Skript, ktorý:
  1. Načíta všetky tickery z `universe:sp500`
  2. Pre každý ticker zavolá Polygon snapshot
  3. Zavolá `resolveEffectivePrice()` pre pre-market session
  4. Zaznamená `source` a `isStale`
  5. Vypíše top 20 s `source='regularClose'` alebo `null`

**Hypotéza:** Sú to ADR/NYSE foreign/ETF (Polygon coverage issue)

---

## 📊 Súhrn Root Cause

### Hlavné problémy:

1. **Polygon často nemá PM print/quote**
   - → Fallback na `prevDay.c` → `isStale=true` (ale **NEPOUŽÍVA sa pre farbu**)
   - → Ak ani `prevDay.c` nie je → `null` → `price=0` → `changePct=0` → `colorScale(0)` = `#374151` (sivá)

2. **UX pravidlo "ak chýba ref alebo cena → percentChange = 0" + `colorScale(0)` = sivá**
   - → `changePercent = 0` → `colorScale(0)` = `#374151` (sivá farba)
   - → Vyzerá to ako "nemáme dáta"
   - → Ale v skutočnosti môže byť `currentPrice > 0` len chýba `previousClose`

3. **`isStale` sa NEPOUŽÍVA pre farbu**
   - → Farba je **ZLEN** z `colorScale(changePercent)`
   - → Ak `changePercent = 0`, farba je vždy sivá (`#374151`), bez ohľadu na `isStale`

4. **Chýba monitoring/logging**
   - → Nevieme, koľko tickerov má `source='regularClose'` vs `null`
   - → Nevieme, ktoré tickery sú problémové

### Presné miesta v kóde:

1. **`priceResolver.ts:282-288`** - Fallback na `prevDay.c` → `isStale=true` (ale neovplyvňuje farbu)
2. **`priceResolver.ts:291-292`** - Return `null` ak ani `prevDay.c` nie je → `price=0`
3. **`stockService.ts:331-333`** - Forced fallback na `0` ak chýba reference → `changePercent=0`
4. **`heatmap/route.ts:605-619`** - Posiela `isStale` do frontendu (ale **NEPOUŽÍVA sa**)
5. **`heatmapColors.ts:18-19`** - `colorScale(0)` = `#374151` (sivá farba) - **ROOT CAUSE**
6. **`MarketHeatmap.tsx:1067-1068`** - `tileColor = colorScale(v)` - farba len z `changePercent`, nie z `isStale`

---

## 💡 Odporúčania

### 1. Pridať monitoring/logging
- Trackovať `source` pre každý ticker (`lastTrade`, `min`, `lastQuote`, `regularClose`, `null`)
- Trackovať `null` prípady (koľko tickerov má `price=0`)
- Trackovať `changePercent=0` prípady (koľko tickerov má `0%` kvôli chýbajúcemu `previousClose`)
- Identifikovať problémové tickery (top 20 s `source='regularClose'` alebo `null`)

### 2. Rozhodnúť sa: "pravdivá" vs "živá" heatmapa
- **"Pravdivá"** = sivá = no PM data (aktuálne: `changePercent=0` → `#374151`)
- **"Živá"** = farba aj bez PM printu (potrebuje zmeny v `colorScale` alebo fallback logike)

### 3. Zlepšiť fallback handling
- **Možnosť A:** Ak `source='regularClose'`, možno `isStale=false` (ale to neovplyvní farbu, lebo `isStale` sa nepoužíva)
- **Možnosť B:** Nový flag `hasNoPMData=true` a zmeniť `colorScale` logiku (ak `hasNoPMData`, použiť inú farbu)
- **Možnosť C:** Ak `source='regularClose'`, použiť `lastChangePct` z DB namiesto `0%` (ak existuje)

### 4. Opraviť "chýba previousClose" prípad
- **Možnosť A:** Ak `currentPrice > 0` ale `previousClose = 0`, použiť `lastChangePct` z DB
- **Možnosť B:** Explicitne označiť "no reference price" namiesto `0%` (nový flag)
- **Možnosť C:** Zmeniť `colorScale` - ak `changePercent=0` a `hasNoReference=true`, použiť inú farbu (napr. žltú)

### 5. Zmeniť `colorScale` logiku
- **Aktuálne:** `colorScale(0)` = `#374151` (sivá)
- **Možnosť A:** Ak `changePercent=0` a `hasNoPMData=true`, použiť neutrálnu farbu (nie sivú, napr. `#6b7280` - gray-500)
- **Možnosť B:** Ak `changePercent=0` a `currentPrice > 0`, použiť `lastChangePct` z DB (ak existuje)
- **Možnosť C:** Zmeniť `colorScale` - ak `changePercent=0` a `hasNoReference=true`, použiť inú farbu (napr. žltú `#fbbf24`)

---

## 🎯 Kľúčové zistenia

### ✅ Čo sme zistili:

1. **Farba sa určuje ZLEN z `colorScale(changePercent)`**
   - `isStale` sa **NEPOUŽÍVA** pre farbu
   - Ak `changePercent = 0`, farba je vždy `#374151` (sivá)

2. **Príčiny `changePercent = 0`:**
   - `currentPrice = 0` (Polygon nevrátil dáta)
   - `previousClose = 0` (chýba reference price)
   - `regularClose = 0` (pre after-hours, ak chýba regularClose)

3. **Príčiny `currentPrice = 0`:**
   - Polygon snapshot nevrátil `lastTrade`, `min`, `lastQuote`, ani `prevDay`
   - `resolveEffectivePrice()` vráti `null` → `normalizeSnapshot()` vráti `null` → `price=0`

4. **Príčiny `previousClose = 0`:**
   - Redis cache expired
   - DB nemá `DailyRef.previousClose` pre dnešný trading day
   - `Ticker.latestPrevClose = null/0` (broken ticker)
   - Model A mismatch (používa sa zlý trading date key)

### ⚠️ Potenciálne problémy:

1. **Worker môže skipnúť tickery pri rate limit/error**
   - Circuit breaker OPEN → všetky batchy skipnuté
   - Jeden batch failne → tickery v tom batchi "zamrznuté"

2. **5 min interval môže byť nedostatočný**
   - Pre 600+ tickerov môže jeden cyklus trvať 5+ min
   - Niektoré tickery preskočia interval

3. **Chýba tracking problémových tickerov**
   - Nevieme, ktoré tickery majú `source='regularClose'` vs `null`
   - Nevieme, či sú to ADR/NYSE foreign/ETF (Polygon coverage issue)

---

## 💬 Odpoveď na biznis otázku

**Chceš radšej "pravdivú" heatmapu (sivá = no PM trades), alebo "živú" (farba aj bez PM printu)?**

**Aktuálne:** "Pravdivá" - `changePercent=0` → `#374151` (sivá)

**Ak chceš "živú" heatmapu, možnosti:**
1. **Fallback na `lastChangePct`** - ak `changePercent=0` a `currentPrice > 0`, použiť `lastChangePct` z DB
2. **Zmeniť `colorScale`** - ak `changePercent=0` a `hasNoPMData=true`, použiť inú farbu (nie sivú)
3. **Nový flag `hasNoPMData`** - explicitne označiť "no PM trades" a zobraziť neutrálnu farbu (nie sivú)
