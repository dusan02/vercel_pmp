# 🔒 Invariants and Edge Cases - Hardening Documentation

## ✅ Implementované invarianty

### 1. **Price <= 0 Never Upserted**

**Pravidlo:** Nikdy neupsertovať cenu <= 0 (okrem explicitného halt stavu)

**Implementácia:**
- `resolveEffectivePrice()` vráti `null` ak `price <= 0`
- `canOverwritePrice()` vráti `false` ak `newPrice.price <= 0`
- `normalizeSnapshot()` vráti `null` ak `effectivePrice.price <= 0`

**Kód:**
```typescript
// priceResolver.ts
if (!effectivePrice || effectivePrice.price <= 0) {
  return null;
}

// pricingStateMachine.ts
if (!newPrice.price || newPrice.price <= 0) {
  return false; // Never overwrite with zero/null
}
```

---

### 2. **Frozen Prices Never Overwritten**

**Pravidlo:** Po 20:00 ET alebo cez víkend, frozen ceny sa nikdy neprepíšu

**Implementácia:**
- `getPricingState()` vráti `canOverwrite: false` pre frozen states
- `canOverwritePrice()` vráti `false` ak `state.canOverwrite === false`
- Frozen price source: `SessionPrice(session='after', lastPrice > 0, lastTs <= 20:00 ET)`

**Kód:**
```typescript
// pricingStateMachine.ts
if (!state.canOverwrite) {
  return false; // Never overwrite frozen prices
}
```

---

### 3. **Timestamp Validation is State-Aware**

**Pravidlo:** Pre frozen states (OVERNIGHT_FROZEN, WEEKEND_FROZEN), timestamp môže byť z posledného trading dňa

**Implementácia:**
- `isTimestampValid()` akceptuje posledné 3 dni pre frozen states
- Pre live states, musí byť z dnešného ET dňa

**Kód:**
```typescript
// priceResolver.ts
function isTimestampValid(timestamp: number, etNow: Date, pricingState: PriceState): boolean {
  if (pricingState === PriceState.OVERNIGHT_FROZEN || pricingState === PriceState.WEEKEND_FROZEN) {
    const threeDaysAgo = new Date(etNow);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return tsET >= threeDaysAgo; // Allow last 3 days
  }
  // For live states, must be from today
  return (tsET.getFullYear() === etNow.getFullYear() && ...);
}
```

---

### 4. **Adjusted Consistency**

**Pravidlo:** Všetky referenčné ceny (prevClose, regularClose, open) musia byť z rovnakého adjusted režimu

**Implementácia:**
- `previousClose` vždy z `aggs/prev?adjusted=true` (bootstrapPreviousCloses)
- `regularClose` z Polygon snapshot `day.c` (už adjusted)
- `snapshot.prevDay.c` NIKDY nie je primárny zdroj (len fallback)

**Kód:**
```typescript
// polygonWorker.ts - bootstrapPreviousCloses
const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`;

// polygonWorker.ts - saveRegularClose
const regularClose = snapshot.day?.c; // Already adjusted from Polygon
```

---

### 5. **DST-Safe Date Handling**

**Pravidlo:** Nikdy nepoužívať fixný `-05:00` offset (DST to rozbije)

**Implementácia:**
- Používa `getDateET()` pre date string (YYYY-MM-DD)
- Vytvára Date objekt pomocou timezone-aware konverzie
- ⚠️ **TODO:** Implementovať `createETDate()` helper pre DST-safe date creation

**Kód:**
```typescript
// polygonWorker.ts
const dateET = getDateET(); // YYYY-MM-DD string in ET
const todayDate = new Date(dateET + 'T00:00:00'); // Will be interpreted correctly by Prisma
```

---

### 6. **Reference Info for UI**

**Pravidlo:** Percent change calculation vracia aj referenčnú cenu (pre UI zobrazenie)

**Implementácia:**
- `calculatePercentChange()` vracia `PercentChangeResult` s `reference` info
- UI môže zobraziť "vs regular close" alebo "vs prev close"

**Kód:**
```typescript
// priceResolver.ts
export interface PercentChangeResult {
  changePct: number;
  reference: {
    used: 'previousClose' | 'regularClose' | null;
    price: number | null;
  };
}
```

---

## 📋 Edge Cases - Test Matrix

### A) Unit Testy pre `resolveEffectivePrice()`

#### Test 1: Pre-market stale lastTrade
**Given:**
- Session: `pre` (05:00 ET)
- Snapshot: `{ lastTrade: {p: 150, t: yesterday}, min: {c: 151, t: today 05:00} }`

**Expected:**
- Returns `min.c = 151` (not stale `lastTrade.p = 150`)
- Source: `'min'`
- isStale: `false`

---

#### Test 2: Pre-market illiquid
**Given:**
- Session: `pre` (05:00 ET)
- Snapshot: `{ min: {c: 0}, lastTrade: {p: 150, t: today 04:15 ET} }`

**Expected:**
- Returns `lastTrade.p = 150`
- Source: `'lastTrade'`
- isStale: `false`

---

#### Test 3: Live session
**Given:**
- Session: `live` (15:00 ET)
- Snapshot: `{ lastTrade: {p: 155, t: today 15:00}, day: {c: 154} }`

**Expected:**
- Returns `lastTrade.p = 155` (priority over `day.c`)
- Source: `'lastTrade'`
- isStale: `false`

---

#### Test 4: After-hours stale
**Given:**
- Session: `after` (18:00 ET)
- Snapshot: `{ min: {c: 156, t: 17:30 ET (30 min old)}, lastTrade: {p: 157, t: 17:58 ET (2 min old)} }`

**Expected:**
- Returns `lastTrade.p = 157` (newer, not stale)
- Source: `'lastTrade'`
- isStale: `false`

---

#### Test 5: Closed overnight with frozen price
**Given:**
- Session: `closed` (21:00 ET)
- Frozen price: `{ price: 158, timestamp: 20:00 ET }`
- Snapshot: `{ day: {c: 0}, min: {c: 0} }`

**Expected:**
- Returns frozen price `158`
- Source: `'frozen'`
- isStale: `false`
- **Never uses** `day.c = 0`

---

#### Test 6: Zero guards
**Given:**
- Session: `pre` (05:00 ET)
- Snapshot: `{ day: {c: 0}, min: {c: 0}, lastTrade: null }`

**Expected:**
- Returns `null` (not 0)
- **Never returns price = 0**

---

### B) Unit Testy pre `calculatePercentChange()`

#### Test 7: Pre-market vs prevClose
**Given:**
- Session: `pre`
- Current price: `151.00`
- Previous close: `150.00`
- Regular close: `null`

**Expected:**
- `changePct = +0.67%`
- `reference.used = 'previousClose'`
- `reference.price = 150.00`

---

#### Test 8: After-hours vs regularClose
**Given:**
- Session: `after`
- Current price: `160.00`
- Previous close: `150.00` (D-1)
- Regular close: `158.00` (D)

**Expected:**
- `changePct = +1.27%` (vs regularClose, not prevClose)
- `reference.used = 'regularClose'`
- `reference.price = 158.00`

---

#### Test 9: After-hours fallback to prevClose
**Given:**
- Session: `after`
- Current price: `160.00`
- Previous close: `150.00` (D-1)
- Regular close: `null` (not available)

**Expected:**
- `changePct = +6.67%` (vs prevClose fallback)
- `reference.used = 'previousClose'`
- `reference.price = 150.00`
- **UI should show "vs prev close" label**

---

### C) Integračné testy pre worker

#### Test 10: 20:05 ET - frozen price protection
**Given:**
- Time: 20:05 ET
- Existing: `SessionPrice { session: 'after', lastPrice: 152, lastTs: 19:58 ET }`
- Snapshot: `{ day: {c: 0}, min: {c: 0} }`

**Expected:**
- `canOverwritePrice()` returns `false`
- Frozen price `152` is preserved
- **No overwrite with `day.c = 0`**

---

#### Test 11: Weekend - no ingestion, TTL preserved
**Given:**
- Day: Saturday
- `prevClose:2025-12-20:AAPL` exists (TTL would expire Sunday)

**Expected:**
- Worker doesn't ingest (pricingState.canIngest = false)
- TTL extended to next trading day + buffer
- `prevClose` survives weekend

---

#### Test 12: Holiday Monday - next trading day TTL
**Given:**
- Day: Monday (holiday)
- `prevClose:2025-12-20:AAPL` exists

**Expected:**
- TTL = next trading day (Tuesday 09:30 ET) + 24h buffer
- Minimum 7 days
- `prevClose` survives holiday

---

#### Test 13: Split day - adjusted consistency
**Given:**
- Split happened today
- `previousClose` from `aggs/prev?adjusted=true` = `75.00` (adjusted)
- Snapshot `prevDay.c` = `150.00` (unadjusted)

**Expected:**
- System uses `previousClose = 75.00` (adjusted)
- `snapshot.prevDay.c` is NOT used as primary source
- Percent change calculated vs adjusted price

---

## 🐛 Gotchas (často prehliadnuté)

### 1. **ET Offset nie je vždy -05:00 (DST)**

**Problém:**
```typescript
// ❌ WRONG - breaks during DST
const today = new Date(dateET + 'T00:00:00-05:00');
```

**Riešenie:**
```typescript
// ✅ CORRECT - DST-safe
const dateET = getDateET();
const today = new Date(dateET + 'T00:00:00'); // Let Prisma handle timezone
// OR use timezone-aware helper
```

**Status:** ⚠️ **TODO** - Implementovať `createETDate()` helper

---

### 2. **`updated` v snapshot je v nanosekundách**

**Problém:**
```typescript
// ❌ WRONG - if updated is in nanoseconds
const age = Date.now() - snapshot.updated;
```

**Riešenie:**
```typescript
// ✅ CORRECT - convert nanoseconds to milliseconds
const updatedMs = snapshot.updated / 1000000; // Convert ns to ms
const age = Date.now() - updatedMs;
```

**Status:** ✅ **OK** - Polygon API vracia timestamp v milisekundách, nie nanosekundách

---

### 3. **Stale threshold - len označuje, nezabíja**

**Pravidlo:** Stale flag len **označuje** starosť, ale **nezabíja** cenu ak je to jediná dostupná

**Implementácia:**
- `isStale` flag sa nastaví, ale cena sa stále vráti
- UI môže zobraziť stale indikátor
- Worker stále použije cenu (ak je validná)

**Kód:**
```typescript
// priceResolver.ts
const stale = isStale(snapshot.min.t, 5);
return {
  price: snapshot.min.c, // Still returns price even if stale
  isStale: stale, // Just a flag for UI
  staleReason: stale ? 'Price older than 5 minutes' : undefined
};
```

---

## 📝 Odpovede na protiotázky

### 1. Čo presne znamená "today" pre timestamp validation?

**Odpoveď:** **State-aware validation**

- **Live states** (PRE_MARKET_LIVE, LIVE, AFTER_HOURS_LIVE): Musí byť z dnešného ET dňa a v session okne
- **Frozen states** (OVERNIGHT_FROZEN, WEEKEND_FROZEN): Môže byť z posledného trading dňa (posledné 3 dni)

**Implementácia:** ✅ `isTimestampValid()` s pricing state

---

### 2. Čo je "frozen price" zdroj pravdy?

**Odpoveď:** **Last valid after-hours price**

- Zdroj: `SessionPrice(session='after', date=tradingDate, lastPrice > 0, lastTs <= 20:00 ET)`
- Uložené v DB, nie len Redis
- Nikdy neprepísané zero/null snapshotom

**Implementácia:** ✅ Worker loaduje z DB pred ingestom

---

### 3. Percentá po 16:00 - chceš "after-hours vs regularClose" pre VŠETKY tickery?

**Odpoveď:** **ÁNO, s fallbackom**

- Preferuje `regularClose` (D)
- Fallback na `previousClose` (D-1) ak `regularClose` chýba
- UI zobrazí "vs regular close" alebo "vs prev close" label

**Implementácia:** ✅ `calculatePercentChange()` vracia `reference.used`

---

### 4. "adjusted=true" konzistencia - máš ju naozaj end-to-end?

**Odpoveď:** **ÁNO**

- `previousClose`: vždy z `aggs/prev?adjusted=true`
- `regularClose`: z Polygon snapshot `day.c` (už adjusted)
- `snapshot.prevDay.c`: len fallback, nie primárny zdroj

**Status:** ✅ Implementované

---

### 5. `canOverwritePrice()` - čo presne porovnávaš?

**Odpoveď:** **Multi-factor check**

1. `state.canOverwrite` (frozen states = false)
2. `newPrice.price > 0` (nikdy zero/null)
3. `newPrice.timestamp > existingPrice.timestamp` (len novšie)

**Implementácia:** ✅ Všetky 3 faktory

---

## 🚀 Posledné 3 protiotázky

### 1. Freeze ceny ukladáš per symbol iba do Redis, alebo aj do DB?

**Odpoveď:** **DB (SessionPrice table)**

- Frozen price = `SessionPrice(session='after', lastPrice > 0, lastTs <= 20:00 ET)`
- Uložené v DB, nie len Redis
- Worker loaduje z DB pred ingestom

**Status:** ✅ Implementované

---

### 2. Máš v `canOverwritePrice()` explicitné pravidlo: price <= 0 nikdy?

**Odpoveď:** **ÁNO**

```typescript
// INVARIANT 2: Never overwrite with price <= 0
if (!newPrice.price || newPrice.price <= 0) {
  return false;
}
```

**Status:** ✅ Implementované

---

### 3. Používaš na ET dátumy niečo DST-safe, alebo zatiaľ fixný -05:00?

**Odpoveď:** **Čiastočne DST-safe**

- Používa `getDateET()` pre date string (YYYY-MM-DD)
- Vytvára Date objekt bez fixného offsetu
- ⚠️ **TODO:** Implementovať `createETDate()` helper pre plnú DST bezpečnosť

**Status:** ⚠️ **Čiastočne** - potrebuje vylepšenie

---

## ✅ Zhrnutie

Všetky kritické invarianty sú implementované:
- ✅ Price <= 0 never upserted
- ✅ Frozen prices never overwritten
- ✅ State-aware timestamp validation
- ✅ Adjusted consistency
- ✅ Reference info for UI
- ⚠️ DST-safe date handling (čiastočne - potrebuje vylepšenie)

Všetky edge cases majú jasné test cases a implementáciu.

