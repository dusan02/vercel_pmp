# 📊 Finálny Report: Opravené procesy a automatizácia

## Prehľad

Tento report popisuje **všetky opravy a vylepšenia** implementované v automatizovaných procesoch pre správu previousClose, cien a sector/industry údajov. Všetky systémy sú teraz **konzistentné**, **edge-case safe** a **optimalizované**.

---

## ✅ Finálne opravy (posledné "ostré kamienky")

### 1. Stale lock detection - Oprava TTL výpočtu

**Problém:**
- TTL výpočet bol logicky chybný: `lockAgeSeconds = 1800 - ttl`
- Pri max TTL 1800s (30 min) nikdy neprekročí 2700s (45 min)
- Detekcia nefungovala

**Oprava:**
```typescript
// Lock value obsahuje createdAt timestamp (JSON)
const lockValue = JSON.stringify({ ownerId, createdAt: Date.now() });

// Worker číta createdAt a počíta skutočný vek
const lockValue = JSON.parse(lockValueStr);
if (lockValue.createdAt) {
  lockAgeSeconds = Math.floor((Date.now() - lockValue.createdAt) / 1000);
}

if (lockAgeSeconds > 45 * 60) {
  console.error(`❌ STALE LOCK DETECTED: lock exists for ${Math.round(lockAgeSeconds / 60)} minutes`);
}
```

**Výsledok:**
- ✅ Skutočný vek locku (nie TTL)
- ✅ Detekcia >45 min funguje správne
- ✅ Backward compatible (legacy format support)

**Súbory:**
- `src/app/api/cron/update-static-data/route.ts:66-89` (acquire)
- `src/app/api/cron/update-static-data/route.ts:94-115` (renew)
- `src/app/api/cron/update-static-data/route.ts:120-136` (release)
- `src/workers/polygonWorker.ts:565-585` (detection)

---

### 2. verify-sector-industry - Vylepšené logging

**Problém:**
- Nerozlišovalo medzi `fixedByKnownMapping` a `fixedByValidationRules`
- Nevidno, či upstream taxonomy zmenil

**Oprava:**
```typescript
// Rozlišuje metódy fixu
errors.push({
  ticker: symbol,
  current: `${currentSector} / ${currentIndustry}`,
  fixed: `${correct.sector} / ${correct.industry}`,
  method: 'knownMapping' // alebo 'validationRules', 'normalizedOnly'
});

// HIGH IMPORTANCE log pre known mapping
console.log(`🔴 HIGH IMPORTANCE: Fixed by known mapping (upstream taxonomy may have changed)`);

// Summary s breakdown
console.log(`   - Fixed by known mapping: ${fixedByKnownMapping} (HIGH IMPORTANCE)`);
console.log(`   - Fixed by validation rules: ${fixedByValidationRules}`);
console.log(`   - Needs manual review: ${normalizedOnly}`);
```

**Výsledok:**
- ✅ Vidno, koľko fixov bolo cez known mapping (HIGH IMPORTANCE)
- ✅ Vidno, koľko cez validation rules
- ✅ Vidno, koľko potrebuje manuálny review

**Súbor:** `src/app/api/cron/verify-sector-industry/route.ts:96-230`

---

### 3. Worker invariant - Partial update pre no prevClose mimo locku

**Problém:**
- `price: 0` môže vyzerať ako reálny pád ceny
- Môže sa omylom uložiť do DB

**Oprava:**
```typescript
// Partial update: update price, preserve lastChangePct
if (!previousClose && !isStaticUpdateLocked) {
  const effectivePrice = snapshot.lastTrade?.p || snapshot.min?.c || snapshot.day?.c || 0;
  
  if (effectivePrice > 0) {
    // Partial update: update price, preserve lastChangePct and marketCapDiff
    await prisma.ticker.update({
      where: { symbol },
      data: {
        lastPrice: effectivePrice,
        lastPriceUpdated: new Date()
        // Do NOT update lastChangePct, lastMarketCapDiff (preserve last valid)
      }
    });
    
    results.push({
      symbol,
      price: effectivePrice,
      changePct: existingTicker?.lastChangePct || 0,
      success: true,
      error: 'Partial update - no previousClose available'
    });
  }
  continue;
}
```

**Výsledok:**
- ✅ Cena sa aktualizuje (nie 0)
- ✅ Percentá sa zachovávajú (posledná platná hodnota)
- ✅ Bezpečnejšie pre UI/DB

**Súbor:** `src/workers/polygonWorker.ts:779-820`

---

### 4. saveRegularClose fallback - Guard proti duplicitnému spusteniu

**Problém:**
- Fallback na 16:00 ET môže spustiť saveRegularClose dvakrát
- Môže spustiť v half-day

**Oprava:**
```typescript
// Guard: check if already saved for today
if (hours === 16 && minutes === 0) {
  const existingDailyRef = await prisma.dailyRef.findFirst({
    where: {
      date: todayTradingDay,
      regularClose: { not: null }
    }
  });
  
  if (!existingDailyRef) {
    // Not saved yet - safe to save
    await saveRegularClose(apiKey, today, runId);
  } else {
    console.log(`⏭️  Skipping fallback saveRegularClose - already saved`);
  }
}
```

**Výsledok:**
- ✅ Nespustí sa dvakrát
- ✅ Safe by design (kontroluje DB pred spustením)

**Súbor:** `src/workers/polygonWorker.ts:1238-1260`

---

## ✅ Pôvodné implementované opravy

### 1. verify-prevclose - Zahrnutie broken tickerov

**Problém:**
- Kontroloval len tickery s `latestPrevClose > 0`
- Broken tickery (null/0 alebo stale date) neprešli filtrom a zostali pokazené

**Oprava:**
```typescript
// Kontroluje aj broken tickery:
OR: [
  // Normal case: has prevClose
  { latestPrevClose: { gt: 0 } },
  // Broken case: missing or stale prevClose
  {
    OR: [
      { latestPrevClose: null },
      { latestPrevClose: 0 },
      { latestPrevCloseDate: { not: yesterdayTradingDay } } // Stale date
    ]
  }
]
```

**Výsledok:**
- ✅ Opravuje aj tickery, ktoré boli resetované alebo nikdy nemali prevClose
- ✅ Kontroluje stale date (prevCloseDate != yesterdayTradingDay)

**Súbor:** `src/app/api/cron/verify-prevclose/route.ts:138-168`

---

### 2. Optimalizácia lastChangePct preservation

**Problém:**
- Počas locku robil DB query **per ticker** pre každý symbol
- Pomalé, drahé na DB, spôsobovalo worker lag

**Oprava:**
```typescript
// Batch fetch pre celý batch naraz
const lastChangePctMap = new Map<string, number | null>();
if (isStaticUpdateLocked) {
  const tickersWithChangePct = await prisma.ticker.findMany({
    where: { symbol: { in: tickers } },
    select: { symbol: true, lastChangePct: true }
  });
  tickersWithChangePct.forEach(t => {
    lastChangePctMap.set(t.symbol, t.lastChangePct);
  });
}

// Použitie v upsertToDB:
const cachedLastChangePct = lastChangePctMap.get(symbol);
await upsertToDB(..., cachedLastChangePct);
```

**Výsledok:**
- ✅ 1 DB query namiesto N queries (N = počet tickerov v batchi)
- ✅ Výrazne rýchlejšie počas locku
- ✅ Menej zaťaženie DB

**Súbor:** `src/workers/polygonWorker.ts:723-743, 788-789`

---

### 3. Stale lock detection - Oprava TTL výpočtu

**Problém:**
- TTL výpočet bol logicky chybný: `lockAgeSeconds = 1800 - ttl`
- Pri max TTL 1800s (30 min) nikdy neprekročí 2700s (45 min)
- Detekcia nefungovala (matematicky nemožné)

**Oprava:**
```typescript
// Lock value obsahuje createdAt timestamp (JSON)
const lockValue = JSON.stringify({ ownerId, createdAt: Date.now() });

// Worker číta createdAt a počíta skutočný vek
const lockValueStr = await redisClient.get(lockKey);
if (lockValueStr) {
  const lockValue = JSON.parse(lockValueStr);
  if (lockValue.createdAt) {
    lockAgeSeconds = Math.floor((Date.now() - lockValue.createdAt) / 1000);
  }
}

if (lockAgeSeconds > 45 * 60) {
  console.error(`❌ STALE LOCK DETECTED: lock exists for ${Math.round(lockAgeSeconds / 60)} minutes`);
}
```

**Výsledok:**
- ✅ Skutočný vek locku (nie TTL)
- ✅ Detekcia >45 min funguje správne
- ✅ Backward compatible (legacy format support)
- ✅ ERROR log ak lock > 45 minút
- ✅ StartTime tracking pre debugging
- ✅ Rýchlejšia detekcia problémov

**Súbory:**
- `src/workers/polygonWorker.ts:546-560`
- `src/app/api/cron/update-static-data/route.ts:314-318`

---

### 4. Worker invariant - percentá len keď prevClose existuje

**Problém:**
- Worker mohol počítať percentá s null referenciami

**Oprava:**
```typescript
// CRITICAL INVARIANT: Worker percentá len keď prevCloseMap existuje (z Redis alebo DB)
// Never calculate percentages with null references

if (!previousClose && !isStaticUpdateLocked) {
  // Skip normalization to avoid calculating % with null
  results.push({
    symbol,
    price: 0,
    changePct: 0,
    success: false,
    error: 'No previousClose available'
  });
  continue;
}
```

**Výsledok:**
- ✅ Worker nikdy nepočíta percentá s null referenciami
- ✅ Skip normalization ak nie je prevClose (okrem locku)

**Súbor:** `src/workers/polygonWorker.ts:779-820` (partial update)

---

### 5. Priority model dokumentovaný

**Vytvorený:** `PREVCLOSE_PRIORITY_MODEL.md`

**Definícia autority:**
1. 🥇 **saveRegularClose** → prevClose(nextTradingDay)
2. 🥈 **verify-prevclose** → prevClose(todayTradingDay)
3. 🥉 **update-static-data** → rebuild/repair

**Invarianty:**
- ✅ saveRegularClose je autorita pre D+1
- ✅ verify-prevclose neprepisuje D+1
- ✅ update-static-data nerozbíja D+1

---

### 6. saveRegularClose - session-based trigger

**Potvrdené:**
- ✅ Session-based (nie hardcoded >= 16:00)
- ✅ Podporuje early closes (half-days)
- ✅ Používa `detectSession()` state machine

**Kód:**
```typescript
// polygonWorker.ts:1165-1178
if (session === 'closed' && !isWeekendOrHoliday) {
  await saveRegularClose(apiKey, today, runId);
}
// Fallback: 16:00 ET if Redis unavailable (rare)
```

---

## 📊 Denná kontrola a fix sector/industry údajov

### verify-sector-industry (Vercel Cron)

**Status:** ✅ **PLNE AUTOMATIZOVANÝ**

**Konfigurácia:**
```json
// vercel.json
{
  "path": "/api/cron/verify-sector-industry",
  "schedule": "0 2 * * *"  // 02:00 UTC = 21:00 ET (predchádzajúci deň)
}
```

**Frekvencia:** **1x denne** (02:00 UTC)

**Čo robí:**

1. **Načíta všetky tickery** so sector/industry údajmi
   ```typescript
   const allTickers = await prisma.ticker.findMany({
     where: {
       OR: [
         { sector: { not: null } },
         { industry: { not: null } }
       ]
     },
     select: {
       symbol: true,
       name: true,
       sector: true,
       industry: true
     }
   });
   ```

2. **Validuje kombinácie** cez `validateSectorIndustry()`
   - Kontroluje, či sector/industry kombinácia je platná
   - Identifikuje neplatné kombinácie

3. **Porovnáva s knownCorrectMappings**
   - Má databázu správnych mapovaní pre známe tickery
   - Napríklad: TSM → Technology/Semiconductors, NVS → Healthcare/Drug Manufacturers

4. **Opravuje nesprávne kombinácie**
   - Ak ticker má nesprávny sector/industry, automaticky opraví
   - Normalizuje industry názvy cez `normalizeIndustry()`
   - Aktualizuje DB s correct hodnotami

5. **Loguje výsledky**
   - Počet verified tickerov
   - Počet fixed tickerov
   - Zoznam opravených tickerov

**Known Correct Mappings:**
```typescript
const knownCorrectMappings = {
  // Technology - Semiconductors
  'TSM': { sector: 'Technology', industry: 'Semiconductors' },
  'ASML': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  
  // Healthcare - Drug Manufacturers
  'NVS': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'AZN': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  // ... a ďalšie
};
```

**Incorrect Patterns:**
- Detekuje známe nesprávne kombinácie
- Automaticky opravuje podľa pattern matching

**Auto-fix:**
- ✅ Automaticky opravuje všetky nesprávne kombinácie
- ✅ Normalizuje industry názvy
- ✅ Aktualizuje DB s correct hodnotami

**Súbor:** `src/app/api/cron/verify-sector-industry/route.ts`

**Manuálne spustenie:**
```bash
# Test (GET - len reportuje, neopravuje)
curl -X GET "https://premarketprice.com/api/cron/verify-sector-industry"

# Skutočná oprava (POST - vyžaduje CRON_SECRET_KEY)
curl -X POST "https://premarketprice.com/api/cron/verify-sector-industry" \
  -H "Authorization: Bearer $CRON_SECRET_KEY"
```

**Response:**
```json
{
  "success": true,
  "message": "Sector/industry verification completed",
  "summary": {
    "totalTickers": 585,
    "verified": 580,
    "fixed": 5,
    "errors": 0
  },
  "fixedTickers": [
    {
      "ticker": "TSM",
      "current": "Technology / Semiconductors",
      "fixed": "Technology / Semiconductors"
    }
  ],
  "timestamp": "2024-01-15T02:00:00.000Z"
}
```

---

### daily-integrity-check (PM2 Cron)

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

**Frekvencia:** **1x denne** (10:00 UTC = 05:00 ET)

**Čo kontroluje:**
- ✅ `invalid_sector_industry` - Neplatná kombinácia sector/industry
- ✅ `missing_sector` - Chýbajúci sector
- ✅ `missing_industry` - Chýbajúci industry
- ✅ ... a ďalšie integrity issues (15 typov celkom)

**Auto-fix:**
- ❌ Len reportuje `invalid_sector_industry` (nie auto-fix)
- ✅ Auto-fix pre `missing_sector` a `missing_industry` (max 200 tickerov)

**Súbor:** `src/lib/jobs/dailyIntegrityCheck.ts`

---

## 📅 Kompletný harmonogram automatizovaných procesov

| Proces | Platforma | Frekvencia | Čas (UTC) | Čas (ET) | Čo robí | Auto-fix |
|--------|-----------|------------|-----------|----------|---------|----------|
| **verify-sector-industry** | Vercel | 1x denne | 02:00 | 21:00 (predch.) | Kontrola sector/industry | ✅ Áno |
| **update-static-data** | Vercel | 1x denne | 06:00 | 01:00 | Refresh prevClose, shares | ✅ Áno |
| **verify-prevclose** | Vercel | **3x denne** | 08:00, 14:00, 20:00 | 03:00, 09:00, 15:00 | Verifikácia prevClose | ✅ Áno |
| **daily-integrity-check** | PM2 | 1x denne | 10:00 | 05:00 | 15 typov integrity issues | ✅ Áno (s limitmi) |
| **Polygon Worker** | PM2 | Kontinuálne | - | - | Aktualizuje ceny, prevClose | ✅ Áno |
| **saveRegularClose** | Auto (z Worker) | Po 16:00 ET | - | 16:00 | Uloží regular close | ✅ Áno |

---

## 🔧 Kľúčové vylepšenia

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

**Oprava:**
```typescript
// PRED:
const tomorrow = new Date(dateObj);
tomorrow.setDate(tomorrow.getDate() + 1); // Calendar tomorrow ❌

// PO:
const nextTradingDay = getNextTradingDay(todayTradingDay); // Next trading day ✅
// + Invariant check: validácia, že je trading day
```

**Výsledok:**
- ✅ Weekend-safe (piatok → pondelok, nie sobota)
- ✅ Holiday-safe (preskakuje sviatky)

---

### 3. Worker počas locku - zachováva lastChangePct

**Oprava:**
```typescript
// Batch query namiesto per-ticker
const lastChangePctMap = new Map<string, number | null>();
if (isStaticUpdateLocked) {
  const tickersWithChangePct = await prisma.ticker.findMany({
    where: { symbol: { in: tickers } },
    select: { symbol: true, lastChangePct: true }
  });
  // ... populate map
}

// Použitie:
const cachedLastChangePct = lastChangePctMap.get(symbol);
await upsertToDB(..., cachedLastChangePct);
```

**Výsledok:**
- ✅ 1 DB query namiesto N queries
- ✅ Zachováva UI (percentá nezmiznú)
- ✅ Výrazne rýchlejšie

---

### 4. update-static-data - lepšie poradie operácií

**Oprava:**
```typescript
// PRED:
// 1. Delete DailyRef
// 2. Bootstrap (môže failnúť → diera)

// PO:
// 1. Bootstrap FIRST (populuje nové hodnoty)
// 2. Delete stale entries (nové už sú v DB)
```

**Výsledok:**
- ✅ Bezpečnejšie pri rate limiting/timeout
- ✅ Žiadna "diera" v dátach

---

### 5. Redis lock s owner ID a renewal

**Pridané:**
- Owner ID pre bezpečné renewal
- Auto-renewal každých 5 minút
- Safe cleanup (len ak vlastníme lock)
- Stale lock detection (>45min)

**Výsledok:**
- ✅ Bezpečnejšie race condition handling
- ✅ Rýchlejšia detekcia problémov

---

## 🧪 Edge Cases - Riešenia

### 1. ✅ Piatok → pondelok

**Riešenie:**
```typescript
const nextTradingDay = getNextTradingDay(todayTradingDay); // Pondelok, nie sobota ✅
await setPrevClose(nextTradingDateStr, symbol, regularClose);
```

### 2. ✅ Sviatok

**Riešenie:**
```typescript
const todayTradingDay = getLastTradingDay(calendarDateET); // Vráti posledný trading day ✅
// verify-prevclose neprepisuje prevClose pre sviatok
```

### 3. ✅ Lock window

**Riešenie:**
```typescript
// Zachovávame poslednú platnú hodnotu lastChangePct
if (isStaticUpdateLocked && !previousClose) {
  changePctToUse = cachedLastChangePct; // Preserve ✅
}
```

### 4. ✅ Half-days a early closes

**Riešenie:**
```typescript
// Session-based trigger, nie hardcoded čas
if (session === 'closed' && !isWeekendOrHoliday) {
  await saveRegularClose(apiKey, today, runId);
}
```

### 5. ✅ Broken tickery

**Riešenie:**
```typescript
// verify-prevclose kontroluje aj broken tickery
OR: [
  { latestPrevClose: null },
  { latestPrevClose: 0 },
  { latestPrevCloseDate: { not: yesterdayTradingDay } }
]
```

---

## 📋 Súhrn zmien

| Oprava | Súbor | Status |
|--------|-------|--------|
| **verify-prevclose zahrnúť broken tickery** | `verify-prevclose/route.ts:138-168` | ✅ Implementované |
| **Optimalizácia lastChangePct (batch query)** | `polygonWorker.ts:723-743, 788-789` | ✅ Implementované |
| **Stale lock detection** | `polygonWorker.ts:546-560` | ✅ Implementované |
| **Worker invariant (percentá len s prevClose)** | `polygonWorker.ts:739-770` | ✅ Implementované |
| **Priority model dokumentovaný** | `PREVCLOSE_PRIORITY_MODEL.md` | ✅ Implementované |
| **saveRegularClose session-based** | `polygonWorker.ts:1165-1178` | ✅ Potvrdené |

---

## ✅ Status

**Všetky opravy sú implementované a build prešiel úspešne!** 🎉

**Automatizované procesy:**
- ✅ Polygon Worker - kontinuálne aktualizuje ceny
- ✅ verify-prevclose - 3x denne verifikuje prevClose (vrátane broken tickerov)
- ✅ update-static-data - 1x denne refresh (refresh in place, lock s stale detection)
- ✅ saveRegularClose - po 16:00 ET uloží regular close (session-based)
- ✅ daily-integrity - 1x denne kontrola integrity (vrátane sector/industry)
- ✅ **verify-sector-industry - 1x denne kontrola a fix sector/industry** ✅

**Edge cases:**
- ✅ Weekend-safe (nextTradingDay)
- ✅ Holiday-safe (trading day logic)
- ✅ Lock-safe (batch query, stale detection)
- ✅ Half-days safe (session-based trigger)
- ✅ Broken tickery safe (verify-prevclose)

**Optimalizácie:**
- ✅ Batch query pre lastChangePct (1 query namiesto N)
- ✅ Stale lock detection (>45min)
- ✅ Worker invariant (percentá len s prevClose)

---

## 🔗 Súvisiace súbory

- `src/workers/polygonWorker.ts` - Polygon worker + saveRegularClose
- `src/app/api/cron/verify-prevclose/route.ts` - Verify previousClose
- `src/app/api/cron/update-static-data/route.ts` - Update static data
- `src/app/api/cron/verify-sector-industry/route.ts` - **Verify sector/industry** ✅
- `src/lib/jobs/dailyIntegrityCheck.ts` - Daily integrity check
- `PREVCLOSE_PRIORITY_MODEL.md` - Priority model dokumentácia
- `vercel.json` - Cron job konfigurácia
- `ecosystem.config.js` - PM2 konfigurácia

---

**Build:** ✅ Úspešný
**Všetky opravy:** ✅ Implementované
**Dokumentácia:** ✅ Kompletná
**Sector/Industry kontrola:** ✅ Automatizovaná
