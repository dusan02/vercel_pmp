# ✅ Pre-Test Checklist - Sanity Points

## 1. Test Runner ✅

**Odpoveď:** **Jest** (nie Vitest)

**Dôkaz:**
- `package.json`: `"test": "jest"`
- `jest.config.js` existuje
- `ts-jest` v devDependencies

**Správne príkazy:**
```bash
# Jest syntax (nie Vitest)
npm test -- --testPathPattern="priceResolver|pricingStateMachine"
npm test -- --testPathPattern="polygonWorker.integration"
```

---

## 2. Timezone Handling ✅

**Odpoveď:** **Používa `createETDate()`, nie `new Date('YYYY-MM-DD')`**

**Opravené:**
- ✅ `polygonWorker.ts` teraz používa `createETDate(dateET)` namiesto `new Date(dateET + 'T00:00:00')`
- ✅ `Intl.DateTimeFormat` s `timeZone: 'America/New_York'` je nezávislé od `TZ` env var
- ✅ Všetky dátumy sa vytvárajú cez DST-safe helpery

**CI timezone testy:**
- Testy bežia v 3 timezónach (UTC, America/New_York, Europe/Prague)
- `Intl.DateTimeFormat` funguje konzistentne v každej timezone

---

## 3. Holiday/Weekend Detection ✅

**Odpoveď:** **Deterministická (hardcoded zoznam)**

**Dôkaz:**
- `timeUtils.ts` má hardcoded holiday zoznam
- `calculateEaster()` je deterministický algoritmus
- V testoch sa mockuje `isMarketHoliday()` → deterministické

**Status:** ✅ **OK** - nie je flaky

---

## 4. Frozen Price Mapping ✅

**Odpoveď:** **Deterministický - `Map(symbol -> firstRow)`**

**Opravené:**
- ✅ Query má `orderBy: { lastTs: 'desc' }` - najnovšie prvé
- ✅ `seenSymbols` Set zabezpečuje, že každý symbol má len jeden záznam
- ✅ Berie sa **prvý záznam pre symbol**, nie globálne top 1

**Kód:**
```typescript
const seenSymbols = new Set<string>();
frozenSessionPrices.forEach(sp => {
  if (!seenSymbols.has(sp.symbol) && sp.lastPrice && sp.lastPrice > 0) {
    frozenPricesMap.set(sp.symbol, { ... });
    seenSymbols.add(sp.symbol); // Deterministic: one price per symbol
  }
});
```

---

## 5. TTL Testy ✅

**Odpoveď:** **Range testy, nie exact**

**Dôkaz:**
```typescript
it('should return minimum 7 days', () => {
  expect(ttl).toBeGreaterThanOrEqual(7 * 24 * 60 * 60);
});

it('should return maximum 30 days', () => {
  expect(ttl).toBeLessThanOrEqual(30 * 24 * 60 * 60);
});
```

**Status:** ✅ **OK** - testuje range, nie exact hodnotu

---

## 6. Nanosecond Handling ✅

**Odpoveď:** **Všetky timestamps sa konvertujú cez `nsToMs()`**

**Opravené:**
- ✅ `snapshot.min.t` → `nsToMs(snapshot.min.t)` pred použitím
- ✅ `snapshot.lastTrade.t` → `nsToMs(snapshot.lastTrade.t)` pred použitím
- ✅ `snapshot.lastQuote.t` → `nsToMs(snapshot.lastQuote.t)` pred použitím
- ✅ `isTimestampValid()` a `isTimestampInSession()` už konvertujú interné

**Kód:**
```typescript
// PRE-MARKET
const minTMs = nsToMs(snapshot.min.t);
const isValid = isTimestampValid(minTMs, now, pricingState.state);
const isInPreMarket = isTimestampInSession(minTMs, 'pre', now);
const stale = isStale(minTMs, 5);
```

**Status:** ✅ **OK** - všetky timestamps sa konvertujú

---

## 7. Smoke Test ✅

**Pridané:** `priceResolver.smoke.test.ts`

**Testuje:**
- ✅ Celý flow: resolveEffectivePrice + calculatePercentChange
- ✅ Všetky invarianty (price > 0, reference info, atď.)
- ✅ After-hours s regularClose
- ✅ Zero guards
- ✅ Frozen price handling

---

## 8. CI Non-Flaky Check ✅

**Pridané:** Dvojité spustenie unit testov v CI

**Kód:**
```yaml
- name: Run critical unit tests (first pass)
  run: npm test -- --testPathPattern="priceResolver|pricingStateMachine"

- name: Run critical unit tests (second pass - non-flaky check)
  run: npm test -- --testPathPattern="priceResolver|pricingStateMachine"
```

**Cieľ:** Chytiť race/time bugs

---

## 📋 Zhrnutie

| Otázka | Odpoveď | Status |
|--------|---------|--------|
| Test runner | Jest | ✅ |
| Timezone handling | `createETDate()` | ✅ Opravené |
| Holiday detection | Deterministic | ✅ |
| Frozen mapping | `Map(symbol -> firstRow)` | ✅ Opravené |
| TTL testy | Range, nie exact | ✅ |
| Nanosecond handling | Všetky timestamps | ✅ Opravené |
| Smoke test | Pridaný | ✅ |
| CI non-flaky | Dvojité spustenie | ✅ |

---

## 🚀 Spustenie testov

```bash
# 1) Unit testy (Jest syntax)
npm test -- --testPathPattern="priceResolver|pricingStateMachine"

# 2) Integračné testy
npm test -- --testPathPattern="polygonWorker.integration"

# 3) Smoke test
npm test -- --testPathPattern="smoke"

# 4) Všetko dokopy
npm test

# 5) Coverage
npm run test:coverage
```

---

## ✅ Všetko je pripravené!

Všetky sanity body sú overené a opravené. Testy sú pripravené na spustenie.

