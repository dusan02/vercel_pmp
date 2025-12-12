# 📊 Worker Performance Report - Tabuľkový Prehľad

**Dátum merania:** 2025-11-25  
**Dĺžka monitorovania:** 121.59 sekúnd (~2 minúty)  
**Prostredie:** Development (Windows)

---

## 📈 Systémové Metriky

| Komponent | Status | Hodnota | Poznámka |
|-----------|--------|---------|----------|
| **Universe Size** | ✅ | 615 tickers | Zdravá veľkosť |
| **Premium Tickers** | ✅ | 200 tickers | Aktualizované každých 60s |
| **Rest Tickers** | ✅ | 415 tickers | Aktualizované každých 5min |
| **Redis Connection** | ⚠️ | Disconnected | Používa in-memory cache |
| **Database Connection** | ✅ | Connected | SQLite operatívny |

---

## ⏱️ Worker Metriky - Refs Worker

| Metrika | Typ | Hodnota | Jednotka |
|---------|-----|---------|----------|
| **Startup Time** | Measured | 2025-11-25T15:31:38.365Z | ISO timestamp |
| **Running Duration** | Measured | 123.61 | sekundy |
| **First Cycle Duration** | Measured | 4.70 | sekundy |
| **Cycles Completed** | Measured | 50 | cykly |
| **Average Cycle Time** | Derived | ~2.47 | sekundy/cyklus |
| **Cycles per Second** | Derived | ~0.40 | cykly/s |
| **Status** | - | ✅ Optimal | - |

**Účel:** Správa universe refresh a previous close bootstrapping

---

## ⏱️ Worker Metriky - Snapshot Worker

| Metrika | Typ | Hodnota | Jednotka |
|---------|-----|---------|----------|
| **Startup Time** | Measured | 2025-11-25T15:31:40.380Z | ISO timestamp |
| **Running Duration** | Measured | 121.60 | sekundy |
| **First Cycle Duration** | Measured | 37.96 | sekundy |
| **Cycles Completed** | Measured | 3 | cykly |
| **Average Cycle Time** | Derived | 40.19 | sekundy/cyklus |
| **Batches Processed** | Measured | 4 | batchy |
| **Total Tickers Processed** | Measured | 280 | tickers |
| **Average Batch Size** | Derived | 70.0 | tickers/batch |
| **Throughput** | Derived | 7.38 | tickers/sekunda |
| **Status** | - | ✅ Optimal | - |

**Účel:** Ingestovanie real-time market dát z Polygon API

---

## 📊 Batch Breakdown - Snapshot Worker

| Batch # | Tickers | Status | Poznámka |
|---------|---------|--------|----------|
| 1 | 70 | ✅ Success | - |
| 2 | 70 | ✅ Success | - |
| 3 | 70 | ✅ Success | - |
| 4 | 69 | ⚠️ Partial | 1 failure (GBTC) |
| **Total** | **279** | **99.64%** | 1 error (0.36%) |

**Error Rate (Measured):** 0.36% (1 failure z 280 tickers)

---

## 🔧 Konfigurácia Workerov

| Parameter | Hodnota | Popis |
|-----------|---------|-------|
| **Batch Size** | 70 tickers | Počet tickerov na batch |
| **Rate Limit** | 250 req/min | Konzervatívny limit (Polygon API: 300 req/min) |
| **Delay Between Batches** | ~17s | Vypočítané na základe rate limit |
| **Check Interval (Snapshot)** | 30s | Ako často worker kontroluje aktualizácie |
| **Check Interval (Refs)** | 60s | Ako často refs worker beží |
| **Premium Update Interval** | 60s | Refresh rate pre top 200 tickers |
| **Rest Update Interval** | 5min (300s) | Refresh rate pre zvyšné tickers |

---

## 📈 Performance Porovnanie

| Metrika | Typ | Hodnota | Poznámka |
|---------|-----|---------|----------|
| **First Cycle (Measured)** | Measured | 37.96s | Spracovaných 280 tickers (4 batchy) |
| **Average Cycle (Measured)** | Measured | 40.19s | Na základe 3 cyklov |
| **Worst-Case Estimate (Full Universe)** | Estimated | ~153s | 615 tickers ÷ 70 per batch × 17s delay |
| **Tickers in Cycle** | Measured | 280 | z 615 celkovo |

**Poznámka:** 37.96s cyklus spracoval subset (280 tickers), nie full universe. Full cyklus pre všetkých 615 tickers by trval dlhšie (~153s odhad).

---

## 📊 Throughput Analýza

| Metrika | Typ | Hodnota | Jednotka |
|---------|-----|---------|----------|
| **Current Throughput** | Measured | 7.38 | tickers/sekunda |
| **Processing Time (280 tickers)** | Measured | 37.96 | sekundy |
| **Estimated Full Universe Time** | Estimated | ~83 | sekundy (bez delay) |
| **Estimated Full Universe Time (with delays)** | Estimated | ~153 | sekundy (9 batchov × 17s) |

---

## ⚠️ API Call Efficiency (ESTIMATED)

**⚠️ Poznámka:** Nasledujúce čísla sú **odhady na základe architektúry**, nie priamo namerané hodnoty.

| Typ API Call | Odhad | Poznámka |
|--------------|-------|----------|
| **Snapshot Calls** | ~4 calls | Batch endpoint vracia viacero tickers |
| **Shares Outstanding Calls** | ~280 calls | Mnohé môžu byť cachované |
| **Previous Close Calls** | ~615 calls | Refs worker, jeden na ticker |
| **Total Estimated** | ~899 calls | za 2 minúty |
| **Estimated Rate** | ~450 calls/min | - |

**Dôležité:**
- Toto sú **architektonické odhady**, nie namerané hodnoty
- Skutočné API použitie môže byť nižšie kvôli cachovaniu
- Script priamo nesleduje počet API callov
- Pre presné API metriky je potrebné instrumentovať worker kód

---

## 🎯 Záver a Odporúčania

### ✅ Silné stránky

| Aspekt | Status | Hodnota |
|--------|--------|---------|
| **Cycle Times** | ✅ Optimal | Refs: 4.70s, Snapshot: 40.19s |
| **Universe Size** | ✅ Healthy | 615 tickers |
| **Error Rate** | ✅ Low | 0.36% (1/280) |
| **Batching** | ✅ Efficient | 70-ticker batchy sú dobre veľké |
| **Prioritization** | ✅ Smart | Premium každých 60s, rest každých 5min |

### ⚠️ Oblasti na zlepšenie

| Problém | Impact | Odporúčanie |
|---------|--------|-------------|
| **Redis Disconnected** | Data sa stratia pri reštarte | Zapnúť Redis alebo Upstash |
| **GBTC Error** | 1 ticker zlyháva | Pridať fallback logiku |
| **API Monitoring** | Chýbajú presné metriky | Instrumentovať worker kód |

---

## 📋 Súhrn Metrík

| Kategória | Refs Worker | Snapshot Worker |
|-----------|-------------|-----------------|
| **First Cycle** | 4.70s | 37.96s |
| **Avg Cycle** | ~2.47s | 40.19s |
| **Cycles (2 min)** | 50 | 3 |
| **Throughput** | N/A | 7.38 tickers/s |
| **Error Rate** | N/A | 0.36% |
| **Status** | ✅ Optimal | ✅ Optimal |

---

**Report Generated:** 2025-11-25  
**Monitoring Tool:** `scripts/comprehensive-worker-report.ts`  
**Duration:** 121.59 seconds

