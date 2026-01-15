# 🔧 Opravy logických chýb v automatických kontrolách

## Prehľad

Opravené kritické logické chyby, ktoré spôsobovali problémy s "nie všetky akcie majú na nový deň správne dopočítané dáta".

---

## 1. ✅ Oprava: `saveRegularClose()` - Redis cache používala `tomorrow` namiesto `today`

### Problém
Redis cache pre `prevClose` používala `tomorrowDateStr` namiesto `dateET` (dnešný trading day).

### Dôsledok
- Redis mal prevClose uložený pod nesprávnym dátumom
- Worker čítal prevClose z iného dňa ako z DB
- Integrity check hlásil `stale_prev_close_date`

### Oprava
```typescript
// PRED:
await setPrevClose(tomorrowDateStr, symbol, regularClose);

// PO:
await setPrevClose(dateET, symbol, regularClose); // Dnešný trading day (kedy sa close stalo)
```

**Súbor:** `src/workers/polygonWorker.ts:443`

---

## 2. ✅ Oprava: `verify-prevclose` používala calendar date namiesto trading date

### Problém
`verify-prevclose` používala `todayStr` z `getDateET(etNow)`, ktorý môže byť calendar date, nie trading date.

### Dôsledok
- Redis cache sa aktualizovala pod nesprávnym dátumom
- DB mal správny trading date, ale Redis mal calendar date
- Frontend/worker čítali z Redis nesprávne hodnoty

### Oprava
```typescript
// PRED:
const etNow = createETDate(getDateET());
const todayStr = getDateET(etNow);
await setPrevClose(todayStr, ticker, correctPrevClose);

// PO:
const etNow = nowET();
const etDate = getDateET(etNow);
const etDateObj = createETDate(etDate);
const lastTradingDay = getLastTradingDay(etDateObj);
const tradingDateStr = getDateET(lastTradingDay); // Trading date, nie calendar date
await setPrevClose(tradingDateStr, ticker, correctPrevClose);
```

**Súbor:** `src/app/api/cron/verify-prevclose/route.ts:153-155, 91`

---

## 3. ✅ Oprava: `update-static-data` - príliš agresívny reset

### Problém
`update-static-data` resetoval všetky `latestPrevClose` na `null` ako prvý krok, čo vytvorilo "okno chaosu":
- Worker medzičasom rátal percentá s `null` referenciami
- Niektoré tickery mali správne hodnoty, iné mali `null`
- Bootstrap môže failnúť pre konkrétny batch

### Dôsledok
- "Niektoré tickery ok, niektoré nie" - presne symptom, ktorý používateľ popisoval
- Worker počítal `changePct` s `null` prevClose → nesprávne hodnoty

### Oprava

#### 3a. Pridaný Redis lock
```typescript
// Nová funkcia: acquireStaticUpdateLock()
async function acquireStaticUpdateLock(): Promise<boolean> {
  const lockKey = 'lock:static_data_update';
  const result = await redisClient.set(lockKey, lockValue, {
    EX: 1800, // 30 min TTL
    NX: true  // Only if not exists
  });
  return result === 'OK';
}
```

#### 3b. Zmäkčený reset - refresh in place
```typescript
// PRED:
async function resetClosingPricesInDB() {
  // Reset Ticker.latestPrevClose to null
  await prisma.ticker.updateMany({
    data: { latestPrevClose: null, latestPrevCloseDate: null }
  });
  // Delete DailyRef entries
}

// PO:
async function refreshClosingPricesInDB() {
  // NERESETUJEME Ticker.latestPrevClose na null!
  // Bootstrap bude aktualizovať existujúce hodnoty, zachová správne hodnoty
  // Len vymažeme DailyRef (budú repopulované)
  await prisma.dailyRef.deleteMany({ ... });
}
```

#### 3c. Worker kontroluje lock
```typescript
// V polygonWorker.ingestBatch():
let isStaticUpdateLocked = false;
const lockExists = await redisClient.exists('lock:static_data_update');
isStaticUpdateLocked = lockExists === 1;

if (isStaticUpdateLocked) {
  console.log('⚠️  Static data update in progress - skipping percentage calculations');
  // Skip normalization ak nie je prevClose (prevents null reference errors)
}
```

**Súbory:**
- `src/app/api/cron/update-static-data/route.ts:64-104, 229-263`
- `src/workers/polygonWorker.ts:511-525, 558-567, 683-691`

---

## 4. ✅ Oprava: Polygon worker používal calendar date namiesto trading date

### Problém
Worker používal `today` (calendar date) pre prevClose lookup namiesto `lastTradingDay` (trading date).

### Dôsledok
- Worker čítal prevClose z nesprávneho dňa
- Redis cache mal prevClose pod calendar date, DB mal trading date
- Nezrovnalosti medzi DB a Redis

### Oprava
```typescript
// PRED:
const today = getDateET(now);
const prevCloseMap = await getPrevClose(today, tickers);
const dailyRefs = await prisma.dailyRef.findMany({
  where: { date: todayDate } // Calendar date
});

// PO:
const today = getDateET(now);
const todayDate = createETDate(today);
const lastTradingDay = getLastTradingDay(todayDate);
const tradingDateStr = getDateET(lastTradingDay); // Trading date
const prevCloseMap = await getPrevClose(tradingDateStr, tickers);
const dailyRefs = await prisma.dailyRef.findMany({
  where: { date: lastTradingDay } // Trading date
});
```

**Súbor:** `src/workers/polygonWorker.ts:504-548, 562-567`

---

## 5. ✅ Zjednotená trading date logika

### Zmeny
Všetky systémy teraz používajú **trading date (ET)** namiesto calendar date:

- ✅ `saveRegularClose` - Redis cache používa `dateET` (trading day)
- ✅ `verify-prevclose` - používa `tradingDateStr` (lastTradingDay)
- ✅ `polygonWorker` - používa `tradingDateStr` pre prevClose lookup
- ✅ `update-static-data` - používa trading date pre všetky operácie

### Helper funkcie
Všetky používajú:
- `getDateET()` - vráti trading date string (YYYY-MM-DD) v ET
- `getLastTradingDay(dateObj)` - vráti posledný trading day
- `createETDate(dateStr)` - vytvorí Date objekt v ET timezone

---

## 📊 Súhrn zmien

| Problém | Súbor | Riadok | Oprava |
|---------|-------|--------|--------|
| Redis cache používa tomorrow | `polygonWorker.ts` | 443 | Používa `dateET` namiesto `tomorrowDateStr` |
| verify-prevclose calendar date | `verify-prevclose/route.ts` | 153-155, 91 | Používa `tradingDateStr` (lastTradingDay) |
| update-static-data reset na null | `update-static-data/route.ts` | 64-104 | Refresh in place + Redis lock |
| Worker calendar date | `polygonWorker.ts` | 504-548 | Používa `tradingDateStr` pre prevClose lookup |
| Worker lock check | `polygonWorker.ts` | 511-525, 683-691 | Kontroluje lock, skip normalization ak locked |

---

## 🧪 Testovanie

### Checklist na diagnostiku

Keď nájdeš ticker, ktorý má ráno zlé dáta, pozri:

1. ✅ `Ticker.latestPrevClose` a `Ticker.latestPrevCloseDate`
   - `latestPrevCloseDate` má byť **včerajší trading day**, nie dnes ani zajtra

2. ✅ `DailyRef` pre:
   - **dnešný trading day** (má `previousClose`?)
   - **včerajší trading day** (má `regularClose`?)

3. ✅ Redis:
   - `prevClose` key pre **včerajší trading day (ET)** existuje?
   - Nie je tam prevClose uložený pod UTC dátumom?

4. ✅ Lock:
   - `lock:static_data_update` existuje? (ak áno, update beží)

---

## 📝 Poznámky

- **Trading date vs Calendar date**: Vždy používaj trading date (ET) pre prevClose operácie
- **Redis lock**: Worker teraz respektuje lock a nerátá percentá počas static update
- **Refresh in place**: `update-static-data` už nerestuje na null, zachová správne hodnoty

---

## 🚀 Nasadenie

Všetky zmeny sú kompatibilné s existujúcim kódom. Odporúčané:
1. Deploy na staging
2. Monitorovať logy pre lock messages
3. Skontrolovať, že `verify-prevclose` používa správne dátumy
4. Deploy na production
