# 🎯 Odpovede na produktové otázky

## 1️⃣ Pre-market % vs Live % - Má byť rovnaké alebo oddelené?

### Odpoveď: **ODDELENÉ** ✅

**Dôvod:**
- **Pre-market %** = vs previous close (D-1) - "o koľko sa zmenilo oproti včerajšku"
- **Live %** = vs previous close (D-1) - "o koľko sa zmenilo oproti včerajšku"  
- **After-hours %** = vs regular close (D) - "o koľko sa zmenilo oproti dnešnému close"

**UX príklad:**
```
Pre-market (05:00 ET):  +2.1% (vs $150.00 včera)
Live (15:00 ET):        +5.3% (vs $150.00 včera)
After-hours (17:00 ET): +0.5% (vs $158.00 dnes - regular close)
```

**Implementácia:** ✅ Už implementované v `calculatePercentChange()`

**UI zobrazenie:**
- Pre-market: "Pre-market: +2.1%"
- Live: "Today: +5.3%"
- After-hours: "After-hours: +0.5%"

---

## 2️⃣ Chceš oddeliť pre-market / after-hours changePct?

### Odpoveď: **ÁNO** - už je oddelené! ✅

**Aktuálne implementácia:**
- Pre-market: `changePct` vs `previousClose` (D-1)
- Live: `changePct` vs `previousClose` (D-1)
- After-hours: `changePct` vs `regularClose` (D)
- Overnight: `changePct` vs `regularClose` (D)

**Kód:**
```typescript
// priceResolver.ts, calculatePercentChange()
switch (session) {
  case 'pre':
  case 'live':
    referencePrice = previousClose;  // D-1
    break;
  case 'after':
  case 'closed':
    referencePrice = regularClose || previousClose;  // D (prefer regularClose)
    break;
}
```

**Výhody:**
- Finančne intuitívne (zodpovedá sa Bloomberg/Yahoo UX)
- After-hours % ukazuje zmenu oproti dnešnému close, nie včerajšiemu
- Pre-market % ukazuje zmenu oproti včerajšiemu close

---

## 3️⃣ Má mať užívateľ vizuálny signál (stale/frozen/after-hours)?

### Odpoveď: **ÁNO** - odporúčané! ✅

**Dostupné dáta:**
- `isStale` flag v `EffectivePrice`
- `source` field (`'frozen'`, `'min'`, `'lastTrade'`, `'day'`)
- `quality` field (`'delayed_15m'`, `'rest'`, `'snapshot'`)

**UI návrh:**

#### A. Stale dáta
- **Vizuál:** Šedá farba, opacity 0.7
- **Label:** "Stale" alebo "Last update: 5 min ago"
- **Ikona:** ⚠️ alebo 🕐

#### B. Frozen dáta
- **Vizuál:** Modrá farba, border
- **Label:** "Frozen" alebo "After-hours (frozen)"
- **Ikona:** 🔒

#### C. After-hours dáta
- **Vizuál:** Modrá farba
- **Label:** "After-hours" alebo "Extended hours"
- **Ikona:** 🌙

#### D. Pre-market dáta
- **Vizuál:** Oranžová/žltá farba
- **Label:** "Pre-market"
- **Ikona:** 🌅

**Implementácia v komponente:**
```tsx
{effectivePrice.isStale && (
  <Badge variant="secondary" className="opacity-70">
    ⚠️ Stale ({Math.round(ageMinutes)} min ago)
  </Badge>
)}

{effectivePrice.source === 'frozen' && (
  <Badge variant="outline" className="border-blue-500">
    🔒 Frozen
  </Badge>
)}
```

---

## 4️⃣ Plánuješ historickú pre-market heatmapu?

### Odpoveď: **ÁNO** - `SessionPrice` už podporuje! ✅

**Aktuálne:**
- `SessionPrice` má `date`, `session`, `lastPrice`, `lastTs`
- Môže sa queryovať historické dáta:
  ```typescript
  await prisma.sessionPrice.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      session: 'pre'
    }
  });
  ```

**Potrebné pre historickú heatmapu:**
- ✅ Immutability rules (neprepisovať staršie dáta) - už implementované v `canOverwritePrice()`
- ✅ Timestamp validation - už implementované v `resolveEffectivePrice()`
- ⚠️ UI komponent pre historické zobrazenie - **PENDING**

**Príklad query:**
```typescript
// Get pre-market prices for last 5 days
const historicalPreMarket = await prisma.sessionPrice.findMany({
  where: {
    symbol: 'AAPL',
    session: 'pre',
    date: { gte: fiveDaysAgo }
  },
  orderBy: { date: 'desc' }
});
```

---

## 5️⃣ Chceš neskôr futures/crypto/ADR?

### Odpoveď: **State machine sa vyplatí!** ✅

**Rozšírenie state machine:**

```typescript
enum AssetType {
  STOCK = 'stock',      // Current implementation
  FUTURE = 'future',    // Different trading hours
  CRYPTO = 'crypto',    // 24/7, no sessions
  ADR = 'adr'          // Primary listing vs ADR listing
}

enum PriceState {
  // Stocks (current)
  PRE_MARKET_LIVE,
  LIVE,
  AFTER_HOURS_LIVE,
  AFTER_HOURS_FROZEN,
  OVERNIGHT_FROZEN,
  WEEKEND_FROZEN,
  
  // Crypto (future)
  CRYPTO_24_7,         // Always live
  
  // Futures (future)
  FUTURES_PRE_MARKET,
  FUTURES_LIVE,
  FUTURES_AFTER_HOURS,
  
  // ADR (future)
  ADR_PRIMARY_LISTING,  // Use primary exchange hours
  ADR_US_LISTING        // Use US market hours
}
```

**Výhody:**
- Jednotná logika pre všetky asset types
- Ľahké pridanie nových typov
- Session-aware resolver funguje pre všetky typy

---

## 📊 Zhrnutie produktových rozhodnutí

| Otázka | Odpoveď | Implementácia |
|--------|---------|---------------|
| Pre-market % vs Live % | **Oddelené** | ✅ `calculatePercentChange()` |
| After-hours % | **Vs regularClose (D)** | ✅ `calculatePercentChange()` |
| Vizuálny signál | **ÁNO** | ⚠️ UI komponent pending |
| Historická heatmapa | **ÁNO** | ✅ DB podporuje, UI pending |
| Futures/Crypto/ADR | **State machine sa vyplatí** | ✅ Rozšíriteľné |

---

## 🎨 UI Implementácia (odporúčania)

### 1. Stale Data Indicator

```tsx
interface StaleIndicatorProps {
  isStale: boolean;
  ageMinutes: number;
  source: string;
}

export function StaleIndicator({ isStale, ageMinutes, source }: StaleIndicatorProps) {
  if (!isStale) return null;
  
  return (
    <Tooltip content={`Last update: ${ageMinutes} min ago`}>
      <Badge variant="secondary" className="opacity-70 text-xs">
        ⚠️ Stale
      </Badge>
    </Tooltip>
  );
}
```

### 2. Session Badge

```tsx
interface SessionBadgeProps {
  session: 'pre' | 'live' | 'after' | 'closed';
  source: string;
}

export function SessionBadge({ session, source }: SessionBadgeProps) {
  const config = {
    pre: { label: 'Pre-market', icon: '🌅', color: 'orange' },
    live: { label: 'Live', icon: '📊', color: 'green' },
    after: { label: 'After-hours', icon: '🌙', color: 'blue' },
    closed: source === 'frozen' 
      ? { label: 'Frozen', icon: '🔒', color: 'gray' }
      : { label: 'Closed', icon: '🔒', color: 'gray' }
  };
  
  const { label, icon, color } = config[session];
  
  return (
    <Badge variant="outline" className={`border-${color}-500`}>
      {icon} {label}
    </Badge>
  );
}
```

### 3. Percent Change Display

```tsx
interface PercentChangeProps {
  changePct: number;
  session: 'pre' | 'live' | 'after' | 'closed';
  previousClose: number;
  regularClose?: number;
}

export function PercentChange({ changePct, session, previousClose, regularClose }: PercentChangeProps) {
  const reference = session === 'after' || session === 'closed' 
    ? regularClose || previousClose 
    : previousClose;
  
  const label = session === 'after' || session === 'closed'
    ? 'After-hours'
    : session === 'pre'
    ? 'Pre-market'
    : 'Today';
  
  return (
    <div className="flex items-center gap-2">
      <span className={changePct >= 0 ? 'text-green-600' : 'text-red-600'}>
        {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
      </span>
      <span className="text-xs text-gray-500">
        ({label}: vs ${reference.toFixed(2)})
      </span>
    </div>
  );
}
```

---

## ✅ Záver

Všetky produktové otázky majú jasné odpovede a väčšina je už implementovaná v kóde. Zostáva len UI implementácia pre vizuálne signály.

