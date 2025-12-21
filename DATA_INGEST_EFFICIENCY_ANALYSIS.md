# 📊 Analýza efektívnosti načítavania dát

## 🔍 Prehľad

Tento dokument analyzuje efektívnosť načítavania dát v aplikácii, vrátane cron jobs, workers a API volaní.

## 📅 Cron Jobs - Frekvencia a efektívnosť

### 1. **Verify Sector/Industry**
- **Schedule:** `0 2 * * *` (02:00 UTC, raz denne)
- **Vercel Cron:** ✅ Definované v `vercel.json`
- **Lokálny Scheduler:** ✅ Beží v `server.ts` (denne o 02:00 UTC)
- **Problém:** ⚠️ **DUPLIKÁCIA** - Beží na dvoch miestach!
  - Vercel cron: `/api/cron/verify-sector-industry`
  - Lokálny scheduler: `sectorIndustryScheduler.ts`
- **Efektívnosť:** ⚠️ Môže bežať dvakrát (ak bežia oba)
- **Odporúčanie:** Použiť iba jeden (Vercel cron pre produkciu, lokálny pre dev)

### 2. **Update Static Data**
- **Schedule:** `0 6 * * *` (06:00 UTC, raz denne)
- **Vercel Cron:** ✅ Definované v `vercel.json`
- **Efektívnosť:** ✅ OK - beží iba raz denne
- **Batch Size:** 50 tickerov
- **Concurrency:** 5 paralelných requestov
- **Odporúčanie:** ✅ Optimálne

### 3. **Earnings Calendar**
- **Schedule:** Manuálne alebo cez scheduler
- **Efektívnosť:** ✅ OK - beží podľa potreby

## 🔄 Workers - Frekvencia a efektívnosť

### 1. **Polygon Worker (Snapshot Mode)**

#### **Check Interval:**
- **Aktuálne:** `setInterval(ingestLoop, 30000)` - **30 sekúnd**
- **Problém:** ⚠️ Príliš častý check interval
- **Dôvod:** Worker kontroluje každých 30s, ale tickery sa aktualizujú každých 60s (premium) alebo 5min (ostatné)
- **Odporúčanie:** Znížiť na **60 sekúnd** (1 minúta)

#### **Update Intervals:**
- **Premium tickery (top 200):** 60 sekúnd ✅
- **Ostatné tickery:** 5 minút ✅
- **Pre-market/After-hours:** 5 minút pre všetky ✅
- **Efektívnosť:** ✅ OK - rozumné intervaly

#### **Batch Processing:**
- **Batch Size:** 70 tickerov ✅
- **Delay medzi batchmi:** ~17 sekúnd ✅
- **Rate Limit:** 250 req/min (Polygon limit: 300 req/min) ✅
- **Efektívnosť:** ✅ OK - správne nastavené pre rate limit

#### **Weekend/Holiday Handling:**
- **Aktuálne:** Preskakuje ingest (iba bootstrap previous closes)
- **Efektívnosť:** ✅ OK - šetrí API volania

### 2. **Refs Worker**
- **Check Interval:** 60 sekúnd (každú minútu)
- **Úlohy:**
  - 03:30 ET: Refresh universe
  - 04:00 ET: Bootstrap previous closes
  - 16:00 ET: Save regular close
- **Efektívnosť:** ✅ OK - beží len keď je potrebné

### 3. **Bulk Preloader**
- **Schedule:** `*/5 13-20 * * 1-5` (každých 5 min, 13:00-20:00 UTC, Mon-Fri)
- **Efektívnosť:** ✅ OK - beží len počas trading hours

## 📊 Analýza API volaní

### **Polygon API:**
- **Rate Limit:** 5 req/s = 300 req/min
- **Používame:** 250 req/min (konzervatívne)
- **Batch Size:** 70 tickerov
- **Requests per batch:** 1 request
- **Batches per minute:** ~14 batchov (250 req/min)
- **Tickerov za minútu:** ~980 tickerov (14 × 70)
- **Celý universe (503 tickerov):** ~1 batch = ~17 sekúnd
- **Efektívnosť:** ✅ OK - správne využitie rate limitu

### **Redundancie a duplikácie:**
1. ⚠️ **Sector/Industry Scheduler:** Duplikácia (Vercel cron + lokálny scheduler)
2. ✅ **Worker Check Interval:** Možno znížiť z 30s na 60s
3. ✅ **Batch Processing:** Optimálne nastavené

## 🔧 Odporúčania pre optimalizáciu

### 1. **Znížiť Worker Check Interval**
```typescript
// Aktuálne:
setInterval(ingestLoop, 30000); // 30s

// Odporúčané:
setInterval(ingestLoop, 60000); // 60s
```
**Dôvod:** Tickers sa aktualizujú každých 60s (premium) alebo 5min (ostatné), takže check každých 30s je zbytočný.

### 2. **Odstrániť duplikáciu Sector/Industry Scheduler**
- **Možnosť A:** Použiť iba Vercel cron (pre produkciu)
- **Možnosť B:** Použiť iba lokálny scheduler (pre dev)
- **Odporúčanie:** Použiť iba Vercel cron pre produkciu, lokálny scheduler pre dev

### 3. **Optimalizovať Weekend/Holiday Handling**
- **Aktuálne:** Preskakuje ingest (iba bootstrap)
- **Odporúčanie:** ✅ OK - šetrí API volania

### 4. **Pridať monitoring pre detekciu zbytočných volaní**
- Track API volania
- Alert ak rate limit blízko
- Monitor duplikácie

## 📈 Metriky efektívnosti

### **Aktuálne:**
- **Cron Jobs:** 2-3x denne (OK)
- **Worker Check:** Každých 30s (možno znížiť)
- **Premium Updates:** Každých 60s (OK)
- **Rest Updates:** Každých 5min (OK)
- **API Utilization:** ~83% (250/300 req/min) (OK)

### **Po optimalizácii:**
- **Cron Jobs:** 2x denne (bez duplikácie)
- **Worker Check:** Každých 60s (optimalizované)
- **Premium Updates:** Každých 60s (nezmenené)
- **Rest Updates:** Každých 5min (nezmenené)
- **API Utilization:** ~83% (nezmenené)

## ✅ Záver

### **Pozitíva:**
1. ✅ Batch processing je optimálne nastavený
2. ✅ Rate limiting je správne implementovaný
3. ✅ Update intervaly sú rozumné
4. ✅ Weekend/holiday handling šetrí API volania

### **Problémy:**
1. ⚠️ **Duplikácia:** Sector/Industry scheduler beží na dvoch miestach
2. ⚠️ **Worker Check Interval:** Príliš častý (30s vs 60s update interval)

### **Celkové hodnotenie:**
**Efektívnosť: 8/10** - Dobré, ale možno optimalizovať:
- Odstrániť duplikáciu scheduleru
- Znížiť worker check interval na 60s

