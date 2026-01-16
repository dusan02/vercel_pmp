# 🔍 Finálny Diagnostický Report: Prečo je veľa tickerov s 0% a sivou farbou

## 🎯 Executive Summary

**Root Cause:** Kombinácia 2 problémov:
1. **Polygon často nemá PM print/quote** → fallback na `prevDay.c` (stale) alebo `null` (0)
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

## 📊 Odpovede na kľúčové otázky

### 1. Ktorý proces dodáva preMarketPrice pre tickery mimo top ~50?

**Odpoveď:** **PM2 worker (`polygonWorker.ts`)** - hlavný proces

**Detail:**
- Worker používa `getUniverse('sp500')` ktorý obsahuje **všetky tickery** (cca 500-600)
- **Všetky tickery** v universe sa spracovávajú, nie len top 50
- **Prioritizácia:**
  - **Top 200 premium:** každých 60s (live) alebo 5min (pre-market/after-hours)
  - **Zvyšok:** každých 5min (všetky sessiony)

**Kód:** `polygonWorker.ts:1461, 1501`

---

### 2. Pre ktoré tickery sa nikdy neťahá pre-market price?

**Odpoveď:** **Žiadne** - všetky tickery v `universe:sp500` sa spracovávajú

**Detail:**
- Nie je tam whitelist / hard cap
- Všetky tickery v universe sa spracovávajú
- **Rozdiel je len v frekvencii:** premium častejšie, zvyšok menej často

---

### 3. Ak Polygon snapshot nevráti preMarketPrice, čo sa stane?

**Odpoveď:** **Fallback chain** → ak všetko zlyhá, vráti `null` → `price = 0`

**Fallback chain (pre pre-market):**
1. **Priority 1:** `lastTrade.p` (ak valid)
2. **Priority 2:** `min.c` (ak valid)
3. **Priority 3:** `lastQuote.p` (ak valid)
4. **Fallback:** `prevDay.c` (previous close) - **označené ako stale**
5. **Ak nič:** `null` → `price=0` → `changePct=0` → `colorScale(0)` = sivá

**Kód:** `priceResolver.ts:213-292`

---

### 4. Ktorá časť kódu rozhoduje, že `changePct = 0.00`?

**Odpoveď:** **Dve miesta** - `calculatePercentChange` a `stockService.ts`

**A) `calculatePercentChange` (priceResolver.ts):**
```typescript
// priceResolver.ts:480-485
if (!currentPrice || currentPrice <= 0) {
  return { changePct: 0, reference: { used: null, price: null } };
}

// priceResolver.ts:515-520
if (!referencePrice || referencePrice <= 0) {
  return { changePct: 0, reference: { used: null, price: null } };
}
```

**B) `stockService.ts` (explicitný fallback):**
```typescript
// stockService.ts:331-333
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : 0; // Return 0 instead of stale lastChangePct
```

**Príčiny `changePct = 0`:**
1. `currentPrice <= 0` (žiadna cena z Polygon)
2. `previousClose <= 0` (chýba reference price)
3. `regularClose <= 0` (pre after-hours, ak chýba regularClose)

---

### 5. Cron joby ťahajú pre-market ceny?

**Odpoveď:** **NIE** - len referencie (prevClose, shares, integrity)

**Detail:**
- **verify-prevclose:** Používa `getPreviousClose(ticker)` - **len previousClose**
- **update-static-data:** Používa `getPreviousClose()` a `getSharesOutstanding()` - **len referencie**
- **Nepoužívajú** Polygon snapshot pre pre-market ceny

---

### 6. Existuje batch mechanizmus pre všetky tickery?

**Odpoveď:** **ÁNO** - `ingestLoop` v `polygonWorker.ts`

**Detail:**
- **Kde:** `polygonWorker.ts:1453` - `ingestLoop` funkcia
- **Ako často:**
  - **Premium (top 200):** každých 60s (live) alebo 5min (pre-market/after-hours)
  - **Zvyšok:** každých 5min (všetky sessiony)
- **Check interval:** 60s (worker kontroluje každých 60s, či treba update)
- **Batch size:** 70 tickerov na batch

**Kód:** `polygonWorker.ts:1603`

---

### 7. Ako sa označuje ticker ako "stale / no premarket data"?

**Odpoveď:** **`isStale` flag** v `StockData` interface

**Detail:**
- **Flag:** `isStale: boolean` v `StockData` interface
- **Threshold:**
  - **Live:** 5 minút
  - **Pre-market:** 30 minút
  - **After-hours:** 30 minút
  - **Closed:** 60 minút

**Dôležité:** `isStale` sa **NEPOUŽÍVA** pre farbu - farba je len z `colorScale(changePercent)`

**Kód:** `stockService.ts:311-317`, `heatmap/route.ts:596-603`

---

### 8. Je 0% vedomý fallback (UX rozhodnutie)?

**Odpoveď:** **ÁNO** - explicitne v kóde

**Kód:**
```typescript
// stockService.ts:331-333
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : 0; // Return 0 instead of stale lastChangePct
```

**Komentár v kóde:**
```typescript
// stockService.ts:328-330
// CRITICAL: Always use calculated percentChange if we have valid reference price
// Don't fallback to s.lastChangePct (it may be stale) - same as heatmap API
// This ensures consistency between heatmap and tables
```

**Dôvod:** Lepšie ukázať `0%` než **stale/stare percentá** z DB (`lastChangePct`)

---

### 9. Koľko tickerov má reálne zdroj pre-market dát?

**Odpoveď:** **Všetky tickery v `universe:sp500`** (cca 500-600 tickerov)

**Detail:**
- `getUniverse('sp500')` vracia všetky tickery z Redis set
- Tento set obsahuje:
  - `getAllProjectTickers('pmp')` = cca 360 tickerov
  - SP500 tickery (ak sú v Redis)
  - International NYSE tickers (100 tickerov)
- **Limit:** max 600 tickerov

**Poznámka:** Frekvencia aktualizácie sa líši (premium častejšie), ale **všetky** majú zdroj

---

### 10. Worker spracúva len favorites/premium list?

**Odpoveď:** **NIE** - worker spracováva **všetky tickery** z `universe:sp500`

**Detail:**
- Worker používa `getUniverse('sp500')` - **všetky tickery**
- Premium list (`getAllProjectTickers('pmp').slice(0, 200)`) sa používa len pre **prioritizáciu frekvencie**
- Premium tickery: **častejšie update** (60s live, 5min pre-market)
- Zvyšok: **menej často** (5min všetky sessiony)

---

## 🔍 Presné miesta v kóde

### Root Cause - Sivá farba

**1. `heatmapColors.ts:18-19` - `colorScale(0)` = sivá**
```typescript
domain: [-5, -2, 0, 2, 5],
range: ['#ef4444', '#f87171', '#374151', '#4ade80', '#22c55e'],
//                                    ^^^^^^^^
//                                    Sivá farba pre 0%
```

**2. `MarketHeatmap.tsx:1067-1068` - Farba len z `changePercent`**
```typescript
const v = metric === 'mcap' ? (company.marketCapDiff ?? 0) : company.changePercent;
const tileColor = colorScale(v); // Farba ZLEN z changePercent, NIE z isStale
```

**3. `HeatmapTile.tsx:81` - Používa sa len `color`, nie `isStale`**
```typescript
backgroundColor: color, // Používa sa len colorScale(v), NIE isStale
```

### Príčiny `changePercent = 0`

**4. `priceResolver.ts:480-485` - Ak `currentPrice <= 0`**
```typescript
if (!currentPrice || currentPrice <= 0) {
  return { changePct: 0, reference: { used: null, price: null } };
}
```

**5. `priceResolver.ts:515-520` - Ak `referencePrice <= 0`**
```typescript
if (!referencePrice || referencePrice <= 0) {
  return { changePct: 0, reference: { used: null, price: null } };
}
```

**6. `stockService.ts:331-333` - Forced fallback na `0`**
```typescript
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : 0; // Return 0 instead of stale lastChangePct
```

### Príčiny `currentPrice = 0`

**7. `priceResolver.ts:291-292` - Return `null` ak ani `prevDay.c` nie je**
```typescript
// No valid pre-market price found
return null;
```

**8. `polygonWorker.ts:177-179` - Ak `effectivePrice` je `null`**
```typescript
if (!effectivePrice || effectivePrice.price <= 0) {
  return null; // normalizeSnapshot vráti null
}
```

**9. `polygonWorker.ts:808-810` - Ak `normalized` je `null`**
```typescript
if (!normalized) {
  results.push({ price: 0, changePct: 0, success: false, error: 'No price data' });
}
```

### Príčiny `previousClose = 0`

**10. `heatmap/route.ts:527` - Fallback chain pre `previousClose`**
```typescript
previousClose = (tickerInfoFromMap?.latestPrevClose || 0) || (previousCloseMap.get(ticker) || 0);
```

**11. `heatmap/route.ts:541-544` - Skip ak `previousClose = 0`**
```typescript
if (previousClose === 0) {
  skippedNoPrice++;
  continue; // Skip this ticker instead of showing misleading 0% change
}
```

---

## 📋 Súhrn problémov

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
   - → Nevieme, či sú to ADR/NYSE foreign/ETF (Polygon coverage issue)

### Potenciálne problémy:

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

## 💡 Odporúčania

### 1. Pridať monitoring/logging

**Čo treba:**
- Trackovať `source` pre každý ticker (`lastTrade`, `min`, `lastQuote`, `regularClose`, `null`)
- Trackovať `null` prípady (koľko tickerov má `price=0`)
- Trackovať `changePercent=0` prípady (koľko tickerov má `0%` kvôli chýbajúcemu `previousClose`)
- Identifikovať problémové tickery (top 20 s `source='regularClose'` alebo `null`)

**Kód:**
```typescript
// Pridať do polygonWorker.ts:ingestBatch
const sourceStats = new Map<string, number>();
// ...
if (effectivePrice) {
  sourceStats.set(effectivePrice.source, (sourceStats.get(effectivePrice.source) || 0) + 1);
}
// ...
console.log(`📊 Source stats:`, Object.fromEntries(sourceStats));
```

---

### 2. Rozhodnúť sa: "pravdivá" vs "živá" heatmapa

**Aktuálne:** "Pravdivá" - `changePercent=0` → `#374151` (sivá)

**Ak chceš "živú" heatmapu, možnosti:**

**A) Fallback na `lastChangePct`**
```typescript
// stockService.ts, heatmap/route.ts
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : (s.lastChangePct ?? 0); // Fallback na DB hodnotu ak existuje
```

**B) Zmeniť `colorScale` logiku**
```typescript
// heatmapColors.ts
// Ak changePercent=0 a hasNoPMData=true, použiť inú farbu (nie sivú)
if (changePercent === 0 && hasNoPMData) {
  return '#6b7280'; // gray-500 (nie sivá)
}
```

**C) Nový flag `hasNoPMData`**
```typescript
// priceResolver.ts
return {
  price: snapshot.prevDay.c,
  source: 'regularClose',
  isStale: true,
  hasNoPMData: true // Nový flag
};

// MarketHeatmap.tsx
const tileColor = company.hasNoPMData 
  ? '#6b7280' // gray-500 (nie sivá)
  : colorScale(company.changePercent);
```

---

### 3. Opraviť "chýba previousClose" prípad

**Možnosť A:** Použiť `lastChangePct` z DB
```typescript
// stockService.ts, heatmap/route.ts
if (currentPrice > 0 && previousClose === 0) {
  // Použiť lastChangePct z DB ak existuje
  percentChange = s.lastChangePct ?? 0;
}
```

**Možnosť B:** Explicitne označiť "no reference price"
```typescript
// stockService.ts, heatmap/route.ts
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : null; // Namiesto 0, použiť null

// MarketHeatmap.tsx
const tileColor = company.percentChange === null
  ? '#fbbf24' // yellow-400 (indikuje "no reference")
  : colorScale(company.changePercent);
```

---

### 4. Zlepšiť fallback handling

**Možnosť A:** Ak `source='regularClose'`, použiť `lastChangePct` z DB
```typescript
// priceResolver.ts alebo stockService.ts
if (effectivePrice.source === 'regularClose' && lastChangePct !== null) {
  // Použiť lastChangePct namiesto 0%
  changePct = lastChangePct;
}
```

**Možnosť B:** Nový flag `hasNoPMData` a zmeniť `colorScale`
```typescript
// heatmapColors.ts
export function createHeatmapColorScale(..., hasNoPMData?: boolean) {
  if (hasNoPMData && value === 0) {
    return '#6b7280'; // gray-500 (nie sivá)
  }
  // ... existing logic
}
```

---

### 5. Zvýšiť frekvenciu pre-market updates

**Aktuálne:** 5min pre všetky tickery (premium aj zvyšok)

**Odporúčanie:** Znížiť na 2-3 min pre premium tickery v pre-market
```typescript
// polygonWorker.ts:1509
const PREMIUM_INTERVAL = isPreMarketOrAfterHours ? 2 * 60 * 1000 : 60 * 1000; // 2min pre-market, 60s live
```

---

### 6. Opraviť worker skip pri rate limit/error

**Aktuálne:** Ak batch failne, tickery zostanú "zamrznuté"

**Odporúčanie:** Retry skipnuté tickery v ďalšom cykle
```typescript
// polygonWorker.ts:1583-1585
catch (error) {
  console.error(`Error in batch ${i}:`, error);
  // Track failed tickers for retry
  failedTickers.push(...batch);
}
// Retry failed tickers in next cycle
```

---

## 🎯 Finálne rozhodnutie

**Otázka:** Chceš radšej "pravdivú" heatmapu (sivá = no PM trades), alebo "živú" (farba aj bez PM printu)?

**Aktuálne:** "Pravdivá" - `changePercent=0` → `#374151` (sivá)

**Ak chceš "živú" heatmapu, najlepšie riešenie:**

1. **Fallback na `lastChangePct`** ak `changePercent=0` a `currentPrice > 0`
2. **Nový flag `hasNoPMData`** pre explicitné označenie "no PM trades"
3. **Zmeniť `colorScale`** - ak `hasNoPMData=true`, použiť neutrálnu farbu (nie sivú)

**Výsledok:** Väčšina tickerov bude mať farbu aj bez PM printu (použije sa `lastChangePct` z DB)

---

## 📊 Súhrn

| Problém | Príčina | Riešenie |
|---------|--------|---------|
| **Sivá farba** | `colorScale(0)` = `#374151` | Zmeniť `colorScale` alebo fallback na `lastChangePct` |
| **`changePercent = 0`** | Chýba `currentPrice` alebo `previousClose` | Fallback na `lastChangePct` z DB |
| **`currentPrice = 0`** | Polygon nevrátil dáta | Zlepšiť fallback handling |
| **`previousClose = 0`** | Redis expired alebo DB nemá dáta | Opraviť Model A alebo on-demand fetch |
| **Chýba monitoring** | Nie je logované | Pridať tracking `source` a `null` prípadov |

---

**Report vytvorený:** `DIAGNOSTIKA_ROOT_CAUSE.md` obsahuje detailné odpovede na všetky otázky A-F.
