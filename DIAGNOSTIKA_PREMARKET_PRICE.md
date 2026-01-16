# 🔍 Diagnostika: Pre-market Price - Aktuálne nastavenie

## Odpovede na otázky

### 1. Ktorý proces dnes reálne dodáva `preMarketPrice` pre tickery mimo top ~50?

**Odpoveď:** **PM2 worker (`polygonWorker.ts`)** - hlavný proces

**Detail:**
- Worker používa `getUniverse('sp500')` ktorý obsahuje **všetky tickery** (nie len top 50)
- `getUniverse('sp500')` vracia tickery z Redis set `universe:sp500`
- Tento set sa naplní z `getAllProjectTickers('pmp')` (cca 360 tickerov) + SP500 tickery
- **Všetky tickery** v universe sa spracovávajú, nie len top 50

**Kód:**
```typescript
// polygonWorker.ts:1461
const tickers = await getUniverse('sp500'); // Get from Redis

// polygonWorker.ts:1501
const premiumTickers = getAllProjectTickers('pmp').slice(0, 200); // Top 200
```

**Prioritizácia:**
- **Top 200 premium**: každých 60s (live) alebo 5min (pre-market/after-hours)
- **Zvyšok**: každých 5min (všetky sessiony)

---

### 2. Pri ktorých tickerov sa pre-market price nikdy neťahá z Polygon API?

**Odpoveď:** **Žiadne** - všetky tickery v `universe:sp500` sa spracovávajú

**Detail:**
- Nie je tam whitelist / hard cap
- Všetky tickery v universe sa spracovávajú
- **Rozdiel je len v frekvencii**: premium častejšie, zvyšok menej často

**Kód:**
```typescript
// polygonWorker.ts:1535-1539
const tickersNeedingUpdate = tickers.filter(ticker => {
  const lastUpdate = lastUpdateMap.get(ticker) || 0;
  const interval = premiumTickers.includes(ticker) ? PREMIUM_INTERVAL : REST_INTERVAL;
  return (now - lastUpdate) >= interval;
});
```

**Poznámka:**
- Ak ticker nie je v `universe:sp500`, **nebude spracovaný**
- Universe sa refreshuje každý deň o 03:30 ET

---

### 3. Ak Polygon snapshot nevráti `preMarketPrice`, čo sa stane v kóde?

**Odpoveď:** **Fallback chain** → ak všetko zlyhá, vráti `null` → `price = 0`

**Detail:**
Pre pre-market session (`resolveEffectivePrice` v `priceResolver.ts`):

1. **Priority 1:** `lastTrade.p` (ak timestamp je validný a v pre-market session)
2. **Priority 2:** `min.c` (ak timestamp je validný a v pre-market session)
3. **Priority 3:** `lastQuote.p` (ak timestamp je validný a v pre-market session)
4. **Fallback:** `prevDay.c` (previous close) - **označené ako stale**
5. **Ak nič:** `null`

**Kód:**
```typescript
// priceResolver.ts:269-292
// Fallback: if Polygon has no pre-market prints/quotes yet, use prevDay.c
if (snapshot.prevDay?.c && snapshot.prevDay.c > 0) {
  return {
    price: snapshot.prevDay.c,
    source: 'regularClose',
    timestamp: new Date(candidateTsMs),
    isStale: true,
    staleReason: 'No valid pre-market price; falling back to previous close'
  };
}

// No valid pre-market price found
return null;
```

**Ak `resolveEffectivePrice` vráti `null`:**
```typescript
// polygonWorker.ts:177-179
if (!effectivePrice || effectivePrice.price <= 0) {
  return null; // normalizeSnapshot vráti null
}

// polygonWorker.ts:808-810
if (!normalized) {
  results.push({ price: 0, changePct: 0, success: false, error: 'No price data' });
}
```

**Výsledok:** `price = 0`, `changePct = 0`

---

### 4. Ktorá časť kódu rozhoduje, že `changePct = 0.00`?

**Odpoveď:** **Dve miesta** - `calculatePercentChange` a `stockService.ts`

**Detail:**

**A) `calculatePercentChange` (priceResolver.ts):**
```typescript
// priceResolver.ts:480-485
if (!currentPrice || currentPrice <= 0) {
  return {
    changePct: 0,
    reference: { used: null, price: null }
  };
}

// priceResolver.ts:515-520
if (!referencePrice || referencePrice <= 0) {
  return {
    changePct: 0,
    reference: { used: null, price: null }
  };
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

**Kód:**
```typescript
// stockService.ts:321-326
const pct = calculatePercentChange(
  currentPrice,
  session,
  previousClose > 0 ? previousClose : null,
  regularClose > 0 ? regularClose : null
);
```

---

### 5. Cron joby (verify-prevclose, update-static-data) - ťahajú vôbec *pre-market* ceny?

**Odpoveď:** **NIE** - len referencie (prevClose, shares, integrity)

**Detail:**

**verify-prevclose:**
- Používa `getPreviousClose(ticker)` - **len previousClose**
- **Nepoužíva** Polygon snapshot pre pre-market ceny
- Opravuje len `latestPrevClose` a `DailyRef.previousClose`

**update-static-data:**
- Používa `getPreviousClose()` a `getSharesOutstanding()` - **len referencie**
- **Nepoužíva** Polygon snapshot pre pre-market ceny
- Refreshuje len `previousClose` a `sharesOutstanding`

**Kód:**
```typescript
// verify-prevclose/route.ts:45
const correctPrevClose = await getPreviousClose(ticker); // Len prevClose, nie snapshot

// update-static-data/route.ts:16
import { getSharesOutstanding, getPreviousClose } from '@/lib/utils/marketCapUtils';
// Len referencie, nie snapshot
```

---

### 6. Existuje dnes batch mechanizmus, ktorý by prešiel *všetky tickery* a skúsil získať pre-market snapshot?

**Odpoveď:** **ÁNO** - `ingestLoop` v `polygonWorker.ts`

**Detail:**
- **Kde:** `polygonWorker.ts:1453` - `ingestLoop` funkcia
- **Ako často:**
  - **Premium (top 200):** každých 60s (live) alebo 5min (pre-market/after-hours)
  - **Zvyšok:** každých 5min (všetky sessiony)
- **Check interval:** 60s (worker kontroluje každých 60s, či treba update)

**Kód:**
```typescript
// polygonWorker.ts:1603
setInterval(ingestLoop, 60000); // 60s check interval
ingestLoop(); // Run immediately

// polygonWorker.ts:1508-1510
const isPreMarketOrAfterHours = session === 'pre' || session === 'after' || (session === 'closed' && !isWeekendOrHoliday);
const PREMIUM_INTERVAL = isPreMarketOrAfterHours ? 5 * 60 * 1000 : 60 * 1000; // 5min pre-market, 60s live
const REST_INTERVAL = 5 * 60 * 1000; // 5 min pre všetky
```

**Batch size:** 70 tickerov na batch (Polygon API limit: 100, používame 70 pre bezpečnosť)

---

### 7. Ako sa označuje ticker ako „stale / no premarket data"?

**Odpoveď:** **`isStale` flag** v `StockData` interface

**Detail:**
- **Flag:** `isStale: boolean` v `StockData` interface
- **Threshold:**
  - **Live:** 5 minút
  - **Pre-market:** 30 minút
  - **After-hours:** 30 minút
  - **Closed:** 60 minút

**Kód:**
```typescript
// stockService.ts:311-317
const thresholdMin =
  session === 'live' ? 5 :
  session === 'pre' ? 30 :
  session === 'after' ? 30 :
  60;
const ageMs = etNow.getTime() - lastTs.getTime();
const isStale = !isFrozen && currentPrice > 0 && ageMs > thresholdMin * 60_000;
```

**Použitie v heatmape:**
```typescript
// heatmap/route.ts:596-603
const thresholdMin =
  session === 'live' ? 5 :
  session === 'pre' ? 30 :
  session === 'after' ? 30 :
  60;
const isStale = currentPrice > 0 && priceTsMs > 0 && (nowMs - priceTsMs) > thresholdMin * 60_000;
```

**Poznámka:** `isStale` sa používa len pre UX indikátory, **nie pre logiku** (nie je to "frozen" flag)

---

### 8. Je 0 % vedomý fallback (UX rozhodnutie), alebo len default hodnota?

**Odpoveď:** **Vedomý fallback** - explicitne v kóde

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

### 9. Koľko tickerov má dnes reálne zdroj pre-market dát?

**Odpoveď:** **Všetky tickery v `universe:sp500`** (cca 500-600 tickerov)

**Detail:**
- `getUniverse('sp500')` vracia všetky tickery z Redis set
- Tento set obsahuje:
  - `getAllProjectTickers('pmp')` = cca 360 tickerov (premium + standard + extended + extended+)
  - SP500 tickery (ak sú v Redis)
  - International NYSE tickers (100 tickerov)
- **Limit:** max 600 tickerov (`getAllTrackedTickers` má limit 600)

**Kód:**
```typescript
// universeHelpers.ts:27-58
export async function getAllTrackedTickers(): Promise<string[]> {
  const sp500Tickers = await getUniverse(UNIVERSE_TYPES.SP500);
  const defaultTickers = getAllProjectTickers('pmp');
  const internationalTickers = getInternationalNYSETickers();
  
  // Combine and deduplicate
  const allTickers = new Set<string>();
  sp500Tickers.forEach(ticker => allTickers.add(ticker));
  defaultTickers.forEach(ticker => allTickers.add(ticker));
  internationalTickers.forEach(ticker => allTickers.add(ticker));
  
  // Limit to 600 tickers
  return Array.from(allTickers).slice(0, 600);
}
```

**Poznámka:** Frekvencia aktualizácie sa líši (premium častejšie), ale **všetky** majú zdroj

---

### 10. Je možné, že worker spracúva len tickery, ktoré sú v `favorites / premium list`?

**Odpoveď:** **NIE** - worker spracováva **všetky tickery** z `universe:sp500`

**Detail:**
- Worker používa `getUniverse('sp500')` - **všetky tickery**
- Premium list (`getAllProjectTickers('pmp').slice(0, 200)`) sa používa len pre **prioritizáciu frekvencie**
- Premium tickery: **častejšie update** (60s live, 5min pre-market)
- Zvyšok: **menej často** (5min všetky sessiony)

**Kód:**
```typescript
// polygonWorker.ts:1461
const tickers = await getUniverse('sp500'); // Všetky tickery

// polygonWorker.ts:1501
const premiumTickers = getAllProjectTickers('pmp').slice(0, 200); // Len pre prioritizáciu

// polygonWorker.ts:1535-1539
const tickersNeedingUpdate = tickers.filter(ticker => {
  const lastUpdate = lastUpdateMap.get(ticker) || 0;
  const interval = premiumTickers.includes(ticker) ? PREMIUM_INTERVAL : REST_INTERVAL;
  return (now - lastUpdate) >= interval;
});
```

**Kde sa definuje premium list:**
```typescript
// data/defaultTickers.ts
export const DEFAULT_TICKERS = {
  pmp: [
    // Premium tier (50) - 1 min updates
    'NVDA', 'MSFT', 'AAPL', ...
    // Standard tier (100) - 3 min updates
    'UBER', 'VZ', ...
    // Extended tier (150) - 5 min updates
    'MRVL', 'PYPL', ...
  ]
};
```

---

## 📊 Súhrn

| Otázka | Odpoveď |
|--------|---------|
| **1. Ktorý proces dodáva preMarketPrice?** | PM2 worker (`polygonWorker.ts`) |
| **2. Pre ktoré tickery sa nikdy neťahá?** | Žiadne - všetky v universe sa spracovávajú |
| **3. Čo ak Polygon nevráti preMarketPrice?** | Fallback chain → prevDay.c → null → price=0 |
| **4. Ktorá časť rozhoduje changePct=0?** | `calculatePercentChange` + `stockService.ts` (ak chýba currentPrice alebo referencePrice) |
| **5. Cron joby ťahajú pre-market ceny?** | NIE - len referencie (prevClose, shares) |
| **6. Existuje batch mechanizmus?** | ÁNO - `ingestLoop` každých 60s (check), 5min (update pre zvyšok) |
| **7. Ako sa označuje stale?** | `isStale` flag (threshold: live=5min, pre/after=30min) |
| **8. Je 0% vedomý fallback?** | ÁNO - explicitne v kóde (lepšie než stale lastChangePct) |
| **9. Koľko tickerov má zdroj?** | Všetky v universe:sp500 (cca 500-600) |
| **10. Worker spracúva len premium?** | NIE - všetky tickery, premium len častejšie |

---

## 🎯 Kľúčové zistenia

### ✅ Čo funguje:
1. **Worker spracováva všetky tickery** (nie len top 50)
2. **Batch mechanizmus existuje** (ingestLoop každých 60s)
3. **Fallback chain** pre chýbajúce pre-market ceny (prevDay.c)

### ⚠️ Potenciálne problémy:
1. **Frekvencia aktualizácie:**
   - Premium (top 200): 5min pre-market
   - Zvyšok: 5min pre-market
   - **Ak Polygon nemá pre-market dáta, ticker zostane na `prevDay.c` (stale)**
2. **0% changePct:**
   - Ak chýba `currentPrice` → `changePct = 0`
   - Ak chýba `previousClose` → `changePct = 0`
   - **Vedomý fallback** (lepšie než stale percentá)
3. **Stale detection:**
   - Pre-market threshold: **30 minút**
   - Ak ticker nemá update 30+ min → `isStale = true`
   - **Ale stále sa zobrazuje** (len s indikátorom)

### 🔍 Root cause "sivých tickerov":
1. **Polygon nemá pre-market dáta** pre niektoré tickery
2. **Fallback na prevDay.c** → `isStale = true` → sivá farba
3. **Ak ani prevDay.c nie je** → `price = 0` → `changePct = 0` → sivá farba
4. **Ak chýba previousClose** → `changePct = 0` → sivá farba

---

## 💡 Odporúčania

1. **Zvýšiť frekvenciu pre-market updates** (napr. každé 2-3 min namiesto 5min)
2. **Lepšie fallback handling** - ak Polygon nemá pre-market, skúsiť iný zdroj
3. **Explicitné označenie "no pre-market data"** namiesto `isStale`
4. **Monitoring** - koľko tickerov má reálne pre-market dáta z Polygon
