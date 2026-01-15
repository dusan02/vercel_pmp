# ✅ Finálne opravy - Súhrn zmien

## 1. ✅ Opravená semantika prevClose (Model A)

### Definícia Modelu A:
- `prevCloseKey(date)` = **previousClose pre tento trading day**
- Teda `prevCloseKey(D)` = close(D-1)

### Opravy:

#### saveRegularClose():
- ✅ **DailyRef(D+1).previousClose = close(D)** - správne
- ✅ **Redis prevClose(D+1) = close(D)** - opravené (predtým používalo D)

#### Worker ingestBatch():
- ✅ Používa `todayTradingDateStr` (D) namiesto `tradingDateStr` (D-1)
- ✅ Číta `prevClose(D)` = close(D-1) ✅

#### verify-prevclose:
- ✅ Používa `todayTradingDateStr` (D) pre Redis cache
- ✅ Loguje kontext: calendarET, tradingDayET, isTradingDay, session

---

## 2. ✅ Zjednotené názvoslovie

### Predtým (zmätočné):
- `today`, `dateET`, `etDate`, `tradingDateStr`

### Teraz (jasné):
- `calendarDateETStr` - calendar date v ET (YYYY-MM-DD)
- `calendarDateET` - Date objekt pre calendar date
- `todayTradingDay` - trading day (Date objekt)
- `todayTradingDateStr` - trading date string (YYYY-MM-DD)

### Poznámka:
- `getDateET()` vracia **calendar date**, nie trading date!
- Vždy explicitne rozlišujeme calendar vs trading date

---

## 3. ✅ Zmäkčený update-static-data

### Predtým:
- Resetoval `latestPrevClose` na `null` → "okno chaosu"
- Worker rátal percentá s `null` referenciami

### Teraz:
- ✅ **Refresh in place** - nerestuje na null
- ✅ **Redis lock** s owner ID a renewal
- ✅ **Striktné mazanie** - len todayTradingDay a yesterdayTradingDay
- ✅ Worker kontroluje lock a loguje, ale stále normalizuje (len bez prevClose vráti null)

---

## 4. ✅ Vylepšený lock mechanizmus

### Predtým:
- Jednoduchý lock bez owner ID
- Worker úplne skipoval normalization

### Teraz:
- ✅ **Owner ID** - bezpečné renewal a cleanup
- ✅ **Auto-renewal** každých 5 minút
- ✅ **Worker stále normalizuje** - len bez prevClose vráti null (očakávané)
- ✅ **Logovanie** - jasné, čo sa deje počas locku

---

## 5. ✅ Opravené Redis kľúče

### saveRegularClose:
- ✅ Redis: `prevClose(D+1) = close(D)` (Model A)

### verify-prevclose:
- ✅ Redis: `prevClose(todayTradingDateStr) = close(yesterdayTradingDay)` (Model A)

### Worker:
- ✅ Číta: `prevClose(todayTradingDateStr)` (Model A)

---

## 📊 Súhrn zmien

| Súbor | Zmena | Dôvod |
|-------|-------|-------|
| `polygonWorker.ts` | `saveRegularClose`: Redis používa D+1 | Model A konzistencia |
| `polygonWorker.ts` | `ingestBatch`: používa `todayTradingDateStr` | Správny trading date lookup |
| `polygonWorker.ts` | Zjednotené názvoslovie | Jasnosť calendar vs trading date |
| `verify-prevclose/route.ts` | Používa `todayTradingDateStr` | Model A konzistencia |
| `verify-prevclose/route.ts` | Loguje kontext | Debugging |
| `update-static-data/route.ts` | Refresh in place | Žiadne "okno chaosu" |
| `update-static-data/route.ts` | Redis lock s owner ID | Bezpečné renewal |
| `update-static-data/route.ts` | Striktné mazanie DailyRef | Ochrana histórie |

---

## 🧪 Testovanie

### Checklist:
1. ✅ `saveRegularClose` ukladá Redis pod D+1
2. ✅ Worker číta z `todayTradingDateStr` (D)
3. ✅ `verify-prevclose` loguje kontext
4. ✅ `update-static-data` nerestuje na null
5. ✅ Lock má owner ID a renewal

---

## 📝 Poznámky

- **Model A je teraz konzistentný** vo všetkých systémoch
- **Názvoslovie je jasné** - calendar vs trading date
- **Lock mechanizmus je bezpečný** - owner ID, renewal, cleanup
- **Žiadne "okno chaosu"** - refresh in place namiesto resetu
