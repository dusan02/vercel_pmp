# 🔧 Refaktor Implementation Plan

## ✅ Čo bolo implementované

### 1. Session-Aware Price Resolver (`priceResolver.ts`)

**Nový modul:** `src/lib/utils/priceResolver.ts`

**Funkcie:**
- `resolveEffectivePrice()` - **SINGLE SOURCE OF TRUTH** pre ceny
- `calculatePercentChange()` - Session-aware percent change calculation

**Kľúčové vlastnosti:**
- ✅ Session-aware priorita (pre-market: `min.c` > `lastTrade.p`)
- ✅ Timestamp validation (len dáta z dnešného dňa)
- ✅ Stale detection (5 min pre pre-market/after-hours, 1 min pre live)
- ✅ Frozen price support (pre overnight/weekend)

---

### 2. Pricing State Machine (`pricingStateMachine.ts`)

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

### 3. Opravené v `polygonWorker.ts`

**Zmeny:**
- ✅ Používa `resolveEffectivePrice()` namiesto priamej logiky
- ✅ Používa `getPricingState()` pre freeze mechanism
- ✅ Používa `getDateET()` namiesto UTC midnight
- ✅ Loaduje `regularClose` pre after-hours percent change
- ✅ Loaduje frozen prices pre overnight/weekend
- ✅ Používa `canOverwritePrice()` pre ochranu

---

### 4. Opravené TTL pre Previous Close

**Zmena:** `setPrevClose()` teraz používa `getPreviousCloseTTL()`

**TTL logika:**
- Minimum: 7 dní
- Maximum: 30 dní
- Vypočítané: `nextTradingDay + 24h buffer`

---

## 📋 Čo ešte treba dokončiť

### 1. Opraviť `upsertToDB()` date semantics

**Problém:** Stále používa UTC midnight

**Riešenie:**
```typescript
// Namiesto:
const today = new Date();
today.setHours(0, 0, 0, 0);

// Použiť:
const dateET = getDateET();
const today = new Date(dateET + 'T00:00:00-05:00');
```

---

### 2. Opraviť `bootstrapPreviousCloses()` - vždy adjusted=true

**Aktuálne:** ✅ Už používa `adjusted=true` (riadok 613)

**Potrebné:** Zajistiť, že `normalizeSnapshot()` NIKDY nepoužíva `snapshot.prevDay.c` ako primárny zdroj

---

### 3. Implementovať freeze mechanism v worker loop

**Potrebné:** Po 20:00 ET, ak máme after-hours cenu, **NEPREPISOVAŤ** ju!

---

### 4. Odpovede na produktové otázky

---

## 🎯 Odpovede na produktové otázky

### 1. Má byť pre-market % rovnaké ako live %?

**Odpoveď:** **NIE** - majú byť **oddelené**!

**Dôvod:**
- Pre-market % = vs previous close (D-1) - "o koľko sa zmenilo oproti včerajšku"
- Live % = vs previous close (D-1) - "o koľko sa zmenilo oproti včerajšku"
- After-hours % = vs regular close (D) - "o koľko sa zmenilo oproti dnešnému close"

**UX príklad:**
```
Pre-market: +2.1% (vs $150.00 včera)
Live: +5.3% (vs $150.00 včera)
After-hours: +0.5% (vs $158.00 dnes)
```

**Implementácia:** ✅ Už implementované v `calculatePercentChange()`

---

### 2. Chceš oddeliť pre-market / after-hours changePct?

**Odpoveď:** **ÁNO** - už je oddelené!

**Aktuálne:**
- Pre-market: `changePct` vs `previousClose` (D-1)
- Live: `changePct` vs `previousClose` (D-1)
- After-hours: `changePct` vs `regularClose` (D)

**UI zobrazenie:**
- Pre-market: "Pre-market: +2.1%"
- Live: "Today: +5.3%"
- After-hours: "After-hours: +0.5%"

---

### 3. Má mať užívateľ vizuálny signál (stale/frozen/after-hours)?

**Odpoveď:** **ÁNO** - odporúčané!

**Implementácia:**
- `isStale` flag v `EffectivePrice`
- `source` field (`'frozen'`, `'min'`, `'lastTrade'`, atď.)
- `quality` field (`'delayed_15m'`, `'rest'`, `'snapshot'`)

**UI návrh:**
- Stale: Šedá farba, opacity 0.7
- Frozen: Ikona "🔒" alebo "Frozen"
- After-hours: Modrá farba, label "After-hours"

---

### 4. Plánuješ historickú pre-market heatmapu?

**Odpoveď:** **ÁNO** - `SessionPrice` už podporuje!

**Aktuálne:**
- `SessionPrice` má `date`, `session`, `lastPrice`, `lastTs`
- Môže sa queryovať historické dáta

**Potrebné:**
- Immutability rules (neprepisovať staršie dáta)
- ✅ Už implementované v `canOverwritePrice()`

---

### 5. Chceš neskôr futures/crypto/ADR?

**Odpoveď:** **State machine sa vyplatí!**

**Rozšírenie:**
```typescript
enum AssetType {
  STOCK = 'stock',
  FUTURE = 'future',
  CRYPTO = 'crypto',
  ADR = 'adr'
}

// Crypto: 24/7, žiadne session
// Futures: Rôzne trading hours
// ADR: Primary listing vs ADR listing
```

---

## 📊 Diagram: Pricing Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Polygon Snapshot API                      │
│  { day: {c:0}, min: {c:360.6, t:...}, prevDay: {c:359.93} }│
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              resolveEffectivePrice()                       │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 1. Detect Session (pre/live/after/closed)            │  │
│  │ 2. Get Pricing State (canIngest? canOverwrite?)     │  │
│  │ 3. Check Frozen Price (if overnight/weekend)         │  │
│  │ 4. Validate Timestamp (must be from today)          │  │
│  │ 5. Session-aware Priority:                          │  │
│  │    - Pre-market: min.c > lastTrade.p                 │  │
│  │    - Live: lastTrade.p > day.c                       │  │
│  │    - After-hours: min.c > lastTrade.p                │  │
│  │    - Overnight: frozen price (no overwrite)          │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           calculatePercentChange()                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Pre-market: vs previousClose (D-1)                  │  │
│  │ Live: vs previousClose (D-1)                          │  │
│  │ After-hours: vs regularClose (D)                     │  │
│  │ Overnight: vs regularClose (D)                       │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              canOverwritePrice() Check                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ If state.canOverwrite = false → REJECT              │  │
│  │ If new timestamp > existing timestamp → ALLOW        │  │
│  │ Otherwise → REJECT                                  │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Upsert to DB + Redis                           │
│  - Ticker.lastPrice                                         │
│  - SessionPrice.lastPrice                                   │
│  - DailyRef.previousClose                                   │
│  - Redis: last:{date}:{session}:{symbol}                   │
│  - Redis: stock:{symbol}                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 Test Cases (Given/When/Then)

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
4. ⚠️ Opraviť `upsertToDB()` date semantics - **ČÁSTOČNE** (treba dokončiť)
5. ⚠️ Implementovať freeze v worker loop - **ČÁSTOČNE** (treba dokončiť)
6. ⚠️ Testovať edge cases - **PENDING**
7. ⚠️ UI zobrazenie stale/frozen - **PENDING**

---

## 📝 Poznámky

- Všetky zmeny sú **backward compatible** (používajú existujúce API)
- Nové funkcie sú **opt-in** (môžu sa postupne migrovať)
- **Žiadne breaking changes** v DB schéme

