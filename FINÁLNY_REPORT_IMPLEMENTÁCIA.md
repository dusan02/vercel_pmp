# 📊 Finálny Report: Implementácia automatických kontrol previousClose a cien

## Prehľad

Tento report popisuje **aktuálnu implementáciu** automatických kontrol a oprav po všetkých vylepšeniach. Obsahuje:
- Aktuálne automatizované procesy
- Opravy logických chýb
- Edge cases riešenia
- Semantika Modelu A

---

## ❌ Skript `reset-and-reload-closing-prices.ts` NIE JE automatizovaný

### Status
**Skript `scripts/reset-and-reload-closing-prices.ts` NIE JE súčasťou automatizovaných procesov.**

### Dôvod
Namiesto tohto skriptu sa používa **`/api/cron/update-static-data`**, ktorý:
- ✅ Je automatizovaný (Vercel cron: 06:00 UTC = 01:00 ET)
- ✅ Má vylepšenú logiku (refresh in place, lock, lepšie poradie operácií)
- ✅ Je bezpečnejší (nerestuje na null, má Redis lock)

### Kedy použiť manuálny skript
Skript `reset-and-reload-closing-prices.ts` je určený pre:
- **Manuálnu opravu** v prípade kritických problémov
- **Emergency reset** ak automatizácia zlyhá
- **Testing** nových funkcií

---

## ✅ Aktuálne automatizované procesy

### 1. **Polygon Worker** (Kontinuálna aktualizácia cien)

**Súbor:** `src/workers/polygonWorker.ts`

**Kedy beží:**
- **Kontinuálne** - každých 60 sekúnd
- **PM2:** `pmp-polygon-worker` (autorestart: true)

**Čo robí:**
```typescript
// 1. Detekuje session (pre/live/after/closed)
const session = detectSession(etNow);

// 2. Používa trading date (nie calendar date)
const calendarDateETStr = getDateET(now); // Calendar date
const calendarDateET = createETDate(calendarDateETStr);
const todayTradingDay = getLastTradingDay(calendarDateET);
const todayTradingDateStr = getDateET(todayTradingDay); // Trading date

// 3. Kontroluje Redis lock (ak je static update v progress)
let isStaticUpdateLocked = false;
const lockExists = await redisClient.exists('lock:static_data_update');
isStaticUpdateLocked = lockExists === 1;

// 4. Fetch prevClose z Redis (Model A: prevCloseKey(todayTradingDay) = close(yesterdayTradingDay))
const prevCloseMap = await getPrevClose(todayTradingDateStr, tickers);

// 5. Normalizuje a upsertuje do DB
// Počas locku zachováva lastChangePct ak nie je prevClose
const normalized = normalizeSnapshot(...);
await upsertToDB(..., isStaticUpdateLocked);
```

**Aktualizuje:**
- ✅ `Ticker.lastPrice` - aktuálna cena
- ✅ `Ticker.lastChangePct` - % change (zachováva počas locku ak nie je prevClose)
- ✅ `Ticker.latestPrevClose` - previous close (Model A)
- ✅ `Ticker.latestPrevCloseDate` - trading day kedy sa close stalo
- ✅ `SessionPrice` - session-specific price records
- ✅ `DailyRef` - daily reference data
- ✅ Redis cache - hot cache

**Kľúčové vylepšenia:**
- ✅ Používa `todayTradingDateStr` (trading date), nie calendar date
- ✅ Počas locku zachováva `lastChangePct` (predchádza UI flicker)
- ✅ Model A konzistentný (prevCloseKey(D) = close(D-1))

---

### 2. **verify-prevclose** (Verifikácia previousClose)

**Súbor:** `src/app/api/cron/verify-prevclose/route.ts`

**Kedy beží:**
- **3x denne** - 08:00, 14:00, 20:00 UTC (03:00, 09:00, 15:00 ET)
- **Vercel cron:** `vercel.json`

**Čo robí:**
```typescript
// 1. Používa trading date (nie calendar date)
const calendarDateETStr = getDateET(etNow);
const calendarDateET = createETDate(calendarDateETStr);
const todayTradingDay = getLastTradingDay(calendarDateET);
const todayTradingDateStr = getDateET(todayTradingDay);

// 2. INVARIANT: verify-prevclose only fixes prevClose for todayTradingDay, never nextTradingDay
const nextTradingDay = getNextTradingDay(todayTradingDay);
console.log(`📅 verify-prevclose target: prevClose(${todayTradingDateStr}) = close(yesterdayTradingDay), will NOT touch prevClose(${nextTradingDateStr})`);

// 3. Pre každý ticker:
//    - Fetch correct value from Polygon API
//    - Compare s DB hodnotou
//    - Fix ak diff > $0.01

// 4. Update DB a Redis (Model A)
await prisma.ticker.update({
  data: {
    latestPrevClose: correctPrevClose,
    latestPrevCloseDate: todayTradingDay // Trading day, nie calendar day
  }
});

await setPrevClose(todayTradingDateStr, ticker, correctPrevClose); // Trading date string
```

**Kľúčové vylepšenia:**
- ✅ Používa `todayTradingDateStr` (trading date)
- ✅ Loguje kontext (calendarET, tradingDayET, nextTradingDayET, session)
- ✅ **NEPREPISUJE** `prevClose(nextTradingDay)` pripravený zo `saveRegularClose`
- ✅ Model A konzistentný

---

### 3. **update-static-data** (Denný refresh)

**Súbor:** `src/app/api/cron/update-static-data/route.ts`

**Kedy beží:**
- **1x denne** - 06:00 UTC (01:00 ET)
- **Vercel cron:** `vercel.json`

**Čo robí:**
```typescript
// 1. Acquire Redis lock (s owner ID a auto-renewal)
const { acquired: lockAcquired, ownerId } = await acquireStaticUpdateLock();
const renewLockInterval = setInterval(async () => {
  await renewStaticUpdateLock(ownerId);
}, 5 * 60 * 1000); // Every 5 minutes

try {
  // 2. Clear Redis cache
  await clearRedisPrevCloseCache();
  
  // 3. Bootstrap FIRST (populuje nové hodnoty do DB)
  await bootstrapPreviousCloses(tickers, apiKey, calendarDateETStr);
  
  // 4. Refresh closing prices (delete stale entries, nové už sú v DB)
  const refreshResults = await refreshClosingPricesInDB();
  // NERESETUJE Ticker.latestPrevClose na null!
  // Len maže DailyRef pre todayTradingDay a yesterdayTradingDay
  
  // 5. Update sharesOutstanding
  await processBatch(allTickers, updateSharesOutstanding);
} finally {
  clearInterval(renewLockInterval);
  await releaseStaticUpdateLock(ownerId);
}
```

**Kľúčové vylepšenia:**
- ✅ **Refresh in place** - nerestuje `latestPrevClose` na null
- ✅ **Redis lock** s owner ID a auto-renewal
- ✅ **Lepšie poradie** - bootstrap PRED delete (nové hodnoty sú v DB pred mazaním)
- ✅ **Striktné mazanie** - len todayTradingDay a yesterdayTradingDay (ochrana histórie)

---

### 4. **saveRegularClose** (Uloženie regular close)

**Súbor:** `src/workers/polygonWorker.ts` - funkcia `saveRegularClose()`

**Kedy beží:**
- **Po ukončení trading session** (16:00 ET)
- Spúšťa sa automaticky z Polygon worker

**Čo robí:**
```typescript
// 1. Používa trading date (nie calendar date)
const calendarDateETStr = getDateET();
const calendarDateET = createETDate(calendarDateETStr);
const todayTradingDay = getLastTradingDay(calendarDateET);

// 2. CRITICAL: Use nextTradingDay, not calendar tomorrow!
const { getNextTradingDay } = await import('@/lib/utils/pricingStateMachine');
const nextTradingDay = getNextTradingDay(todayTradingDay); // Weekend-safe!
const nextTradingDateStr = getDateET(nextTradingDay);

// 3. INVARIANT: nextTradingDay must be a trading day
const nextTradingDayET = toET(nextTradingDay);
const isNextTradingDayValid = nextTradingDayET.weekday !== 0 && 
                             nextTradingDayET.weekday !== 6 && 
                             !isMarketHoliday(nextTradingDay);
if (!isNextTradingDayValid) {
  throw new Error(`nextTradingDay ${nextTradingDateStr} is not a valid trading day`);
}

// 4. Update DailyRef(D).regularClose = close(D)
await prisma.dailyRef.upsert({
  where: { symbol_date: { symbol, date: todayTradingDay } },
  update: { regularClose },
  create: { symbol, date: todayTradingDay, regularClose }
});

// 5. Update DailyRef(nextTradingDay).previousClose = close(todayTradingDay) (Model A)
await prisma.dailyRef.upsert({
  where: { symbol_date: { symbol, date: nextTradingDateObj } },
  update: { previousClose: regularClose },
  create: { symbol, date: nextTradingDateObj, previousClose: regularClose }
});

// 6. Update Redis (Model A: prevCloseKey(nextTradingDay) = close(todayTradingDay))
await setPrevClose(nextTradingDateStr, symbol, regularClose);

// 7. Update Ticker.latestPrevClose (denormalized field)
await prisma.ticker.update({
  where: { symbol },
  data: {
    latestPrevClose: regularClose,
    latestPrevCloseDate: todayTradingDay // Today's trading day (when close happened)
  }
});
```

**Kľúčové vylepšenia:**
- ✅ Používa `nextTradingDay` (weekend-safe), nie calendar tomorrow
- ✅ Invariant check: validácia, že nextTradingDay je trading day
- ✅ Model A konzistentný (Redis: prevClose(nextTradingDay) = close(todayTradingDay))

---

### 5. **daily-integrity** (Denná kontrola integrity)

**Súbor:** `src/lib/jobs/dailyIntegrityCheck.ts` + `src/app/api/cron/daily-integrity/route.ts`

**Kedy beží:**
- **1x denne** - 10:00 UTC (05:00 ET)
- **PM2 cron:** `ecosystem.config.js`

**Čo kontroluje:**
- ✅ `missing_prev_close` - chýbajúca previousClose
- ✅ `stale_prev_close_date` - zastaralý dátum previousClose
- ✅ `incorrect_prev_close` - nesprávna hodnota (len ak `verifyPrevCloseValues=true`)
- ✅ `invalid_change_pct` - neplatný % change
- ✅ `change_pct_mismatch` - nesúlad vypočítaného % change
- ✅ `stale_price` - stale cena (> 36h)
- ✅ ... a ďalšie integrity issues

**Auto-fix:**
- ✅ `missing_prev_close` (max 150 tickerov)
- ✅ `incorrect_prev_close` (max 100 tickerov, len ak `verifyPrevCloseValues=true`)
- ✅ `missing_shares_outstanding` (max 50 tickerov)
- ✅ `missing_logo` (max 200 tickerov)

---

## 🔧 Opravy logických chýb (implementované)

### 1. ✅ Semantika prevClose - Model A

**Definícia Modelu A:**
- `prevCloseKey(date)` = **previousClose pre tento trading day**
- Teda `prevCloseKey(D)` = close(D-1)

**Implementácia:**
- ✅ `saveRegularClose`: Redis `prevClose(nextTradingDay) = close(todayTradingDay)`
- ✅ Worker: číta `prevClose(todayTradingDateStr)` = close(yesterdayTradingDay)
- ✅ `verify-prevclose`: opravuje `prevClose(todayTradingDateStr)`
- ✅ Všetky systémy používajú Model A konzistentne

---

### 2. ✅ Zjednotené názvoslovie

**Predtým (zmätočné):**
- `today`, `dateET`, `etDate`, `tradingDateStr`

**Teraz (jasné):**
- `calendarDateETStr` - calendar date v ET (YYYY-MM-DD)
- `calendarDateET` - Date objekt pre calendar date
- `todayTradingDay` - trading day (Date objekt)
- `todayTradingDateStr` - trading date string (YYYY-MM-DD)

**Poznámka:**
- `getDateET()` vracia **calendar date**, nie trading date!
- Vždy explicitne rozlišujeme calendar vs trading date

---

### 3. ✅ saveRegularClose - nextTradingDay namiesto calendar tomorrow

**Problém:**
- Používalo sa `calendar tomorrow`, čo na piatok uloží prevClose na sobotu (nie trading day)

**Oprava:**
```typescript
// PRED:
const tomorrow = new Date(dateObj);
tomorrow.setDate(tomorrow.getDate() + 1); // Calendar tomorrow ❌

// PO:
const { getNextTradingDay } = await import('@/lib/utils/pricingStateMachine');
const nextTradingDay = getNextTradingDay(todayTradingDay); // Next trading day ✅

// + Invariant check
const isNextTradingDayValid = nextTradingDayET.weekday !== 0 && 
                             nextTradingDayET.weekday !== 6 && 
                             !isMarketHoliday(nextTradingDay);
if (!isNextTradingDayValid) {
  throw new Error(`nextTradingDay ${nextTradingDateStr} is not a valid trading day`);
}
```

---

### 4. ✅ Worker počas locku - zachováva lastChangePct

**Problém:**
- Počas locku worker prepisoval `lastChangePct` na 0/null, čo spôsobovalo "percentá zmizli" v UI

**Oprava:**
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
  }
}
```

---

### 5. ✅ verify-prevclose - neprepisuje nextTradingDay

**Problém:**
- verify-prevclose mohol prepisovať `prevClose(nextTradingDay)` pripravený zo `saveRegularClose`

**Oprava:**
```typescript
// INVARIANT: verify-prevclose only fixes prevClose for todayTradingDay, never nextTradingDay
const nextTradingDay = getNextTradingDay(todayTradingDay);
console.log(`📅 verify-prevclose target: prevClose(${todayTradingDateStr}) = close(yesterdayTradingDay), will NOT touch prevClose(${nextTradingDateStr})`);

// Update DailyRef - only for todayTradingDay
await prisma.dailyRef.upsert({
  where: {
    symbol_date: {
      symbol: ticker,
      date: todayTradingDay // todayTradingDay - this is the target day ✅
    }
  },
  // ...
});
```

---

### 6. ✅ update-static-data - lepšie poradie operácií

**Problém:**
- Mazalo sa pred bootstrapom, čo mohlo vytvoriť "dieru" ak bootstrap failne

**Oprava:**
```typescript
// PRED:
// 1. Delete DailyRef
// 2. Bootstrap (môže failnúť → diera)

// PO:
// 1. Bootstrap FIRST (populuje nové hodnoty)
// 2. Delete stale entries (nové už sú v DB)
```

---

### 7. ✅ Vylepšený lock mechanizmus

**Pridané:**
- **Owner ID** - bezpečné renewal a cleanup
- **Auto-renewal** každých 5 minút
- **Safe cleanup** (len ak vlastníme lock)

```typescript
const ownerId = `static_update_${Date.now()}_${Math.random().toString(36).substring(7)}`;

const renewLockInterval = setInterval(async () => {
  await renewStaticUpdateLock(ownerId);
}, 5 * 60 * 1000); // Every 5 minutes

// Cleanup len ak vlastníme lock
if (currentOwner === ownerId) {
  await redisClient.del(lockKey);
}
```

---

## 📊 Súhrn automatizovaných procesov

| Proces | Frekvencia | Čo robí | Auto-fix | Status |
|--------|-----------|---------|----------|--------|
| **Polygon Worker** | 60s/5min | Aktualizuje ceny, prevClose | ✅ Áno | ✅ Aktívny |
| **verify-prevclose** | 3x denne | Verifikuje prevClose | ✅ Áno | ✅ Aktívny |
| **update-static-data** | 1x denne | Refresh prevClose, shares | ✅ Áno | ✅ Aktívny |
| **saveRegularClose** | Po 16:00 ET | Uloží regular close | ✅ Áno | ✅ Aktívny |
| **daily-integrity** | 1x denne | Kontroluje 15 typov issues | ✅ Áno (s limitmi) | ✅ Aktívny |

---

## 🔧 Konfigurácia

### Vercel Cron Jobs (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron/verify-sector-industry",
      "schedule": "0 2 * * *"  // 02:00 UTC
    },
    {
      "path": "/api/cron/update-static-data",
      "schedule": "0 6 * * *"   // 06:00 UTC = 01:00 ET
    },
    {
      "path": "/api/cron/verify-prevclose",
      "schedule": "0 8,14,20 * * *"  // 08:00, 14:00, 20:00 UTC (03:00, 09:00, 15:00 ET)
    }
  ]
}
```

### PM2 Cron Jobs (`ecosystem.config.js`)

```javascript
{
  name: "pmp-polygon-worker",
  script: "src/workers/polygonWorker.ts",
  autorestart: true  // Kontinuálne beží
},
{
  name: "daily-integrity-check",
  script: "scripts/daily-integrity-check.ts",
  cron_restart: "0 10 * * *"  // 10:00 UTC = 05:00 ET
}
```

---

## 📝 Model A - Semantika

### Definícia

**Model A:**
- `prevCloseKey(date)` = **previousClose pre tento trading day**
- Teda `prevCloseKey(D)` = close(D-1)

### Príklady

**Dnes je trading day 2024-01-15 (pondelok):**
- `prevCloseKey(2024-01-15)` = close(2024-01-12) (piatok)
- `Redis prevClose("2024-01-15")` = close(2024-01-12)
- `DailyRef(date=2024-01-15).previousClose` = close(2024-01-12)

**Po close (16:00 ET):**
- `saveRegularClose` uloží:
  - `DailyRef(date=2024-01-15).regularClose` = close(2024-01-15)
  - `DailyRef(date=2024-01-16).previousClose` = close(2024-01-15) (Model A)
  - `Redis prevClose("2024-01-16")` = close(2024-01-15)

### Konzistentnosť

Všetky systémy používajú Model A:
- ✅ `saveRegularClose` - Redis: `prevClose(nextTradingDay) = close(todayTradingDay)`
- ✅ Worker - číta: `prevClose(todayTradingDateStr)` = close(yesterdayTradingDay)
- ✅ `verify-prevclose` - opravuje: `prevClose(todayTradingDateStr)`
- ✅ `update-static-data` - bootstrap používa trading date

---

## 🧪 Edge Cases - Riešenia

### 1. ✅ Piatok → pondelok

**Problém:**
- Calendar tomorrow by uložil prevClose na sobotu (nie trading day)

**Riešenie:**
```typescript
const nextTradingDay = getNextTradingDay(todayTradingDay); // Pondelok, nie sobota ✅
await setPrevClose(nextTradingDateStr, symbol, regularClose);
```

### 2. ✅ Sviatok

**Problém:**
- `todayTradingDay` musí byť posledný obchodný deň, nie sviatok

**Riešenie:**
```typescript
const todayTradingDay = getLastTradingDay(calendarDateET); // Vráti posledný trading day ✅
// verify-prevclose neprepisuje prevClose pre sviatok
```

### 3. ✅ Lock window

**Problém:**
- Worker počas locku prepisoval `lastChangePct` na 0/null

**Riešenie:**
```typescript
// Zachovávame poslednú platnú hodnotu lastChangePct
if (isStaticUpdateLocked && !previousClose) {
  changePctToUse = existingTicker.lastChangePct; // Preserve ✅
}
```

---

## 📋 Súhrn zmien

| Oprava | Súbor | Status |
|--------|-------|--------|
| **Model A semantika** | Všetky | ✅ Implementované |
| **nextTradingDay namiesto calendar tomorrow** | `polygonWorker.ts:395` | ✅ Implementované |
| **Worker zachováva lastChangePct počas locku** | `polygonWorker.ts:237-250` | ✅ Implementované |
| **verify-prevclose neprepisuje nextTradingDay** | `verify-prevclose/route.ts:162-165` | ✅ Implementované |
| **update-static-data lepšie poradie** | `update-static-data/route.ts:348-385` | ✅ Implementované |
| **Redis lock s owner ID** | `update-static-data/route.ts:65-120` | ✅ Implementované |
| **Zjednotené názvoslovie** | Všetky | ✅ Implementované |

---

## ✅ Status

**Všetky opravy sú implementované a build prešiel úspešne!** 🎉

**Automatizované procesy:**
- ✅ Polygon Worker - kontinuálne aktualizuje ceny
- ✅ verify-prevclose - 3x denne verifikuje prevClose
- ✅ update-static-data - 1x denne refresh (refresh in place)
- ✅ saveRegularClose - po 16:00 ET uloží regular close
- ✅ daily-integrity - 1x denne kontrola integrity

**Manuálne skripty (nie automatizované):**
- ⚠️ `reset-and-reload-closing-prices.ts` - len pre manuálnu opravu
- ✅ `batch-fix-prevclose.ts` - batch fix pre prevClose
- ✅ `force-update-prices.ts` - vynútená aktualizácia cien
- ✅ `diagnose-price-issue.ts` - diagnostika problémov

---

## 🔗 Súvisiace súbory

- `src/workers/polygonWorker.ts` - Polygon worker + saveRegularClose
- `src/app/api/cron/verify-prevclose/route.ts` - Verify previousClose
- `src/app/api/cron/update-static-data/route.ts` - Update static data
- `src/lib/jobs/dailyIntegrityCheck.ts` - Daily integrity check
- `vercel.json` - Cron job konfigurácia
- `ecosystem.config.js` - PM2 konfigurácia
