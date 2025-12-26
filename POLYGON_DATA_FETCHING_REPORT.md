# 📊 Podrobný Report: Doťahovanie dát z Polygon API

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
- **Pauza:** Worker **NEBEŽÍ** (frozen state)
- **canIngest: false** - žiadne nové dáta
- **canOverwrite: false** - nemôže prepisovať zmrazené ceny
- **Bootstrap:** Ak chýbajú previous closes, doťahuje ich

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
- Ukladá do Redis (`prevClose:YYYY-MM-DD:symbol`)
- Ukladá do DB (`DailyRef` tabuľka)
- **Fallback:** Ak chýbajú previous closes kedykoľvek pred 16:00 ET, doťahuje ich

#### **16:00 ET - Save Regular Close**
- Ukladá regular close prices (16:00 ET close) do DB
- Ukladá do `DailyRef.regularClose`
- Používa sa pre after-hours % change výpočty

### **Pricing State Machine:**

| Čas (ET) | State | canIngest | canOverwrite | useFrozenPrice |
|----------|-------|-----------|--------------|----------------|
| 04:00-09:30 | `pre_market_live` | ✅ | ✅ | ❌ |
| 09:30-16:00 | `live` | ✅ | ✅ | ❌ |
| 16:00-20:00 | `after_hours_live` | ✅ | ✅ | ❌ |
| 20:00-04:00 | `overnight_frozen` | ❌ | ❌ | ✅ |
| Weekend/Holiday | `weekend_frozen` | ❌ | ❌ | ✅ |

---

## 2️⃣ Bulk Preloader (`pmp-bulk-preloader`)

### **Načasovanie:**
- **Cron schedule:** `*/5 13-20 * * 1-5`
  - **Každých 5 minút** počas trading hours
  - **13-20 UTC = 08:00-15:00 ET** (pre-market + live trading)
  - **Len v pracovné dni** (1-5 = Monday-Friday)

### **Funkcia:**
- Načíta dáta pre **500-600 firiem** (SP500 + zahraničné)
- Uloží do **Redis cache** pre okamžité načítanie
- **Batch size:** 50 tickerov
- **Rate limiting:** 60 sekúnd medzi batchmi (Polygon free tier: 5 calls/min)

### **Kedy beží:**
- ✅ **Pre-market (08:00-09:30 ET)**
- ✅ **Live trading (09:30-15:00 ET)**
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

#### **Kde ukladá:**
- `Ticker.sharesOutstanding` - denormalizované
- `DailyRef.previousClose` - normalizované (s dátumom)
- `Ticker.latestPrevClose` - denormalizované (pre rýchly prístup)
- `Ticker.latestPrevCloseDate` - dátum posledného previous close

---

## 🔄 Reset a Aktualizácia dát v DB

### **Previous Close Reset:**

#### **Kedy sa resetuje:**
- **04:00 ET** - Bootstrap previous closes (denná úloha)
- **Kedykoľvek pred 16:00 ET** - Ak chýbajú previous closes (fallback)
- **Víkend/Holiday** - Ak chýbajú previous closes (fallback)

#### **Ako sa resetuje:**
1. Worker doťahuje previous close z Polygon API (aggs endpoint)
2. Hľadá posledný trading day (1-3 dni späť)
3. Ukladá do Redis (`prevClose:YYYY-MM-DD:symbol`)
4. Ukladá do DB (`DailyRef` tabuľka s dátumom trading dňa)
5. Denormalizuje do `Ticker.latestPrevClose`

### **Regular Close Reset:**

#### **Kedy sa resetuje:**
- **16:00 ET** - Automaticky po uzavretí trhu
- Ukladá sa `regularClose` do `DailyRef` tabuľky

#### **Ako sa resetuje:**
1. Worker doťahuje snapshot pre všetky tickers
2. Extrahuje `day.c` (regular session close)
3. Ukladá do `DailyRef.regularClose`
4. Používa sa pre after-hours % change výpočty

### **Price Data Reset:**

#### **Kedy sa resetuje:**
- **Nikdy automaticky** - dáta sa len aktualizujú
- **Live trading:** Aktualizácia každých 60s (premium) alebo 5min (ostatné)
- **Pre-market/After-hours:** Aktualizácia každých 5min
- **Overnight/Weekend:** Zmrazené (frozen), žiadne aktualizácie

#### **Ako sa aktualizuje:**
1. Worker doťahuje snapshot z Polygon API
2. Validuje timestamp (nesmie byť starší ako existujúci)
3. Validuje pricing state (nemôže prepisovať frozen prices)
4. Ukladá do `Ticker.lastPrice`, `Ticker.lastPriceUpdated`
5. Publikuje do Redis Pub/Sub pre WebSocket updates

---

## 📅 Denný cyklus (Pracovný deň)

### **04:00 ET - Bootstrap**
- ✅ Refresh universe (03:30 ET)
- ✅ Bootstrap previous closes (04:00 ET)
- ✅ Worker začína doťahovať pre-market dáta (každých 5min)

### **08:00-09:30 ET - Pre-market**
- ✅ Bulk preloader beží (každých 5min)
- ✅ Polygon worker beží (každých 5min pre všetky tickers)
- ✅ Dáta sa aktualizujú kontinuálne

### **09:30-16:00 ET - Live Trading**
- ✅ Bulk preloader beží (každých 5min)
- ✅ Polygon worker beží:
  - Premium tickers (top 200): každých 60s
  - Ostatné tickers: každých 5min
- ✅ Dáta sa aktualizujú kontinuálne

### **16:00 ET - Market Close**
- ✅ Save regular close (16:00 ET)
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
- ❌ Polygon worker **NEBEŽÍ** (frozen state)
- ✅ Dáta sú zmrazené (frozen), žiadne aktualizácie
- ✅ Bootstrap previous closes (ak chýbajú)

---

## 🔍 Dôležité detaily

### **Rate Limiting:**
- **Polygon API limit:** 300 requests/min
- **Systém používa:** 250 requests/min (bezpečnostná rezerva)
- **Batch size:** 60-70 tickerov
- **Delay medzi batchmi:** ~17 sekúnd

### **Prioritizácia:**
- **Premium tickers (top 200):** Častejšie aktualizácie (60s vs 5min)
- **Ostatné tickers:** Menej časté aktualizácie (5min)
- **Prioritizácia v batchoch:** Premium tickers sa spracúvajú prvé

### **Frozen State:**
- **Overnight (20:00-04:00 ET):** Frozen, žiadne aktualizácie
- **Weekend/Holiday:** Frozen, žiadne aktualizácie
- **Dôvod:** Zabráni prepisovaniu dobrých dát zlými fallbackmi

### **Previous Close Logic:**
- **Ukladá sa s dátumom trading dňa** (nie "dnes")
- **TTL v Redis:** Až do ďalšieho trading dňa + 24h buffer
- **Minimum TTL:** 7 dní
- **Maximum TTL:** 30 dní

### **Regular Close Logic:**
- **Ukladá sa o 16:00 ET** (regular session close)
- **Používa sa pre after-hours % change** (vs regular close, nie previous close)
- **Ukladá sa do `DailyRef.regularClose`**

### **Data Quality:**
- **delayed_15m:** Delayed data (~15 min delay)
- **rest:** Real-time data (premium plan)
- **snapshot:** Snapshot data (free/starter plan)

---

## 📊 Shrnutie intervalov

| Čas (ET) | Worker | Bulk Preloader | Interval (Premium) | Interval (Ostatné) |
|----------|--------|----------------|-------------------|-------------------|
| 04:00-09:30 | ✅ | ✅ | 5 min | 5 min |
| 09:30-16:00 | ✅ | ✅ | 60s | 5 min |
| 16:00-20:00 | ✅ | ❌ | 5 min | 5 min |
| 20:00-04:00 | ❌ | ❌ | - | - |
| Weekend/Holiday | ❌ | ❌ | - | - |

---

## 🔧 Manuálne spustenie

### **Polygon Worker:**
```bash
MODE=snapshot ENABLE_WEBSOCKET=true npx tsx src/workers/polygonWorker.ts
```

### **Bulk Preloader:**
```bash
npx tsx src/workers/backgroundPreloader.ts
```

### **Update Static Data:**
```bash
curl -X POST http://localhost:3000/api/cron/update-static-data \
  -H "Authorization: Bearer YOUR_CRON_SECRET_KEY"
```

---

## ⚠️ Dôležité poznámky

1. **Worker musí bežať kontinuálne** - ak sa zastaví, dáta sa neaktualizujú
2. **Frozen state je zámerný** - zabraňuje prepisovaniu dobrých dát
3. **Previous closes sa resetujú každý deň o 04:00 ET**
4. **Regular closes sa ukladajú o 16:00 ET**
5. **Bulk preloader beží len počas trading hours** (08:00-15:00 ET)
6. **Víkend/Holiday:** Žiadne aktualizácie, len bootstrap ak chýbajú previous closes

