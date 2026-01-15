# 📊 Finálny Report: Automatické kontroly previousClose a cien - Aktuálna implementácia

## Prehľad

Tento report popisuje **aktuálnu implementáciu** automatických kontrol po všetkých opravách. Všetky systémy sú teraz **konzistentné**, používajú **Model A** pre prevClose semantiku a majú **ochranu proti edge cases** (víkendy, sviatky, paralelné joby).

---

## 🎯 Automatizované procesy

### 1. ✅ verify-prevclose (Vercel Cron)

**Status:** ✅ **PLNE AUTOMATIZOVANÝ**

**Konfigurácia:**
```json
// vercel.json
{
  "path": "/api/cron/verify-prevclose",
  "schedule": "0 8,14,20 * * *"  // 08:00, 14:00, 20:00 UTC (03:00, 09:00, 15:00 ET)
}
```

**Frekvencia:** **3x denne**

**Čo robí:**
1. Načíta všetky tickery s `lastPrice > 0` a `latestPrevClose > 0`
2. Porovná DB hodnotu s Polygon API hodnotou
3. **Automaticky opraví** nesprávne hodnoty (ak `diff > $0.01`)

**Aktuálne opravy:**
- ✅ Používa `todayTradingDateStr` (trading date, nie calendar date)
- ✅ Loguje kontext: `calendarET`, `tradingDayET`, `nextTradingDayET`, `isTradingDay`, `session`
- ✅ **Neprepisuje** `prevClose(nextTradingDay)` pripravený zo `saveRegularClose`
- ✅ Model A: `prevCloseKey(todayTradingDay) = close(yesterdayTradingDay)`

**Súbor:** `src/app/api/cron/verify-prevclose/route.ts`

**Manuálne spustenie:**
```bash
# Test (dry run)
curl -X GET "https://premarketprice.com/api/cron/verify-prevclose?limit=10&dryRun=true"

# Skutočná oprava
curl -X POST "https://premarketprice.com/api/cron/verify-prevclose" \
  -H "Authorization: Bearer $CRON_SECRET_KEY"
```

---

### 2. ✅ update-static-data (Vercel Cron)

**Status:** ✅ **PLNE AUTOMATIZOVANÝ**

**Konfigurácia:**
```json
// vercel.json
{
  "path": "/api/cron/update-static-data",
  "schedule": "0 6 * * *"  // 06:00 UTC = 01:00 ET
}
```

**Frekvencia:** **1x denne** (ráno pred otvorením trhu)

**Čo robí:**
1. **Acquire Redis lock** (`lock:static_data_update`) s owner ID
2. **Clear Redis cache** pre previous closes
3. **Bootstrap previous closes** z Polygon API (populuje nové hodnoty)
4. **Refresh DailyRef** (vymaže len stale entries, nové už sú v DB)
5. **Update sharesOutstanding**
6. **Release lock** (s owner ID check)

**Aktuálne opravy:**
- ✅ **Refresh in place** - nerestuje `latestPrevClose` na null
- ✅ **Redis lock** s owner ID a auto-renewal (každých 5 min)
- ✅ **Lepšie poradie** - bootstrap PRED delete (nové hodnoty v DB pred mazaním)
- ✅ **Striktné mazanie** - len `todayTradingDay` a `yesterdayTradingDay` (ochrana histórie)

**Súbor:** `src/app/api/cron/update-static-data/route.ts`

---

### 3. ✅ daily-integrity-check (PM2 Cron)

**Status:** ✅ **PLNE AUTOMATIZOVANÝ**

**Konfigurácia:**
```javascript
// ecosystem.config.js
{
  name: "daily-integrity-check",
  script: "scripts/daily-integrity-check.ts",
  cron_restart: "0 10 * * *"  // 10:00 UTC = 05:00 ET
}
```

**Frekvencia:** **1x denne**

**Čo kontroluje:**
- `missing_prev_close` - chýbajúca previousClose
- `stale_prev_close_date` - zastaralý dátum previousClose
- `incorrect_prev_close` - nesprávna hodnota previousClose (len ak `verifyPrevCloseValues=true`)
- `invalid_change_pct`, `change_pct_mismatch`
- `missing_market_cap`, `market_cap_mismatch`
- `missing_shares_outstanding`
- `missing_sector`, `missing_industry`
- `stale_price` - stale cena (> 36h)

**Auto-fix:**
- ✅ `missing_prev_close` (max 150 tickerov)
- ✅ `incorrect_prev_close` (max 100 tickerov, len ak `verifyPrevCloseValues=true`)
- ✅ `missing_shares_outstanding` (max 50 tickerov)
- ✅ `missing_logo` (max 200 tickerov)

**Súbor:** `src/lib/jobs/dailyIntegrityCheck.ts` + `scripts/daily-integrity-check.ts`

---

### 4. ✅ Polygon Worker (PM2 - kontinuálne)

**Status:** ✅ **PLNE AUTOMATIZOVANÝ**

**Konfigurácia:**
```javascript
// ecosystem.config.js
{
  name: "pmp-polygon-worker",
  script: "src/workers/polygonWorker.ts",
  autorestart: true
}
```

**Frekvencia:** **Kontinuálne** (každých 60s/5min)

**Aktuálne opravy:**
- ✅ Používa `todayTradingDateStr` (D) pre prevClose lookup (Model A)
- ✅ **Kontroluje Redis lock** - počas locku zachováva `lastChangePct` ak nie je prevClose
- ✅ **Zachováva UI** - percentá nezmiznú počas static update
- ✅ Používa trading date namiesto calendar date

**Súbor:** `src/workers/polygonWorker.ts`

---

### 5. ✅ saveRegularClose (automaticky z Polygon Worker)

**Status:** ✅ **PLNE AUTOMATIZOVANÝ**

**Kedy beží:** Automaticky z Polygon Worker po ukončení trading session (16:00 ET)

**Aktuálne opravy:**
- ✅ Používa `getNextTradingDay()` namiesto calendar tomorrow (weekend-safe)
- ✅ **Invariant check** - validuje, že nextTradingDay je trading day
- ✅ Model A: `prevCloseKey(nextTradingDay) = close(todayTradingDay)`
- ✅ Redis cache: `prevClose(nextTradingDateStr) = regularClose`

**Súbor:** `src/workers/polygonWorker.ts:361-475`

---

## 📅 Kompletný harmonogram automatizovaných procesov

| Proces | Platforma | Frekvencia | Čas (UTC) | Čas (ET) | Status |
|--------|-----------|------------|-----------|----------|--------|
| **verify-sector-industry** | Vercel | 1x denne | 02:00 | 21:00 (predchádzajúci deň) | ✅ Auto |
| **update-static-data** | Vercel | 1x denne | 06:00 | 01:00 | ✅ Auto |
| **verify-prevclose** | Vercel | **3x denne** | 08:00, 14:00, 20:00 | 03:00, 09:00, 15:00 | ✅ Auto |
| **daily-integrity-check** | PM2 | 1x denne | 10:00 | 05:00 | ✅ Auto |
| **Polygon Worker** | PM2 | Kontinuálne | - | - | ✅ Auto |
| **saveRegularClose** | Auto (z Worker) | Po 16:00 ET | - | 16:00 | ✅ Auto |

---

## 🔧 Kľúčové opravy implementované

### 1. Model A - Konzistentná semantika

**Definícia:**
- `prevCloseKey(date)` = **previousClose pre tento trading day**
- Teda `prevCloseKey(D)` = close(D-1)

**Implementované vo všetkých systémoch:**
- ✅ `saveRegularClose`: Redis `prevClose(nextTradingDay) = close(todayTradingDay)`
- ✅ `verify-prevclose`: Redis `prevClose(todayTradingDay) = close(yesterdayTradingDay)`
- ✅ `polygonWorker`: Číta `prevClose(todayTradingDateStr)` (Model A)
- ✅ `update-static-data`: Používa trading date pre všetky operácie

---

### 2. nextTradingDay vs calendar tomorrow

**Problém:** Na piatok by uložilo prevClose na sobotu (nie trading day)

**Oprava:**
```typescript
// PRED:
const tomorrow = new Date(dateObj);
tomorrow.setDate(tomorrow.getDate() + 1); // Calendar tomorrow ❌

// PO:
const nextTradingDay = getNextTradingDay(todayTradingDay); // Next trading day ✅
// + Invariant check: validácia, že je trading day
```

**Súbor:** `src/workers/polygonWorker.ts:395-444`

---

### 3. Worker počas locku - zachováva lastChangePct

**Problém:** Počas locku worker prepisoval `lastChangePct` na 0/null

**Oprava:**
```typescript
// Počas locku zachovávame poslednú platnú hodnotu
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

**Súbor:** `src/workers/polygonWorker.ts:237-250`

---

### 4. update-static-data - lepšie poradie operácií

**Problém:** Mazalo sa pred bootstrapom → "diera" ak bootstrap failne

**Oprava:**
```typescript
// PRED:
// 1. Delete DailyRef
// 2. Bootstrap (môže failnúť → diera)

// PO:
// 1. Bootstrap FIRST (populuje nové hodnoty)
// 2. Delete stale entries (nové už sú v DB)
```

**Súbor:** `src/app/api/cron/update-static-data/route.ts:348-385`

---

### 5. Redis lock s owner ID a renewal

**Pridané:**
- Owner ID pre bezpečné renewal
- Auto-renewal každých 5 minút
- Safe cleanup (len ak vlastníme lock)

**Súbor:** `src/app/api/cron/update-static-data/route.ts:65-120`

---

## 📊 Súhrn automatizovaných kontrol

| Kontrola | Platforma | Frekvencia | Čo kontroluje | Auto-fix | Status |
|----------|-----------|------------|---------------|----------|--------|
| **verify-prevclose** | Vercel | 3x denne | Správnosť previousClose | ✅ Áno | ✅ Auto |
| **update-static-data** | Vercel | 1x denne | Refresh prevClose + shares | ✅ Áno | ✅ Auto |
| **daily-integrity** | PM2 | 1x denne | 15 typov integrity issues | ✅ Áno (s limitmi) | ✅ Auto |
| **Polygon Worker** | PM2 | Kontinuálne | Aktuálne ceny, prevClose | ✅ Áno | ✅ Auto |
| **saveRegularClose** | Auto | Po 16:00 ET | Regular close + prevClose pre zajtra | ✅ Áno | ✅ Auto |

---

## ✅ Status

**Všetky automatizované procesy sú:**
- ✅ **PLNE AUTOMATIZOVANÉ** (Vercel cron alebo PM2 cron)
- ✅ **KONZISTENTNÉ** (Model A všade)
- ✅ **EDGE CASE SAFE** (weekend, holiday, lock)
- ✅ **INVARIANTY ZAKÓDOVANÉ** (testy spadnú ak sa porušia)

**Build:** ✅ Úspešný
**Všetky opravy:** ✅ Implementované
**Dokumentácia:** ✅ Kompletná
