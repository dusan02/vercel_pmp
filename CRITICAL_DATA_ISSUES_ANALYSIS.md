# 🔴 Kritické problémy s dátami: Analýza a odpovede

## 📋 Reálny príklad Polygon Snapshot

### AVGO - Pre-market (aktuálny snapshot)

```json
{
  "ticker": "AVGO",
  "todaysChangePerc": 0.158364126357901,
  "todaysChange": 0.5699999999999932,
  "updated": 1765808598007058210,
  "day": {
    "o": 0,    // ⚠️ Všetko 0 - trh zatvorený
    "h": 0,
    "l": 0,
    "c": 0,
    "v": 0
  },
  "min": {
    "av": 2138659,
    "t": 1765808520000,  // Timestamp pre-market
    "n": 242,
    "o": 360.5,
    "h": 360.75,
    "l": 360.5,
    "c": 360.6,  // ✅ PRE-MARKET CENA
    "v": 9552
  },
  "prevDay": {
    "c": 359.93  // ✅ PREVIOUS CLOSE
  }
}
```

**Pozorovanie:** `day.c = 0`, ale `min.c = 360.6` - toto je správne pre pre-market!

---

## 1️⃣ Previous Close: Odkiaľ, kedy, a čo keď chýba?

### 1.1 Z čoho presne plníte `DailyRef.previousClose`?

**Odpoveď:** **Dva zdroje:**

1. **Primárny zdroj:** Polygon `/v2/aggs/ticker/{symbol}/prev?adjusted=true`
   - Používa sa v `bootstrapPreviousCloses()` (riadok 613)
   - Používa sa v `getPreviousClose()` (`marketCapUtils.ts`, riadok 118)
   - **Adjusted=true** - split-adjusted ceny ✅

2. **Fallback:** `snapshot.prevDay.c` z Polygon snapshot API
   - Používa sa v `normalizeSnapshot()` (riadok 170)
   - Používa sa v `ingestBatch()` ako `effectivePrevClose` (riadok 464)

**Problém:** ❌ **Nekonzistentnosť!** 
- `bootstrapPreviousCloses()` používa aggregates API (`adjusted=true`)
- `normalizeSnapshot()` používa `snapshot.prevDay.c` (môže byť unadjusted)

**Riešenie:** Vždy používať aggregates API s `adjusted=true` pre konzistentnosť.

---

### 1.2 Je `previousClose` garantované pre každý ticker každý deň?

**Odpoveď:** **NIE** - existujú edge cases:

#### A. IPO / Nový ticker bez histórie
- **Aktuálne:** `bootstrapPreviousCloses()` vráti `prevClose = 0` (riadok 605)
- **Fallback:** `normalizeSnapshot()` použije `snapshot.prevDay.c || snapshot.day.c` (riadok 170)
- **Problém:** Ak ani toto nie je dostupné, `changePct = 0` (riadok 171)
- **Riešenie:** ✅ UI by malo skryť percent change ak `previousClose = 0`

#### B. Ticker s obchodnou halt / OTC edge cases
- **Aktuálne:** `bootstrapPreviousCloses()` hľadá až 3 dni späť (riadok 607)
- **Problém:** Ak halt trvá > 3 dni, `prevClose` zostane 0
- **Riešenie:** ⚠️ Potrebuje sa zvýšiť lookback na 5-7 dní

#### C. Corporate actions (split) - adjusted vs unadjusted
- **Aktuálne:** `bootstrapPreviousCloses()` používa `adjusted=true` ✅
- **Problém:** `normalizeSnapshot()` používa `snapshot.prevDay.c` (môže byť unadjusted) ❌
- **Riešenie:** Vždy používať `adjusted=true` aggregates API

---

### 1.3 Kedy sa robí bootstrap previous closes (04:00 ET)?

**Odpoveď:** **NIE je to jednorazová operácia!**

**Kde sa volá:**
1. **04:00 ET:** Refs worker (`polygonWorker.ts`, riadok 696)
2. **Pri ingestBatch():** Ak `prevCloseMap.size === 0`, volá sa `bootstrapPreviousCloses()` (riadok 412)
3. **Pri chýbajúcich prevClose:** Pre prvých 50 tickerov (riadok 411)

**Problém:** ⚠️ **Re-checkuje sa len ak `prevCloseMap.size === 0`** - to znamená, že ak máme aspoň 1 prevClose, ostatné chýbajúce sa nevyriešia!

**Riešenie:** Re-checkovať chýbajúce prevClose priebežne, nie len ak je mapa prázdna.

---

### 1.4 Ak `previousClose` chýba, fallback je čo?

**Odpoveď:** **Multi-level fallback:**

```typescript
// Riadok 170 v normalizeSnapshot()
const prevClose = previousClose || snapshot.prevDay?.c || snapshot.day?.c;
const changePct = prevClose ? ((price / prevClose) - 1) * 100 : 0;
```

**Fallback chain:**
1. `previousClose` (z Redis/DB) ✅
2. `snapshot.prevDay.c` (z Polygon snapshot) ⚠️
3. `snapshot.day.c` (z Polygon snapshot) ⚠️
4. `changePct = 0` (ak nič nie je) ❌

**Problém:** ❌ **Ak `prevClose = 0`, `changePct = 0`** - toto je mätúce! UI by malo skryť percent change.

---

## 2️⃣ Ktorá cena je "pravda" v jednotlivých session?

### 2.1 Pre-market (04:00-09:30 ET): `lastTrade.p` vs `min.c`?

**Odpoveď:** ⚠️ **PROBLÉM!** Aktuálne priorita je:

```typescript
// Riadok 150-163 v normalizeSnapshot()
if (snapshot.lastTrade?.p) {
  price = snapshot.lastTrade.p;  // ❌ Môže byť stale z predchádzajúcej session!
} else if (snapshot.lastQuote?.p) {
  price = snapshot.lastQuote.p;
} else if (snapshot.min?.c && snapshot.min.c > 0) {
  price = snapshot.min.c;  // ✅ Toto je správne pre pre-market!
}
```

**Problém:** `lastTrade.p` môže byť **stale** z predchádzajúcej session (napr. z piatka 20:00 ET).

**Riešenie:** ⚠️ **Session-aware priorita:**
- **Pre-market:** `min.c` > `lastTrade.p` (ak `lastTrade.t` je z dnešného dňa)
- **Live:** `lastTrade.p` > `day.c` > `min.c`
- **After-hours:** `min.c` > `lastTrade.p` (ak `lastTrade.t` je z dnešného dňa)

---

### 2.2 After-hours (16:00-20:00 ET): Je `min.c` vždy after-hours close?

**Odpoveď:** ⚠️ **NIE vždy!**

`min.c` je **posledná 1-min sviečka**, ktorá môže byť:
- ✅ After-hours close (ak je likvidita)
- ❌ `null` alebo `0` pre illiquid tickery
- ❌ Stale z predchádzajúcej minúty

**Problém:** Pre illiquid tickery môže `min.c` byť starý alebo `0`.

**Riešenie:** Skontrolovať `min.t` (timestamp) - ak je starší než 5 minút, použiť `lastTrade.p` ako fallback.

---

### 2.3 Live (09:30-16:00 ET): Ktoré pole do `Ticker.lastPrice` vs `SessionPrice.lastPrice`?

**Odpoveď:** ✅ **Obe používajú `normalized.price`:**

```typescript
// Riadok 213 v upsertToDB()
lastPrice: normalized.price,  // Ticker.lastPrice

// Riadok 256 v upsertToDB()
lastPrice: normalized.price,  // SessionPrice.lastPrice
```

**Problém:** ⚠️ **Obe používajú rovnakú hodnotu**, ale `normalized.price` môže byť z rôznych zdrojov (`lastTrade.p`, `day.c`, `min.c`).

**Riešenie:** ✅ Je to OK - obe majú rovnakú hodnotu, len `SessionPrice` má aj `lastTs` pre timestamp.

---

## 3️⃣ Percent change: Vždy voči čomu?

### 3.1 `changePct` počítate vždy voči `DailyRef.previousClose`?

**Odpoveď:** ⚠️ **NIE vždy!**

```typescript
// Riadok 170 v normalizeSnapshot()
const prevClose = previousClose || snapshot.prevDay?.c || snapshot.day?.c;
const changePct = prevClose ? ((price / prevClose) - 1) * 100 : 0;
```

**Fallback chain:**
1. `previousClose` (z `DailyRef` alebo Redis) ✅
2. `snapshot.prevDay.c` (z Polygon snapshot) ⚠️
3. `snapshot.day.c` (z Polygon snapshot) ⚠️

**Problém:** ❌ **Nekonzistentnosť!** Niekedy používa `DailyRef.previousClose`, niekedy `snapshot.prevDay.c`.

**Riešenie:** Vždy používať `DailyRef.previousClose` ako primárny zdroj, `snapshot.prevDay.c` len ako fallback.

---

### 3.2 Po 20:00 ET: Percentá vs previous close alebo vs regular close?

**Odpoveď:** ⚠️ **NIE JE JASNÉ!**

**Aktuálne:**
- `changePct` sa počíta voči `previousClose` (z predchádzajúceho trading day)
- Po 20:00 ET, `previousClose` je stále z predchádzajúceho dňa
- **Problém:** O 23:00 ET v ten istý deň, `previousClose` je z včera, nie z dnešného regular close!

**Riešenie:** ⚠️ **Potrebuje sa definovať:**
- **Pre-market (04:00-09:30 ET):** `changePct` vs `previousClose` (z včera) ✅
- **Live (09:30-16:00 ET):** `changePct` vs `previousClose` (z včera) ✅
- **After-hours (16:00-20:00 ET):** `changePct` vs `regularClose` (z dnešného dňa) ⚠️ **ALEBO** vs `previousClose` (z včera)?
- **Closed (20:00-04:00 ET):** `changePct` vs `regularClose` (z dnešného dňa) ⚠️ **ALEBO** vs `previousClose` (z včera)?

**Odporúčanie:** Po 16:00 ET, `changePct` by mal byť vs `regularClose` (z dnešného dňa), nie vs `previousClose` (z včera).

---

## 4️⃣ "Najdlhšie po zavretí trhu": Čo to znamená v dátach?

### 4.1 Po 20:00 ET: Frozen snapshot alebo prepisovanie?

**Odpoveď:** ⚠️ **PREPISOVANIE!**

**Aktuálne:**
- Worker beží každých 30 sekúnd
- Po 20:00 ET, `session = 'closed'`, ale worker stále načítava dáta (ak nie je víkend/sviatok)
- `normalizeSnapshot()` môže vrátiť `day.c = 0` alebo stale `lastTrade.p`

**Problém:** ❌ **Worker môže prepísať dobrú after-hours cenu zlým fallbackom!**

**Riešenie:** ⚠️ **"Freeze" after-hours cenu po 20:00 ET:**
- Po 20:00 ET, ak máme `SessionPrice` s `session = 'after'` a `lastTs > 20:00 ET`, **NEPREPISOVAŤ**!
- Alebo: Po 20:00 ET, používať len `min.c` (ak je z dnešného dňa), nie `day.c = 0`.

---

### 4.2 Víkend/sviatok: Posledný after-hours snapshot alebo reset?

**Odpoveď:** ⚠️ **RESET (iba bootstrap previous closes)!**

**Aktuálne:**
```typescript
// Riadok 747 v polygonWorker.ts
if (session === 'closed' && isWeekendOrHoliday) {
  // Iba bootstrap previous closes
  return;  // ❌ Nenačítava dáta!
}
```

**Problém:** ❌ **Počas víkendu sa nenačítavajú dáta!** To znamená, že:
- Posledná after-hours cena z piatka zostane v DB/Redis
- Ale TTL môže expirovať (24h pre live, 7 dní pre pre/after)
- V pondelok ráno môže byť cache prázdna!

**Riešenie:** ⚠️ **Počas víkendu:**
- **NEPREPISOVAŤ** existujúce dáta
- **ZACHOVAŤ** poslednú after-hours cenu z piatka
- **EXTENDOVAŤ** TTL pre víkendové dáta

---

## 5️⃣ TTL a cache stratégia: Nestratíš údaje práve vtedy, keď ich chceš držať?

### 5.1 Ktoré kľúče používate na UI ako primárny zdroj?

**Odpoveď:** ⚠️ **ROZDIELNÉ ZDROJE!**

**All stocks (`/api/stocks`):**
- **Primárny:** `Ticker.lastPrice` (z DB) ✅
- **Fallback:** Polygon API priamo

**Heatmap (`/api/heatmap`):**
- **Primárny:** `Ticker.lastPrice` (z DB) ✅
- **Fallback:** `SessionPrice.lastPrice` (z DB)

**Optimized (`/api/stocks/optimized`):**
- **Primárny:** `stock:{symbol}` (Redis hash) ✅
- **Fallback:** `last:{date}:{session}:{symbol}` (Redis string)

**Problém:** ⚠️ **Rôzne TTL pre rôzne kľúče:**
- `stock:{symbol}`: TTL 24h (live), 7 dní (pre/after) ✅
- `last:{date}:{session}:{symbol}`: TTL 24h (live), 7 dní (pre/after) ✅
- `prevClose:{date}:{symbol}`: TTL 24h ❌ **PROBLÉM!**

---

### 5.2 `prevClose:{date}:{symbol}` TTL 24h - prečo nie 7 dní?

**Odpoveď:** ❌ **TO JE PROBLÉM!**

**Aktuálne:**
```typescript
// keys.ts, riadok 22
PREVCLOSE: 86400, // 24 hours
```

**Problém:** ❌ **Pri 3-dňovom víkende (napr. Vianoce), TTL expiruje!**

**Príklad:**
- Piatok 20:00 ET: `prevClose:2025-12-20:AAPL` = $150 (TTL 24h)
- Sobota 20:00 ET: TTL expiruje ❌
- Nedeľa: `prevClose` nie je v Redis
- Pondelok 04:00 ET: Bootstrap musí znovu načítať `prevClose`

**Riešenie:** ⚠️ **TTL by mal byť aspoň 7 dní (alebo do ďalšieho trading day + buffer):**

```typescript
PREVCLOSE: 7 * 86400, // 7 days
// ALEBO
PREVCLOSE: getNextTradingDay() - now + 1 day buffer
```

---

## 6️⃣ DB model a "date" semantics: Čo je "date" pri SessionPrice a DailyRef?

### 6.1 `SessionPrice.date` je "kalendárny deň v ET" alebo UTC?

**Odpoveď:** ✅ **ET (Eastern Time)!**

```typescript
// ranking.ts, riadok 26
export function getDateET(): string {
  const etNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${year}-${month}-${day}`;
}
```

**Použitie:**
```typescript
// polygonWorker.ts, riadok 199
const today = new Date();
today.setHours(0, 0, 0, 0);  // ⚠️ UTC midnight, nie ET!
```

**Problém:** ⚠️ **Nekonzistentnosť!**
- `getDateET()` vráti dátum v ET (napr. `2025-12-15`)
- `new Date().setHours(0,0,0,0)` nastaví UTC midnight
- **Ak je 23:00 ET (04:00 UTC nasledujúci deň), `today` bude "zajtrajší" deň v UTC!**

**Riešenie:** ⚠️ **Vždy používať `getDateET()` pre dátum:**

```typescript
const today = new Date(getDateET() + 'T00:00:00-05:00');  // ET midnight
```

---

### 6.2 `DailyRef` unique `[symbol, date]`: Je `date` "trading date" alebo timestamp?

**Odpoveď:** ⚠️ **KALENDÁRNY DEŇ (nie trading date)!**

**Aktuálne:**
```typescript
// polygonWorker.ts, riadok 625
await prisma.dailyRef.upsert({
  where: { symbol_date: { symbol, date: new Date(date) } },
  // date = YYYY-MM-DD string z getDateET()
});
```

**Problém:** ⚠️ **Ak je sviatok, `date` je stále kalendárny deň, nie trading date!**

**Príklad:**
- Piatok 20.12.2025: `DailyRef.date = 2025-12-20` ✅
- Sobota 21.12.2025: `DailyRef.date = 2025-12-21` ❌ (nie je trading day!)
- Nedeľa 22.12.2025: `DailyRef.date = 2025-12-22` ❌ (nie je trading day!)

**Riešenie:** ⚠️ **`DailyRef.date` by mal byť trading date, nie kalendárny deň!**

---

## 7️⃣ Kvalita dát a "stale" detekcia

### 7.1 Máte pravidlo: Ak `lastTs` je staršie než X min, označíte `quality = delayed/rest`?

**Odpoveď:** ⚠️ **NIE!**

**Aktuálne:**
```typescript
// polygonWorker.ts, riadok 174
const quality: 'delayed_15m' | 'rest' | 'snapshot' =
  process.env.POLYGON_PLAN === 'starter' ? 'delayed_15m' : 'rest';
```

**Problém:** ❌ **`quality` sa nastavuje podľa Polygon planu, nie podľa stálosti dát!**

**Riešenie:** ⚠️ **Pridať stale detection:**

```typescript
const now = Date.now();
const age = now - timestamp;
const quality = age > 15 * 60 * 1000 ? 'delayed_15m' : 'rest';
```

---

### 7.2 Pre illiquid tickery: Chceš to stále rankovať alebo de-prioritize?

**Odpoveď:** ⚠️ **NIE JE RIEŠENÉ!**

**Aktuálne:**
- Illiquid tickery sa stále rankujú
- `min.c` môže byť starý (napr. 2 hodiny)
- Stále sa zobrazuje v heatmape

**Riešenie:** ⚠️ **De-prioritize illiquid tickery:**
- Ak `lastTs` je starší než 30 minút, označiť ako `stale`
- V heatmape zobraziť s nižšou opacity alebo šedou farbou
- V ranking indexes použiť nižšiu prioritu

---

## 8️⃣ Procesy/refaktor: Čo je zdroj pravdy a čo sa dá zjednodušiť?

### 8.1 Pre výpočet `changePct` a `marketCapDiff`: Robí sa to vždy v workerovi?

**Odpoveď:** ✅ **ÁNO, vždy v workerovi!**

```typescript
// polygonWorker.ts, riadok 171
const changePct = prevClose ? ((price / prevClose) - 1) * 100 : 0;

// polygonWorker.ts, riadok 494
const marketCapDiff = effectivePrevClose
  ? computeMarketCapDiff(normalized.price, effectivePrevClose, shares)
  : 0;
```

**Uloženie:**
- `Ticker.lastChangePct` ✅
- `Ticker.lastMarketCapDiff` ✅
- `SessionPrice.changePct` ✅

**Problém:** ⚠️ **Niekedy sa `changePct` prepočítava v API endpointoch:**

```typescript
// heatmap/route.ts, riadok 491
changePercent = computePercentChange(currentPrice, previousClose);
```

**Riešenie:** ✅ **Je to OK** - API endpointy používajú uložené hodnoty, ale môžu prepočítať pre konzistentnosť.

---

### 8.2 Máte jednotný "pricing state machine"?

**Odpoveď:** ❌ **NIE!**

**Aktuálne:**
- `detectSession()` vráti `'pre' | 'live' | 'after' | 'closed'`
- Ale **NIE JE** jasný state machine pre:
  - `regular_close_frozen` → `after_hours_live` → `overnight_frozen` → `pre_market_live` → `live`

**Problém:** ⚠️ **Kde presne hrozí prepisovanie dobré ceny zlým fallbackom:**

1. **Po 20:00 ET:** Worker môže prepísať after-hours cenu `day.c = 0`
2. **Počas víkendu:** Worker nenačítava dáta, ale TTL môže expirovať
3. **Pre-market:** `lastTrade.p` môže byť stale z predchádzajúcej session

**Riešenie:** ⚠️ **Potrebuje sa definovať state machine:**

```typescript
enum PriceState {
  REGULAR_CLOSE_FROZEN = 'regular_close_frozen',  // 16:00-20:00 ET
  AFTER_HOURS_LIVE = 'after_hours_live',          // 16:00-20:00 ET (live updates)
  OVERNIGHT_FROZEN = 'overnight_frozen',          // 20:00-04:00 ET
  PRE_MARKET_LIVE = 'pre_market_live',            // 04:00-09:30 ET
  LIVE = 'live'                                    // 09:30-16:00 ET
}
```

---

## 📊 Mini-checklist: Čo by som chcel vidieť

### ✅ Reálne príklady JSON snapshotov

**1. Pre-market (05:00 ET):**
```json
{
  "ticker": "AAPL",
  "day": { "c": 0 },           // Trh zatvorený
  "min": { "c": 150.25, "t": 1765808520000 },  // Pre-market cena
  "prevDay": { "c": 149.50 },  // Previous close
  "lastTrade": { "p": 149.80, "t": 1765800000000 }  // Stale z včera!
}
```

**2. Live (15:00 ET):**
```json
{
  "ticker": "AAPL",
  "day": { "c": 150.75, "o": 150.00, "h": 151.00, "l": 149.50 },
  "min": { "c": 150.80, "t": 1765808520000 },
  "prevDay": { "c": 149.50 },
  "lastTrade": { "p": 150.85, "t": 1765808520000 }  // Aktuálna
}
```

**3. After-hours (21:30 ET):**
```json
{
  "ticker": "AAPL",
  "day": { "c": 150.75 },      // Regular close
  "min": { "c": 150.90, "t": 1765808520000 },  // After-hours
  "prevDay": { "c": 149.50 },
  "lastTrade": { "p": 150.95, "t": 1765808520000 }
}
```

### ✅ Ako vyzerá uložený `DailyRef` a `SessionPrice`

**DailyRef:**
```typescript
{
  symbol: "AAPL",
  date: "2025-12-15T00:00:00Z",  // ⚠️ UTC midnight, nie ET!
  previousClose: 149.50,
  todayOpen: 150.00,
  regularClose: 150.75
}
```

**SessionPrice:**
```typescript
{
  symbol: "AAPL",
  date: "2025-12-15T00:00:00Z",  // ⚠️ UTC midnight, nie ET!
  session: "pre",
  lastPrice: 150.25,
  lastTs: "2025-12-15T10:00:00Z",  // 05:00 ET = 10:00 UTC
  changePct: 0.50
}
```

### ✅ Ktoré Redis kľúče UI reálne číta

**All stocks (`/api/stocks`):**
1. `Ticker.lastPrice` (z DB) ✅
2. Polygon API priamo (fallback)

**Heatmap (`/api/heatmap`):**
1. `Ticker.lastPrice` (z DB) ✅
2. `SessionPrice.lastPrice` (z DB, fallback)

**Optimized (`/api/stocks/optimized`):**
1. `stock:{symbol}` (Redis hash) ✅
2. `last:{date}:{session}:{symbol}` (Redis string, fallback)

---

## 🎯 Zhrnutie kritických problémov

### 🔴 Kritické (musia sa opraviť)

1. **Previous close TTL 24h** → Zmeniť na 7 dní
2. **Date semantics** → `getDateET()` vs UTC midnight nekonzistentnosť
3. **Pre-market priorita** → `lastTrade.p` môže byť stale, `min.c` má prioritu
4. **After-hours freeze** → Po 20:00 ET neprepisovať dobrú cenu zlým fallbackom
5. **Víkend dáta** → Zachovať poslednú after-hours cenu, extendovať TTL

### ⚠️ Dôležité (mali by sa opraviť)

6. **Adjusted vs unadjusted** → Vždy používať `adjusted=true`
7. **Bootstrap re-check** → Re-checkovať chýbajúce prevClose priebežne
8. **Stale detection** → Pridať detekciu starých dát
9. **State machine** → Definovať pricing state machine
10. **DailyRef.date** → Používať trading date, nie kalendárny deň

### 💡 Vylepšenia (nice to have)

11. **Illiquid tickery** → De-prioritize v heatmape
12. **ChangePct po 16:00 ET** → Definovať vs regularClose alebo previousClose
13. **Lookback pre prevClose** → Zvýšiť z 3 na 5-7 dní

---

## 🔧 Odporúčania na refaktor

1. **Unified previous close source:** Vždy používať aggregates API s `adjusted=true`
2. **Session-aware price priority:** Upraviť `normalizeSnapshot()` pre session
3. **Date handling:** Vždy používať `getDateET()` pre dátumy
4. **TTL strategy:** Extendovať TTL pre víkendové dáta
5. **Freeze mechanism:** Po 20:00 ET neprepisovať after-hours cenu
6. **State machine:** Implementovať pricing state machine

