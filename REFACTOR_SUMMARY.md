# 🎯 Refaktor Summary - Session-Aware Pricing System

## ✅ Čo bolo implementované

### 1. **Session-Aware Price Resolver** (`priceResolver.ts`)

**Nový modul:** `src/lib/utils/priceResolver.ts`

**Kľúčové funkcie:**
- `resolveEffectivePrice()` - **SINGLE SOURCE OF TRUTH** pre ceny
- `calculatePercentChange()` - Session-aware percent change calculation

**Vlastnosti:**
- ✅ Session-aware priorita (pre-market: `min.c` > `lastTrade.p`)
- ✅ Timestamp validation (len dáta z dnešného dňa)
- ✅ Stale detection (5 min pre pre-market/after-hours, 1 min pre live)
- ✅ Frozen price support (pre overnight/weekend)

---

### 2. **Pricing State Machine** (`pricingStateMachine.ts`)

**Nový modul:** `src/lib/utils/pricingStateMachine.ts`

**Stavy:**
- `PRE_MARKET_LIVE` - 04:00-09:30 ET
- `LIVE` - 09:30-16:00 ET
- `AFTER_HOURS_LIVE` - 16:00-20:00 ET
- `AFTER_HOURS_FROZEN` / `OVERNIGHT_FROZEN` - 20:00-04:00 ET
- `WEEKEND_FROZEN` - Weekend/holiday

**Funkcie:**
- `getPricingState()` - Detekcia aktuálneho stavu
- `canOverwritePrice()` - Ochrana proti prepisovaniu
- `getPreviousCloseTTL()` - Trading-day based TTL

---

### 3. **Opravené v `polygonWorker.ts`**

**Zmeny:**
- ✅ Používa `resolveEffectivePrice()` namiesto priamej logiky
- ✅ Používa `getPricingState()` pre freeze mechanism
- ✅ Používa `getDateET()` namiesto UTC midnight
- ✅ Loaduje `regularClose` pre after-hours percent change
- ✅ Loaduje frozen prices pre overnight/weekend
- ✅ Používa `canOverwritePrice()` pre ochranu

---

### 4. **Opravené TTL pre Previous Close**

**Zmena:** `setPrevClose()` teraz používa `getPreviousCloseTTL()`

**TTL logika:**
- Minimum: 7 dní
- Maximum: 30 dní
- Vypočítané: `nextTradingDay + 24h buffer`

---

## 📊 Pricing Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Polygon Snapshot API                      │
│  { day: {c:0}, min: {c:360.6, t:...}, prevDay: {c:359.93} }│
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              getPricingState()                              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Detect Session: pre/live/after/closed               │  │
│  │ Check Weekend/Holiday                               │  │
│  │ Return: { state, canIngest, canOverwrite, ... }    │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              resolveEffectivePrice()                       │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 1. Check Frozen Price (if overnight/weekend)        │  │
│  │ 2. Session-aware Priority:                         │  │
│  │    - Pre-market: min.c > lastTrade.p                 │  │
│  │    - Live: lastTrade.p > day.c                      │  │
│  │    - After-hours: min.c > lastTrade.p               │  │
│  │ 3. Validate Timestamp (must be from today)          │  │
│  │ 4. Check Staleness (5min/1min threshold)            │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           calculatePercentChange()                         │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Pre-market: vs previousClose (D-1)                   │  │
│  │ Live: vs previousClose (D-1)                        │  │
│  │ After-hours: vs regularClose (D)                    │  │
│  │ Overnight: vs regularClose (D)                      │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              canOverwritePrice() Check                     │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ If state.canOverwrite = false → REJECT             │  │
│  │ If new timestamp > existing timestamp → ALLOW        │  │
│  │ Otherwise → REJECT                                  │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Upsert to DB + Redis                          │
│  - Ticker.lastPrice                                        │
│  - SessionPrice.lastPrice                                  │
│  - DailyRef.previousClose                                  │
│  - Redis: last:{date}:{session}:{symbol}                  │
│  - Redis: stock:{symbol}                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Kľúčové opravy

### 1. Pre-market Price Priority

**Pred:**
```typescript
if (snapshot.lastTrade?.p) {
  price = snapshot.lastTrade.p;  // ❌ Môže byť stale z včera!
}
```

**Po:**
```typescript
// Pre-market: min.c má prioritu (session-aware)
if (snapshot.min?.c && isTimestampInSession(snapshot.min.t, 'pre', now)) {
  price = snapshot.min.c;  // ✅ Vždy z dnešného pre-market!
}
```

---

### 2. After-hours Freeze

**Pred:**
```typescript
// Worker vždy prepisoval, aj po 20:00 ET
await prisma.sessionPrice.upsert({ ... });
```

**Po:**
```typescript
// Check pricing state
if (!canOverwritePrice(pricingState, existing, newPrice)) {
  return;  // ❌ NEPREPISOVAŤ frozen price!
}
```

---

### 3. Date Semantics

**Pred:**
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);  // ❌ UTC midnight!
```

**Po:**
```typescript
const dateET = getDateET();  // ✅ ET date string
const today = new Date(dateET + 'T00:00:00-05:00');  // ✅ ET midnight
```

---

### 4. Previous Close TTL

**Pred:**
```typescript
await redisClient.expire(key, 86400);  // ❌ 24h fixed
```

**Po:**
```typescript
const ttl = getPreviousCloseTTL();  // ✅ Trading-day based
await redisClient.expire(key, ttl);  // ✅ Min 7 days, max 30 days
```

---

### 5. Percent Change Calculation

**Pred:**
```typescript
const changePct = prevClose ? ((price / prevClose) - 1) * 100 : 0;
// ❌ Vždy vs previousClose, aj po 16:00 ET
```

**Po:**
```typescript
const changePct = calculatePercentChange(
  price,
  session,
  previousClose,  // D-1
  regularClose    // D (pre after-hours)
);
// ✅ Session-aware: after-hours vs regularClose
```

---

## 📋 Test Cases

### Test Case 1: Pre-market stale lastTrade

**Given:**
- Session: `pre` (05:00 ET)
- Snapshot: `{ lastTrade: {p: 150, t: yesterday}, min: {c: 151, t: today 05:00} }`

**When:**
- `resolveEffectivePrice()` is called

**Then:**
- Should return `min.c = 151` (not stale `lastTrade.p = 150`)
- Source: `'min'`
- isStale: `false`

---

### Test Case 2: After-hours freeze

**Given:**
- Session: `closed` (21:00 ET)
- Existing: `SessionPrice { session: 'after', lastPrice: 152, lastTs: 20:00 ET }`
- Snapshot: `{ day: {c: 0}, min: {c: 0} }`

**When:**
- Worker tries to ingest

**Then:**
- `canOverwritePrice()` returns `false`
- Frozen price `152` is preserved
- No overwrite with `day.c = 0`

---

### Test Case 3: Weekend TTL extension

**Given:**
- Day: Saturday
- `prevClose:2025-12-20:AAPL` exists (TTL would expire Sunday)

**When:**
- `getPreviousCloseTTL()` is called

**Then:**
- TTL = `nextTradingDay (Monday 09:30 ET) + 24h buffer`
- Minimum 7 days
- `prevClose` survives weekend

---

### Test Case 4: After-hours percent change

**Given:**
- Session: `after` (17:00 ET)
- Current price: `160.00`
- Previous close: `150.00` (D-1)
- Regular close: `158.00` (D)

**When:**
- `calculatePercentChange()` is called

**Then:**
- Should use `regularClose = 158.00` (not `previousClose = 150.00`)
- Result: `((160 / 158) - 1) * 100 = +1.27%`
- Not: `((160 / 150) - 1) * 100 = +6.67%`

---

## 🚀 Ďalšie kroky

1. ✅ Vytvoriť `priceResolver.ts` - **HOTOVÉ**
2. ✅ Vytvoriť `pricingStateMachine.ts` - **HOTOVÉ**
3. ✅ Upraviť `polygonWorker.ts` - **HOTOVÉ**
4. ✅ Opraviť `upsertToDB()` date semantics - **HOTOVÉ**
5. ✅ Implementovať freeze mechanism - **HOTOVÉ**
6. ✅ Opraviť TTL pre prevClose - **HOTOVÉ**
7. ⚠️ Testovať edge cases - **PENDING**
8. ⚠️ UI zobrazenie stale/frozen - **PENDING**

---

## 📝 Poznámky

- Všetky zmeny sú **backward compatible** (používajú existujúce API)
- Nové funkcie sú **opt-in** (môžu sa postupne migrovať)
- **Žiadne breaking changes** v DB schéme
- **Žiadne breaking changes** v Redis keys

---

## 📚 Dokumentácia

- `CRITICAL_DATA_ISSUES_ANALYSIS.md` - Analýza problémov
- `REFACTOR_IMPLEMENTATION_PLAN.md` - Implementation plan
- `PRODUCT_QUESTIONS_ANSWERS.md` - Odpovede na produktové otázky
- `REFACTOR_SUMMARY.md` - Tento dokument

