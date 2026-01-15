# 📊 Report: Automatické kontroly na produkcii

## Prehľad

Aplikácia má **5 hlavných automatických kontrol** pre validáciu a aktualizáciu cien, previousClose a ďalších dát:

1. **Polygon Worker** - Kontinuálna aktualizácia cien (každých 60s/5min)
2. **verify-prevclose** - Verifikácia previousClose (3x denne)
3. **update-static-data** - Denný reset a reload statických dát (1x denne)
4. **daily-integrity** - Denná kontrola integrity (1x denne)
5. **saveRegularClose** - Uloženie regular close po ukončení trading session

---

## 1. 🔄 Polygon Worker (Kontinuálna aktualizácia cien)

### Súbor
`src/workers/polygonWorker.ts`

### Kedy beží
- **Kontinuálne** - každých 60 sekúnd
- **Premium tickery** (top 200): každých 60s počas live trading, každých 5min počas pre-market/after-hours
- **Ostatné tickery**: každých 5 minút

### Čo robí

```typescript
// Hlavná logika v ingestLoop()
const ingestLoop = async () => {
  // 1. Detekuje session (pre/live/after/closed)
  const session = detectSession(etNow);
  
  // 2. Načíta tickery z Redis universe
  const tickers = await getUniverse('sp500');
  
  // 3. Filtruje tickery, ktoré potrebujú aktualizáciu
  const tickersNeedingUpdate = tickers.filter(ticker => {
    const lastUpdate = lastUpdateMap.get(ticker) || 0;
    const interval = premiumTickers.includes(ticker) 
      ? PREMIUM_INTERVAL  // 60s pre live, 5min pre pre-market
      : REST_INTERVAL;    // 5min
    return (now - lastUpdate) >= interval;
  });
  
  // 4. Spracuje v batchoch (70 tickerov na batch)
  await ingestBatch(batch, apiKey);
};
```

### Aktualizuje

1. **Ticker.lastPrice** - Aktuálna cena z Polygon API
2. **Ticker.lastChangePct** - Vypočítaný % change
3. **Ticker.lastMarketCap** - Market cap
4. **Ticker.lastMarketCapDiff** - Rozdiel market cap
5. **Ticker.latestPrevClose** - Previous close (ak je dostupný)
6. **Ticker.latestPrevCloseDate** - Dátum previous close
7. **SessionPrice** - Session-specific price records
8. **DailyRef** - Daily reference data (previousClose, regularClose)
9. **Redis cache** - Hot cache pre rýchly prístup

### Kľúčové vlastnosti

- ✅ **Session-aware** - Respektuje pricing state machine (frozen prices počas overnight)
- ✅ **Timestamp checking** - Aktualizuje len ak nová cena má novší timestamp
- ✅ **Rate limiting** - Max 250 req/min (Polygon limit: 300 req/min)
- ✅ **Batch processing** - 70 tickerov na batch, delay ~17s medzi batchmi
- ✅ **Prioritizácia** - Premium tickery majú častejšie aktualizácie

### Kód

```typescript:src/workers/polygonWorker.ts
// Hlavná ingest funkcia
export async function ingestBatch(
  tickers: string[],
  apiKey: string,
  force: boolean = false
): Promise<IngestResult[]> {
  // 1. Fetch snapshot z Polygon API
  const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
  
  // 2. Normalize dáta
  const normalized = normalizeSnapshot(snapshot, previousClose, regularClose, session);
  
  // 3. Upsert do DB (len ak novší timestamp)
  await upsertToDB(symbol, session, normalized, previousClose, marketCap, marketCapDiff);
  
  // 4. Update Redis cache
  await atomicUpdatePrice(redisSession, symbol, priceData, normalized.changePct);
}
```

---

## 2. ✅ verify-prevclose (Verifikácia previousClose)

### Súbor
`src/app/api/cron/verify-prevclose/route.ts`

### Kedy beží
- **3x denne** - 08:00, 14:00, 20:00 UTC (03:00, 09:00, 15:00 ET)
- Konfigurácia: `vercel.json`

```json
{
  "path": "/api/cron/verify-prevclose",
  "schedule": "0 8,14,20 * * *"
}
```

### Čo robí

1. **Načíta všetky tickery** s `lastPrice > 0` a `latestPrevClose > 0`
2. **Porovná DB hodnotu** s Polygon API hodnotou
3. **Opraví nesprávne hodnoty** (ak `diff > $0.01`)

### Kód

```typescript:src/app/api/cron/verify-prevclose/route.ts
async function verifyAndFixTicker(
  ticker: string,
  dbPrevClose: number,
  lastTradingDay: Date,
  todayStr: string,
  dryRun: boolean
): Promise<{ needsFix: boolean; fixed: boolean; diff: number }> {
  // 1. Fetch correct value from Polygon API
  const correctPrevClose = await getPreviousClose(ticker);
  
  // 2. Compare
  const diff = Math.abs(dbPrevClose - correctPrevClose);
  if (diff <= 0.01) {
    return { needsFix: false, fixed: false, diff };
  }
  
  // 3. Fix if not dry run
  if (!dryRun) {
    // Update Ticker table
    await prisma.ticker.update({
      where: { symbol: ticker },
      data: {
        latestPrevClose: correctPrevClose,
        latestPrevCloseDate: lastTradingDay
      }
    });
    
    // Update DailyRef table
    await prisma.dailyRef.upsert({
      where: { symbol_date: { symbol: ticker, date: lastTradingDay } },
      update: { previousClose: correctPrevClose },
      create: { symbol: ticker, date: lastTradingDay, previousClose: correctPrevClose }
    });
    
    // Update Redis cache
    await setPrevClose(todayStr, ticker, correctPrevClose);
  }
  
  return { needsFix: true, fixed: !dryRun, diff, correctValue: correctPrevClose };
}
```

### Výsledok

```json
{
  "success": true,
  "result": {
    "checked": 585,
    "needsFix": 5,
    "fixed": 5,
    "errors": 0,
    "issues": [
      {
        "ticker": "MSFT",
        "dbValue": 477.18,
        "correctValue": 470.67,
        "diff": 6.51
      }
    ]
  }
}
```

---

## 3. 🔄 update-static-data (Denný reset)

### Súbor
`src/app/api/cron/update-static-data/route.ts`

### Kedy beží
- **1x denne** - 06:00 UTC (01:00 ET)
- Konfigurácia: `vercel.json`

```json
{
  "path": "/api/cron/update-static-data",
  "schedule": "0 6 * * *"
}
```

### Čo robí

1. **Vymaže Redis cache** pre previousClose
2. **Resetuje closing prices** v DB (nastaví `latestPrevClose = null`)
3. **Vymaže DailyRef** záznamy pre dnes a last trading day
4. **Bootstrap previous closes** z Polygon API (full reload)
5. **Aktualizuje sharesOutstanding**

### Kód

```typescript:src/app/api/cron/update-static-data/route.ts
export async function POST(request: NextRequest) {
  // STEP 1: Clear Redis cache
  await clearRedisPrevCloseCache();
  
  // STEP 2: Reset closing prices in DB
  await resetClosingPricesInDB();
  
  // STEP 3: Bootstrap previous closes from Polygon (full reload)
  const tickers = await getUniverse('sp500');
  await bootstrapPreviousCloses(tickers, apiKey, today);
  
  // STEP 4: Update sharesOutstanding
  await processBatch(allTickers, updateSharesOutstanding);
}
```

### Problémy

⚠️ **Resetuje všetko** - aj správne hodnoty
⚠️ **Spúšťa sa len raz denne** - ak sa hodnota zmení počas dňa, zostane nesprávna až do ďalšieho dňa
⚠️ **Môže byť príliš agresívne** - resetuje aj správne hodnoty

---

## 4. 🔍 daily-integrity (Denná kontrola integrity)

### Súbor
`src/lib/jobs/dailyIntegrityCheck.ts` + `src/app/api/cron/daily-integrity/route.ts`

### Kedy beží
- **1x denne** - Manuálne alebo cez PM2 cron (10:00 UTC = 05:00 ET)
- PM2 konfigurácia: `ecosystem.config.js`

```javascript
{
  name: "daily-integrity-check",
  script: "scripts/daily-integrity-check.ts",
  cron_restart: "0 10 * * *"  // 10:00 UTC = 05:00 ET
}
```

### Čo kontroluje

1. **missing_prev_close** - Chýbajúca previousClose
2. **stale_prev_close_date** - Zastaralý dátum previousClose
3. **incorrect_prev_close** - Nesprávna hodnota previousClose (len ak `verifyPrevCloseValues=true`)
4. **invalid_change_pct** - Neplatný % change
5. **change_pct_mismatch** - Nesúlad vypočítaného % change so stored hodnotou
6. **missing_market_cap** - Chýbajúci market cap
7. **market_cap_mismatch** - Nesúlad market cap
8. **missing_market_cap_diff** - Chýbajúci market cap diff
9. **market_cap_diff_mismatch** - Nesúlad market cap diff
10. **missing_shares_outstanding** - Chýbajúce shares outstanding
11. **missing_sector** - Chýbajúci sector
12. **missing_industry** - Chýbajúci industry
13. **invalid_sector_industry** - Neplatná kombinácia sector/industry
14. **missing_logo** - Chýbajúce logo
15. **stale_price** - Stale cena (> 36h)

### Auto-fix

Ak `fix=true`, automaticky opraví:

- ✅ **missing_prev_close** (max 150 tickerov)
- ✅ **incorrect_prev_close** (max 100 tickerov, len ak `verifyPrevCloseValues=true`)
- ✅ **missing_shares_outstanding** (max 50 tickerov)
- ✅ **missing_logo** (max 200 tickerov)

### Kód

```typescript:src/lib/jobs/dailyIntegrityCheck.ts
export async function runDailyIntegrityCheck(
  options: DailyIntegrityOptions = {}
): Promise<DailyIntegritySummary> {
  const {
    fix = false,
    verifyPrevCloseValues = false,  // Default: false (pomalé)
    stalePriceHours = 36
  } = options;
  
  // 1. Načíta všetky tickery
  const tickers = await prisma.ticker.findMany({ ... });
  
  // 2. Pre každý ticker kontroluje integrity
  for (const t of tickers) {
    // A) Previous close integrity
    if (price > 0) {
      if (!hasPrevClose) {
        addIssue(byCode, 'missing_prev_close', symbol);
      } else if (verifyPrevCloseValues) {
        // Porovná s Polygon API
        const correctPrevClose = await getPreviousClose(symbol);
        if (diff > 0.01) {
          addIssue(byCode, 'incorrect_prev_close', symbol);
        }
      }
    }
    
    // B) Change % sanity
    const pct = calculatePercentChange(price, session, prevClose, regularClose);
    if (!Number.isFinite(pct)) {
      addIssue(byCode, 'invalid_change_pct', symbol);
    }
    
    // C) Market cap integrity
    // D) Metadata integrity (sector/industry)
    // E) Logo integrity
    // F) Stale price
  }
  
  // 3. Auto-fix ak fix=true
  if (fix) {
    // Fix missing prevClose
    await fetchPreviousClosesBatchAndPersist(missingPrevCloseSymbols);
    
    // Fix incorrect prevClose (len ak verifyPrevCloseValues=true)
    if (verifyPrevCloseValues) {
      for (const symbol of incorrectPrevCloseSymbols) {
        const correctPrevClose = await getPreviousClose(symbol);
        await prisma.ticker.update({
          where: { symbol },
          data: { latestPrevClose: correctPrevClose }
        });
      }
    }
  }
}
```

### Poznámka

⚠️ **verifyPrevCloseValues je default false** - aby sa vyhli nadmerným API volaniam
⚠️ **incorrect_prev_close kontrola je pomalá** - vyžaduje API volanie pre každý ticker

---

## 5. 💾 saveRegularClose (Uloženie regular close)

### Súbor
`src/workers/polygonWorker.ts` - funkcia `saveRegularClose()`

### Kedy beží
- **Po ukončení trading session** (16:00 ET)
- Spúšťa sa automaticky z Polygon worker

### Čo robí

1. **Uloží regularClose** pre dnešný deň (16:00 ET close price)
2. **Aktualizuje previousClose** pre zajtra (z dnešného regularClose)
3. **Aktualizuje Ticker.latestPrevClose** pre zajtra

### Kód

```typescript:src/workers/polygonWorker.ts
async function saveRegularClose(apiKey: string, date: string): Promise<void> {
  // 1. Fetch snapshots z Polygon API
  const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
  
  // 2. Pre každý ticker
  for (const snapshot of snapshots) {
    const regularClose = snapshot.day?.c;  // Regular session close
    
    if (regularClose && regularClose > 0) {
      // Update DailyRef with regular close
      await prisma.dailyRef.upsert({
        where: { symbol_date: { symbol, date: today } },
        update: { regularClose },
        create: { symbol, date: today, regularClose }
      });
      
      // CRITICAL: Update previousClose for tomorrow
      // Tomorrow's previousClose should be today's regularClose
      await prisma.dailyRef.upsert({
        where: { symbol_date: { symbol, date: tomorrow } },
        update: { previousClose: regularClose },
        create: { symbol, date: tomorrow, previousClose: regularClose }
      });
      
      // Update Ticker.latestPrevClose for tomorrow
      await prisma.ticker.update({
        where: { symbol },
        data: {
          latestPrevClose: regularClose,
          latestPrevCloseDate: tomorrow
        }
      });
    }
  }
}
```

---

## 📊 Súhrn automatických kontrol

| Kontrola | Frekvencia | Čo kontroluje | Auto-fix |
|----------|-----------|---------------|----------|
| **Polygon Worker** | 60s/5min | Aktuálne ceny, previousClose | ✅ Áno |
| **verify-prevclose** | 3x denne | Správnosť previousClose | ✅ Áno |
| **update-static-data** | 1x denne | Full reset | ✅ Áno |
| **daily-integrity** | 1x denne | 15 typov integrity issues | ✅ Áno (s limitmi) |
| **saveRegularClose** | Po 16:00 ET | Regular close + previousClose pre zajtra | ✅ Áno |

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
      "schedule": "0 8,14,20 * * *"  // 08:00, 14:00, 20:00 UTC
    }
  ]
}
```

### PM2 Cron Jobs (`ecosystem.config.js`)

```javascript
{
  name: "daily-integrity-check",
  script: "scripts/daily-integrity-check.ts",
  cron_restart: "0 10 * * *"  // 10:00 UTC = 05:00 ET
}
```

---

## 🐛 Identifikované problémy

### 1. **Stale ceny (MSFT, ULTA)**

**Príčina:**
- Polygon worker môže byť zastavený alebo frozen state blokuje aktualizácie
- SessionPrice môže mať staršie dáta ako Ticker.lastPrice
- Pricing state machine môže blokovať overwrite (overnight frozen)

**Riešenie:**
- Spustiť `check-worker-status.ts` na diagnostiku
- Spustiť `force-update-prices.ts` pre vynútenú aktualizáciu

### 2. **Nesprávny previousClose**

**Príčina:**
- `update-static-data` resetuje všetko, ale spúšťa sa len raz denne
- `verify-prevclose` kontroluje len 3x denne
- `daily-integrity` má `verifyPrevCloseValues=false` default (pomalé)

**Riešenie:**
- `verify-prevclose` beží 3x denne a automaticky opravuje
- `batch-fix-prevclose.ts` pre manuálnu opravu

### 3. **update-static-data je príliš agresívny**

**Príčina:**
- Resetuje všetko, aj správne hodnoty
- Môže resetovať hodnoty, ktoré boli opravené počas dňa

**Riešenie:**
- V budúcnosti optimalizovať, aby nerestoval všetko
- Použiť `verify-prevclose` ako hlavný mechanizmus kontroly

---

## 📝 Odporúčania

1. ✅ **verify-prevclose beží 3x denne** - dobré pokrytie
2. ⚠️ **update-static-data by mal byť menej agresívny** - nerestovať všetko
3. ✅ **daily-integrity má auto-fix** - ale s limitmi (bezpečné)
4. ⚠️ **verifyPrevCloseValues je default false** - aby sa vyhli nadmerným API volaniam
5. ✅ **Polygon worker kontinuálne aktualizuje** - ale môže byť blokovaný frozen state

---

## 🔗 Súvisiace súbory

- `src/workers/polygonWorker.ts` - Polygon worker
- `src/app/api/cron/verify-prevclose/route.ts` - Verify previousClose
- `src/app/api/cron/update-static-data/route.ts` - Update static data
- `src/lib/jobs/dailyIntegrityCheck.ts` - Daily integrity check
- `vercel.json` - Cron job konfigurácia
- `ecosystem.config.js` - PM2 konfigurácia
