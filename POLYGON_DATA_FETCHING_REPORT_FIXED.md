# 📊 Podrobný Report: Doťahovanie dát z Polygon API (OPRAVENÝ)

## ⚠️ KRITICKÉ OPRAVY V TOMTO REPORTE

Tento report opravuje logické chyby a riziká identifikované v pôvodnom reporte.

---

## 🎯 Prehľad

Systém používa **3 hlavné procesy** pre doťahovanie dát z Polygon API:
1. **Polygon Worker** (`pmp-polygon-worker`) - kontinuálne aktualizácie cien
2. **Bulk Preloader** (`pmp-bulk-preloader`) - hromadné načítanie dát
3. **Cron Jobs** - denné aktualizácie statických dát

---

## 1️⃣ Polygon Worker (`pmp-polygon-worker`)

### **Režimy:**
- **`snapshot`** (default) - kontinuálne doťahovanie snapshot dát
- **`refs`** - denné referenčné úlohy (previous close, regular close)

### **Intervaly aktualizácií:**

#### **Live Trading (09:30-16:00 ET):**
- **Premium tickers (top 200):** každých **60 sekúnd**
- **Ostatné tickers:** každých **5 minút**
- **Check interval:** každých **60 sekúnd**

#### **Pre-market (04:00-09:30 ET):**
- **Všetky tickers:** každých **5 minút**
- **Check interval:** každých **60 sekúnd**

#### **After-hours (16:00-20:00 ET):**
- **Všetky tickers:** každých **5 minút**
- **Check interval:** každých **60 sekúnd**

#### **Overnight (20:00-04:00 ET):**
- **Pauza:** Worker **NEBEŽÍ** (frozen state)
- **canIngest: false** - žiadne nové dáta
- **canOverwrite: false** - nemôže prepisovať zmrazené ceny

#### **Víkend/Holiday:**
- **Worker BEŽÍ** (v snapshot móde), ale **NEBEŽÍ** normálny ingest
- **canIngest: false** - žiadne nové dáta
- **canOverwrite: false** - nemôže prepisovať zmrazené ceny
- **Bootstrap:** Ak chýbajú previous closes, worker ich doťahuje (on-demand)

### **Batch Processing:**
- **Batch size:** 60-70 tickerov na request
- **Rate limit:** 250 requests/min (Polygon API limit: 300 req/min)
- **Delay medzi batchmi:** ~17 sekúnd
- **Prioritizácia:** Premium tickers (top 200) sa spracúvajú prvé

### **Načasované úlohy (režim `refs`):**

#### **03:30 ET - Refresh Universe**
- Aktualizuje zoznam tickerov v Redis (`universe:sp500`)
- Pridáva nové tickers z `getAllProjectTickers('pmp')`

#### **04:00 ET - Bootstrap Previous Closes**
- Doťahuje previous close prices pre všetky tickers
- **Lookback:** 1-3 dni späť (⚠️ **RIZIKO:** môže byť málo pri dlhších sviatkoch)
- Ukladá do Redis (`prevClose:YYYY-MM-DD:symbol`)
- Ukladá do DB (`DailyRef` tabuľka)
- **Fallback:** Ak chýbajú previous closes kedykoľvek pred 16:00 ET, doťahuje ich

#### **16:00 ET - Save Regular Close** ⚠️ **RIZIKO: Hardcoded**
- Ukladá regular close prices (16:00 ET close) do DB
- ⚠️ **PROBLÉM:** Hardcoded 16:00 ET, neberie do úvahy early closes
- Ukladá do `DailyRef.regularClose`
- Používa sa pre after-hours % change výpočty

### **On-demand Previous Close:**
- **Čiastočne implementované:** V `ingestBatch()` (riadok 482-491)
- Ak chýbajú previous closes, doťahuje ich pre max 50 tickerov
- ⚠️ **CHÝBA:** Nie je implementované v API endpointoch (heatmap, stocks, atď.)

---

## 2️⃣ Bulk Preloader (`pmp-bulk-preloader`)

### **Načasovanie:** ⚠️ **KRITICKÝ DST PROBLÉM**
- **Cron schedule:** `*/5 13-20 * * 1-5` (PM2 cron)
  - **13-20 UTC** = **08:00-15:00 ET** (v zime)
  - **13-20 UTC** = **09:00-16:00 ET** (v lete - DST!)
  - ⚠️ **PROBLÉM:** Hardcoded UTC, posúva sa o hodinu pri DST
  - **Len v pracovné dni** (1-5 = Monday-Friday)

### **Funkcia:**
- Načíta dáta pre **500-600 firiem** (SP500 + zahraničné)
- Uloží do **Redis cache** pre okamžité načítanie
- **Batch size:** 50 tickerov
- **Rate limiting:** 60 sekúnd medzi batchmi (Polygon free tier: 5 calls/min)

### **Kedy beží:**
- ✅ **Pre-market (08:00-09:30 ET)** - v zime
- ✅ **Pre-market (09:00-09:30 ET)** - v lete (DST problém!)
- ✅ **Live trading (09:30-15:00 ET)** - v zime
- ✅ **Live trading (09:30-16:00 ET)** - v lete (DST problém!)
- ❌ **After-hours (15:00+ ET)** - nebeží
- ❌ **Víkend/Holiday** - nebeží

---

## 3️⃣ Cron Jobs

### **Update Static Data** (`/api/cron/update-static-data`)

#### **Kedy sa spúšťa:**
- **Manuálne** alebo cez externý cron scheduler
- **Odporúčaný čas:** 06:00 ET (pred otvorením trhu)

#### **Čo aktualizuje:**
1. **Shares Outstanding** - počet akcií v obehu
2. **Previous Close** - predchádzajúca uzatváracia cena

#### **Ako funguje:**
- Spracúva **50 tickerov naraz**
- **Concurrency limit:** 10 paralelných API volaní
- **Delay medzi batchmi:** 200ms
- **Delay medzi concurrent batchmi:** 100ms

---

## 🔄 Reset a Aktualizácia dát v DB

### **Previous Close Reset:**

#### **Kedy sa resetuje:**
- **04:00 ET** - Bootstrap previous closes (denná úloha)
- **Kedykoľvek pred 16:00 ET** - Ak chýbajú previous closes (fallback)
- **Víkend/Holiday** - Ak chýbajú previous closes (on-demand v workeri)

#### **Ako sa resetuje:**
1. Worker doťahuje previous close z Polygon API (aggs endpoint)
2. **Lookback:** 1-3 dni späť ⚠️ **RIZIKO:** môže byť málo pri dlhších sviatkoch
3. Ukladá do Redis (`prevClose:YYYY-MM-DD:symbol`)
4. Ukladá do DB (`DailyRef` tabuľka s dátumom trading dňa)
5. Denormalizuje do `Ticker.latestPrevClose`

#### **⚠️ RIZIKÁ:**
- **1-3 dni lookback** môže byť málo pri dlhších sviatkoch (napr. Thanksgiving week)
- **Chýbajúci on-demand fetch** v API endpointoch (len v ingestBatch)

### **Regular Close Reset:**

#### **Kedy sa resetuje:**
- **16:00 ET** - Automaticky po uzavretí trhu ⚠️ **RIZIKO: Hardcoded**
- ⚠️ **PROBLÉM:** Neberie do úvahy early closes (napr. pred sviatkami)
- ⚠️ **PROBLÉM:** Neberie do úvahy special trading sessions

#### **Ako sa resetuje:**
1. Worker doťahuje snapshot pre všetky tickers
2. Extrahuje `day.c` (regular session close)
3. Ukladá do `DailyRef.regularClose`
4. Používa sa pre after-hours % change výpočty

#### **⚠️ RIZIKÁ:**
- **Hardcoded 16:00 ET** - neplatí vždy (early closes)
- **Missing trading calendar** - nevie o special sessions

---

## 📅 Denný cyklus (Pracovný deň)

### **04:00 ET - Bootstrap**
- ✅ Refresh universe (03:30 ET)
- ✅ Bootstrap previous closes (04:00 ET)
- ✅ Worker začína doťahovať pre-market dáta (každých 5min)

### **08:00-09:30 ET - Pre-market** ⚠️ **DST PROBLÉM**
- ✅ Bulk preloader beží (každých 5min) - **v zime**
- ⚠️ Bulk preloader beží (každých 5min) - **v lete začína o 09:00 ET** (DST!)
- ✅ Polygon worker beží (každých 5min pre všetky tickers)
- ✅ Dáta sa aktualizujú kontinuálne

### **09:30-16:00 ET - Live Trading** ⚠️ **DST PROBLÉM**
- ✅ Bulk preloader beží (každých 5min) - **v zime do 15:00 ET**
- ⚠️ Bulk preloader beží (každých 5min) - **v lete do 16:00 ET** (DST!)
- ✅ Polygon worker beží:
  - Premium tickers (top 200): každých 60s
  - Ostatné tickers: každých 5min
- ✅ Dáta sa aktualizujú kontinuálne

### **16:00 ET - Market Close** ⚠️ **HARDCODED**
- ✅ Save regular close (16:00 ET) - ⚠️ **neplatí vždy** (early closes)
- ✅ Switch to after-hours mode
- ✅ Worker pokračuje (každých 5min)

### **16:00-20:00 ET - After-hours**
- ❌ Bulk preloader **NEBEŽÍ**
- ✅ Polygon worker beží (každých 5min)
- ✅ Dáta sa aktualizujú kontinuálne

### **20:00-04:00 ET - Overnight**
- ❌ Bulk preloader **NEBEŽÍ**
- ❌ Polygon worker **NEBEŽÍ** (frozen state)
- ✅ Dáta sú zmrazené (frozen), žiadne aktualizácie

---

## 📅 Víkend/Holiday

### **Sobota/Nedeľa/Holiday:**
- ❌ Bulk preloader **NEBEŽÍ**
- ✅ Polygon worker **BEŽÍ** (v snapshot móde), ale **NEBEŽÍ** normálny ingest
- ✅ **Bootstrap previous closes** - ak chýbajú, worker ich doťahuje (on-demand)
- ✅ Dáta sú zmrazené (frozen), žiadne aktualizácie

---

## ⚠️ IDENTIFIKOVANÉ PROBLÉMY A RIEŠENIA

### **1. DST Problém s Bulk Preloader Cron**

**Problém:**
- PM2 cron používa UTC: `*/5 13-20 * * 1-5`
- V zime: 13-20 UTC = 08:00-15:00 ET ✅
- V lete: 13-20 UTC = 09:00-16:00 ET ❌ (posun o hodinu)

**Riešenie:**
```javascript
// Namiesto hardcoded UTC, použiť ET-aware scheduling
// Možnosti:
// 1. PM2 cron s ET timezone (ak PM2 podporuje)
// 2. Interný scheduler v workeri (check ET time)
// 3. Externý cron scheduler (cron.d, systemd timer) s ET timezone
```

**Odporúčanie:**
- Presunúť bulk preloader do interného schedulera v workeri
- Alebo použiť externý cron s `TZ=America/New_York`

---

### **2. Weekend Bootstrap - Rozpor v Reporte**

**Oprava:**
- Worker **BEŽÍ** aj cez víkend (v snapshot móde)
- **NEBEŽÍ** normálny ingest (canIngest: false)
- **BEŽÍ** bootstrap previous closes (ak chýbajú)

**Aktuálna implementácia:**
```typescript
// polygonWorker.ts, riadok 912-924
if (session === 'closed' && isWeekendOrHoliday) {
  // True closed day (weekend/holiday) - only bootstrap previous closes if missing
  const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 10));
  
  if (samplePrevCloses.size === 0) {
    console.log(`⏸️ Weekend/Holiday, bootstrapping previous closes...`);
    await bootstrapPreviousCloses(tickers, apiKey, today);
  }
  return; // Skip normal ingest
}
```

**Verdikt:** ✅ **Funguje správne**, worker beží aj cez víkend a robí bootstrap.

---

### **3. Hardcoded 16:00 ET pre Regular Close**

**Problém:**
- Regular close sa ukladá o 16:00 ET (hardcoded)
- Neberie do úvahy early closes (pred sviatkami)
- Neberie do úvahy special trading sessions

**Riešenie:**
```typescript
// Namiesto hardcoded 16:00 ET, použiť:
// 1. Trading calendar (NYSE calendar API)
// 2. Detekcia skutočného close z Polygon API
// 3. Fallback na 16:00 ET ak nie je early close
```

**Odporúčanie:**
- Použiť `getLastTradingDay()` a detekovať skutočný close z Polygon API
- Alebo použiť trading calendar API pre early closes

---

### **4. 1-3 dni Lookback môže byť málo**

**Problém:**
- Bootstrap previous closes hľadá len 1-3 dni späť
- Pri dlhších sviatkoch (napr. Thanksgiving week) môže byť málo

**Aktuálna implementácia:**
```typescript
// polygonWorker.ts, riadok 753
for (let i = 1; i <= 3; i++) {
  // Look back up to 3 days
}
```

**Riešenie:**
```typescript
// Rozšíriť na 10 dní alebo dynamicky pomocou getLastTradingDay()
const maxLookback = 10; // days
for (let i = 1; i <= maxLookback; i++) {
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - i);
  // Check if it's a trading day using getLastTradingDay()
  // If trading day found, break
}
```

---

### **5. Chýbajúci On-demand Previous Close v API**

**Problém:**
- On-demand prevClose fetch je len v `ingestBatch()` (worker)
- **CHÝBA** v API endpointoch (heatmap, stocks, atď.)
- Ak chýba prevClose v API, vráti 0% change namiesto doťahnutia

**Aktuálna implementácia:**
```typescript
// polygonWorker.ts, riadok 482-491
const missingPrevClose = tickers.filter(t => !prevCloseMap.has(t));
if (missingPrevClose.length > 0) {
  // Doťahuje len v workeri, nie v API
  await bootstrapPreviousCloses(toFetch, apiKey, today);
}
```

**Riešenie:**
- Pridať on-demand prevClose fetch do API endpointov
- Rate limitovať (max 10-20 tickerov na request)
- Cache výsledky v Redis

---

### **6. Chýbajúce Freshness Metriky**

**Problém:**
- Nie sú metriky pre čerstvosť dát
- Nie je viditeľné, koľko tickerov má čerstvé dáta

**Riešenie:**
- Pridať metriky: `now - lastPriceUpdated` per symbol
- Dashboard: % tickerov čerstvých < 2 min, < 5 min, < 15 min
- Alerting pri nízkych hodnotách

---

## 🔧 ODORÚČANÉ OPRAVY

### **Priorita 1 (Kritické):**

1. **Opraviť DST problém s bulk preloader:**
   - Presunúť do interného schedulera v workeri
   - Alebo použiť externý cron s `TZ=America/New_York`

2. **Rozšíriť lookback pre previous closes:**
   - Zmeniť z 3 na 10 dní
   - Použiť `getLastTradingDay()` pre dynamické hľadanie

3. **Pridať on-demand prevClose do API:**
   - Implementovať v `/api/heatmap`, `/api/stocks`, atď.
   - Rate limitovať (max 20 tickerov na request)

### **Priorita 2 (Dôležité):**

4. **Trading calendar aware regular close:**
   - Detekovať early closes z Polygon API
   - Použiť trading calendar pre special sessions

5. **Freshness metriky:**
   - Pridať metriky pre čerstvosť dát
   - Dashboard pre monitoring

### **Priorita 3 (Vylepšenia):**

6. **Startup warmup po 04:00 ET:**
   - 1-2 rýchle prebehnutia premium tickerov
   - Retry/backoff pri prvom fail-e

7. **Rozšíriť preloader okno:**
   - Začať už o 04:00 ET (ak máš kapacitu)
   - Alebo aspoň "ranný warm cache" pre top 200

---

## 📊 Shrnutie intervalov (OPRAVENÉ)

| Čas (ET) | Worker | Bulk Preloader | Interval (Premium) | Interval (Ostatné) | Poznámky |
|----------|--------|----------------|-------------------|-------------------|----------|
| 04:00-08:00 | ✅ | ❌ | 5 min | 5 min | Preloader začína až o 08:00 ET (v zime) |
| 08:00-09:30 | ✅ | ✅ (zima) / ⚠️ (DST) | 5 min | 5 min | DST problém v lete |
| 09:30-16:00 | ✅ | ✅ (zima) / ⚠️ (DST) | 60s | 5 min | DST problém v lete |
| 16:00-20:00 | ✅ | ❌ | 5 min | 5 min | Hardcoded 16:00 ET close |
| 20:00-04:00 | ❌ | ❌ | - | - | Frozen state |
| Weekend/Holiday | ✅ (bootstrap) | ❌ | - | - | Worker beží, robí bootstrap |

---

## 🔍 Kde reálne hrozí, že sa previous close nedotiahne?

### **Scenáre:**

1. **DST posun** → bulk preloader beží inokedy → cache môže byť starší
2. **Holiday / long weekend** → "1-3 dni späť" nestačí → prevClose missing
3. **Worker nejde** (PM2/redeploy) práve okolo 04:00 ET → prevClose sa nestihne pripraviť
4. **Ticker mimo universe** → nemá prevClose key/record → chýba v API
5. **API endpoint bez on-demand fetch** → ak chýba prevClose, vráti 0% change

### **Riešenia:**

1. ✅ **DST-safe scheduling** (priorita 1)
2. ✅ **Rozšíriť lookback na 10 dní** (priorita 1)
3. ✅ **On-demand prevClose v API** (priorita 1)
4. ✅ **Retry/backoff pri bootstrap** (priorita 3)
5. ✅ **Guard v API endpointoch** (priorita 1)

---

## 📝 ZÁVER

**Jadro systému je navrhnuté rozumne:**
- ✅ State machine chráni kvalitu dát
- ✅ Frozen state zabraňuje prepisom
- ✅ Session-aware percent change výpočty

**Najväčšie logické slabiny:**
1. ⚠️ **DST problém** s bulk preloader cron
2. ⚠️ **Hardcoded 16:00 ET** pre regular close
3. ⚠️ **1-3 dni lookback** môže byť málo
4. ⚠️ **Chýbajúci on-demand prevClose** v API endpointoch

**Odporúčania:**
- Opraviť DST problém (priorita 1)
- Rozšíriť lookback na 10 dní (priorita 1)
- Pridať on-demand prevClose do API (priorita 1)
- Trading calendar aware regular close (priorita 2)

