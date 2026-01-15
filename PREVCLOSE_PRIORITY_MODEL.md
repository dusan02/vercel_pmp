# 📋 Priority Model pre previousClose - Source of Truth

## Definícia autority (Source of Truth)

Tento dokument definuje **priority model** pre `previousClose` hodnoty, aby sa zabránilo konfliktom medzi rôznymi procesmi.

---

## Priority poradie (od najvyššej k najnižšej)

### 1. 🥇 **saveRegularClose** - Autorita pre `prevClose(nextTradingDay)`

**Kedy beží:** Po ukončení trading session (16:00 ET, alebo skoršie ak je early close)

**Čo robí:**
- Uloží `regularClose` pre dnešný trading day (D)
- **AUTORITA** pre `prevClose(nextTradingDay)` (D+1)
- Aktualizuje Redis: `prevClose(nextTradingDateStr) = close(todayTradingDay)`
- Aktualizuje `DailyRef(nextTradingDay).previousClose`
- Aktualizuje `Ticker.latestPrevClose` a `latestPrevCloseDate`

**Trigger:**
- **Session-based**, nie hardcoded čas
- Spúšťa sa keď `session === 'closed'` a nie je weekend/holiday
- Podporuje early closes (half-days) cez `detectSession()` state machine

**Invariant:**
- `prevClose(nextTradingDay)` pripravený zo `saveRegularClose` **NIKDY** nesmie byť prepísaný iným procesom
- verify-prevclose a update-static-data musia respektovať túto autoritu

---

### 2. 🥈 **verify-prevclose** - Autorita pre `prevClose(todayTradingDay)`

**Kedy beží:** 3x denne (08:00, 14:00, 20:00 UTC)

**Čo robí:**
- **AUTORITA** pre `prevClose(todayTradingDay)` (D)
- Opravuje nesprávne hodnoty porovnaním s Polygon API
- Kontroluje aj tickery s `prevClose = null/0` alebo stale date

**Invariant:**
- **NEPREPISUJE** `prevClose(nextTradingDay)` pripravený zo `saveRegularClose`
- Opravuje len `prevClose(todayTradingDay)` = close(yesterdayTradingDay)

---

### 3. 🥉 **update-static-data** - Rebuild/Repair mechanizmus

**Kedy beží:** 1x denne (06:00 UTC = 01:00 ET)

**Čo robí:**
- **Rebuild/repair** mechanizmus pre missing alebo broken hodnoty
- Bootstrap previous closes z Polygon API
- Refresh DailyRef (vymaže len stale entries)

**Invariant:**
- **NESMIE rozbiť** `prevClose(nextTradingDay)` pripravený zo `saveRegularClose`
- Lock drží počas celého bootstrapu (worker zachováva lastChangePct)
- Bootstrap PRED delete (nové hodnoty v DB pred mazaním)

---

## Konkrétne pravidlá

### Pravidlo 1: saveRegularClose je autorita pre D+1

```typescript
// saveRegularClose (večer po close):
// - Redis: prevClose(nextTradingDay) = close(todayTradingDay) ✅
// - DailyRef(nextTradingDay).previousClose = close(todayTradingDay) ✅

// verify-prevclose (ráno):
// - NEPREPISUJE prevClose(nextTradingDay) ✅
// - Opravuje len prevClose(todayTradingDay) ✅

// update-static-data (ráno):
// - NEPREPISUJE prevClose(nextTradingDay) ✅
// - Bootstrap populuje nové hodnoty, ale respektuje existujúce ✅
```

### Pravidlo 2: verify-prevclose opravuje aj broken tickery

```typescript
// verify-prevclose kontroluje:
// 1. Tickers s prevClose > 0 (normal case)
// 2. Tickers s lastPrice > 0 ale prevClose = null/0 alebo stale date (broken case) ✅
```

### Pravidlo 3: update-static-data lock drží počas bootstrapu

```typescript
// update-static-data:
// 1. Acquire lock (s owner ID a startTime)
// 2. Clear Redis cache
// 3. Bootstrap (populuje nové hodnoty) - LOCK DRŽÍ ✅
// 4. Refresh DailyRef (delete stale) - LOCK DRŽÍ ✅
// 5. Release lock

// Worker počas locku:
// - Zachováva lastChangePct ak nie je prevClose ✅
// - Batch query namiesto per-ticker (optimalizácia) ✅
```

### Pravidlo 4: Worker percentá len keď prevClose existuje

```typescript
// CRITICAL INVARIANT: Worker percentá len keď prevCloseMap existuje (z Redis alebo DB)
// Never calculate percentages with null references

if (!previousClose && !isStaticUpdateLocked) {
  // Skip normalization to avoid calculating % with null
  continue;
}
```

---

## Edge Cases

### Half-days a early closes

**saveRegularClose trigger:**
- ✅ **Session-based**, nie hardcoded čas
- ✅ Používa `detectSession()` state machine
- ✅ Podporuje early closes (napr. pred Thanksgiving)

**Kód:**
```typescript
// polygonWorker.ts
const session = detectSession(now);
if (session === 'closed' && !isWeekendOrHoliday) {
  // Trigger saveRegularClose (nie hardcoded >= 16:00)
  await saveRegularClose(apiKey, today, runId);
}
```

### Stale lock detection

**Pridané:**
- ✅ Lock age tracking (TTL check)
- ✅ ERROR log ak lock > 45 minút
- ✅ StartTime logging v update-static-data

**Kód:**
```typescript
// polygonWorker.ts
if (isStaticUpdateLocked) {
  const ttl = await redisClient.ttl(lockKey);
  const lockAgeSeconds = ttl > 0 ? (1800 - ttl) : 0;
  
  if (lockAgeSeconds > 45 * 60) {
    console.error(`❌ STALE LOCK DETECTED: lock exists for ${Math.round(lockAgeSeconds / 60)} minutes`);
  }
}
```

---

## Acceptance Checklist

### 1. Piatok po close → pondelok premarket

- ✅ Existuje `Redis prevClose(pondelok)`?
- ✅ `DailyRef(pondelok).previousClose` sedí na close piatku?
- ✅ `saveRegularClose` používa `getNextTradingDay()` (weekend-safe)

### 2. Ráno po update-static-data

- ✅ Počas locku: `lastPrice` sa mení, `lastChangePct` sa nemení (alebo je flagged)
- ✅ Po unlocku: do 1–2 batchov sa percentá dorovnajú
- ✅ Lock drží počas celého bootstrapu

### 3. Sviatok

- ✅ `todayTradingDay` != calendarDateET
- ✅ Worker aj verify-prevclose používajú trading day, nie calendar
- ✅ `saveRegularClose` nespúšťa sa na sviatok

### 4. Half-days

- ✅ `saveRegularClose` triggeruje sa podľa session state, nie hardcoded čas
- ✅ `detectSession()` podporuje early closes

---

## Súhrn

**Priority model:**
1. 🥇 saveRegularClose → prevClose(nextTradingDay)
2. 🥈 verify-prevclose → prevClose(todayTradingDay)
3. 🥉 update-static-data → rebuild/repair

**Invarianty:**
- ✅ saveRegularClose je autorita pre D+1
- ✅ verify-prevclose neprepisuje D+1
- ✅ update-static-data nerozbíja D+1
- ✅ Worker percentá len keď prevClose existuje

**Edge cases:**
- ✅ Half-days (session-based trigger)
- ✅ Stale lock detection (>45min)
- ✅ Broken tickery (verify-prevclose kontroluje aj null/0)

---

**Status:** ✅ Implementované a dokumentované
