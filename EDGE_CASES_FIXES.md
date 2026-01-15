# 🔧 Finálne opravy edge cases

## Prehľad

Opravené všetky edge cases identifikované užívateľom, ktoré by mohli spôsobiť problémy cez víkend/sviatok alebo pri paralelných joboch.

---

## 1. ✅ saveRegularClose() - nextTradingDay namiesto calendar tomorrow

### Problém
Používalo sa `calendar tomorrow`, čo na piatok uloží prevClose na sobotu (nie trading day).

### Oprava
```typescript
// PRED:
const tomorrow = new Date(dateObj);
tomorrow.setDate(tomorrow.getDate() + 1); // Calendar tomorrow ❌

// PO:
const { getNextTradingDay } = await import('@/lib/utils/pricingStateMachine');
const nextTradingDay = getNextTradingDay(todayTradingDay); // Next trading day ✅
```

### Invariant check
```typescript
// INVARIANT: nextTradingDay must be a trading day (not weekend/holiday)
const nextTradingDayET = toET(nextTradingDay);
const isNextTradingDayValid = nextTradingDayET.weekday !== 0 && 
                             nextTradingDayET.weekday !== 6 && 
                             !isMarketHoliday(nextTradingDay);

if (!isNextTradingDayValid) {
  console.error(`❌ INVARIANT VIOLATION: nextTradingDay ${nextTradingDateStr} is not a valid trading day!`);
  throw new Error(`nextTradingDay ${nextTradingDateStr} is not a valid trading day`);
}
```

**Súbor:** `src/workers/polygonWorker.ts:395-444`

---

## 2. ✅ Worker počas locku - zachováva lastChangePct

### Problém
Počas locku worker prepisoval `lastChangePct` na 0/null, čo spôsobovalo "percentá zmizli" v UI.

### Oprava
```typescript
// Počas locku zachovávame poslednú platnú hodnotu lastChangePct
let changePctToUse = normalized.changePct;
if (isStaticUpdateLocked && !previousClose) {
  const existingTicker = await prisma.ticker.findUnique({
    where: { symbol },
    select: { lastChangePct: true }
  });
  if (existingTicker && existingTicker.lastChangePct !== null) {
    changePctToUse = existingTicker.lastChangePct; // Zachovávame ✅
    console.log(`⚠️  ${symbol}: Preserving lastChangePct=${changePctToUse} during lock`);
  }
}
```

**Súbor:** `src/workers/polygonWorker.ts:237-250`

---

## 3. ✅ verify-prevclose - neprepisuje nextTradingDay

### Problém
verify-prevclose mohol prepisovať `prevClose(nextTradingDay)` pripravený zo `saveRegularClose`.

### Oprava
```typescript
// INVARIANT: verify-prevclose only fixes prevClose for todayTradingDay, never nextTradingDay
const nextTradingDay = getNextTradingDay(todayTradingDay);
const nextTradingDateStr = getDateET(nextTradingDay);

console.log(`📅 verify-prevclose target: prevClose(${todayTradingDateStr}) = close(yesterdayTradingDay), will NOT touch prevClose(${nextTradingDateStr})`);

// Update DailyRef - only for todayTradingDay (lastTradingDay parameter)
await prisma.dailyRef.upsert({
  where: {
    symbol_date: {
      symbol: ticker,
      date: lastTradingDay // todayTradingDay - this is the target day ✅
    }
  },
  // ...
});
```

**Súbor:** `src/app/api/cron/verify-prevclose/route.ts:162-165, 71-87`

---

## 4. ✅ update-static-data - lepšie poradie operácií

### Problém
Mazalo sa pred bootstrapom, čo mohlo vytvoriť "dieru" ak bootstrap failne.

### Oprava
```typescript
// PRED:
// 1. Delete DailyRef
// 2. Bootstrap (môže failnúť → diera)

// PO:
// 1. Bootstrap FIRST (populuje nové hodnoty)
// 2. Delete stale entries (nové už sú v DB)
```

**Súbor:** `src/app/api/cron/update-static-data/route.ts:344-385`

---

## 5. ✅ Vylepšený lock mechanizmus

### Pridané
- **Owner ID** - bezpečné renewal a cleanup
- **Auto-renewal** každých 5 minút
- **Striktné mazanie** - len todayTradingDay a yesterdayTradingDay

```typescript
// Owner ID pre bezpečné renewal
const ownerId = `static_update_${Date.now()}_${Math.random().toString(36).substring(7)}`;

// Auto-renewal
const renewLockInterval = setInterval(async () => {
  await renewStaticUpdateLock(ownerId);
}, 5 * 60 * 1000); // Every 5 minutes

// Cleanup len ak vlastníme lock
if (currentOwner === ownerId) {
  await redisClient.del(lockKey);
}
```

**Súbor:** `src/app/api/cron/update-static-data/route.ts:65-120`

---

## 6. ✅ Invarianty zakódované v kóde

### A) PrevClose "day pairing"
```typescript
// saveRegularClose:
const isNextTradingDayValid = nextTradingDayET.weekday !== 0 && 
                             nextTradingDayET.weekday !== 6 && 
                             !isMarketHoliday(nextTradingDay);
if (!isNextTradingDayValid) {
  throw new Error(`nextTradingDay ${nextTradingDateStr} is not a valid trading day`);
}
```

### B) saveRegularClose target day
```typescript
// Vždy používa nextTradingDay, nie calendar tomorrow
const nextTradingDay = getNextTradingDay(todayTradingDay);
```

### C) Worker lookup
```typescript
// Vždy používa todayTradingDateStr (D), nie yesterdayTradingDateStr (D-1)
const todayTradingDateStr = getDateET(todayTradingDay);
const prevCloseMap = await getPrevClose(todayTradingDateStr, tickers);
```

---

## 📊 Súhrn zmien

| Edge Case | Súbor | Oprava |
|-----------|-------|--------|
| **nextTradingDay vs calendar tomorrow** | `polygonWorker.ts:395` | Používa `getNextTradingDay()` + invariant check |
| **Worker lock - zachováva lastChangePct** | `polygonWorker.ts:237-250` | Preserve ak locked + no prevClose |
| **verify-prevclose neprepisuje nextTradingDay** | `verify-prevclose/route.ts:162-165` | Loguje kontext, len todayTradingDay |
| **update-static-data poradie** | `update-static-data/route.ts:348-385` | Bootstrap pred delete |
| **Lock owner ID + renewal** | `update-static-data/route.ts:65-120` | Owner ID, auto-renewal, safe cleanup |

---

## 🧪 Testovacie scenáre

### 1. Piatok → pondelok
- ✅ `saveRegularClose` v piatok uloží `prevClose(pondelok) = close(piatok)`
- ✅ Redis key je pondelok, nie sobota

### 2. Sviatok
- ✅ `todayTradingDay` = posledný obchodný deň
- ✅ `verify-prevclose` neprepisuje `prevClose` pre sviatok

### 3. Lock window
- ✅ `lastPrice` sa mení
- ✅ `lastChangePct` sa **nemení** (zachováva sa)
- ✅ Po unlock: catch-up prepočet obnoví konzistenciu

---

## 📝 Poznámky

- **nextTradingDay je teraz weekend-safe** - používa `getNextTradingDay()`, nie calendar arithmetic
- **Worker počas locku zachováva UI** - percentá nezmiznú
- **verify-prevclose je bezpečný** - neprepisuje budúce hodnoty
- **update-static-data je atomic** - bootstrap pred delete
- **Invarianty sú zakódované** - testy spadnú ak sa porušia

---

## ✅ Status

Všetky edge cases sú opravené a build prešiel úspešne! 🎉
