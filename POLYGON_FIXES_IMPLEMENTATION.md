# 🔧 Implementácia oprav pre Polygon data fetching

## ✅ Už implementované

### 1. Rozšírený lookback pre previous closes
- **Zmena:** Z 3 dní na 10 dní
- **Súbor:** `src/workers/polygonWorker.ts` (riadok 752-753)
- **Dôvod:** Pokryje dlhšie sviatky (napr. Thanksgiving week)

---

## 🚧 Potrebné implementovať

### 2. DST-safe Bulk Preloader Scheduling

**Problém:**
- PM2 cron: `*/5 13-20 * * 1-5` (UTC)
- V zime: 08:00-15:00 ET ✅
- V lete: 09:00-16:00 ET ❌ (DST posun)

**Riešenie A: Interný scheduler v workeri (Odporúčané)**

Presunúť bulk preloader do polygon workeru s ET-aware scheduling:

```typescript
// V polygonWorker.ts, pridať do ingestLoop():
const scheduleBulkPreload = async () => {
  const etNow = nowET();
  const et = toET(etNow);
  const hours = et.hour;
  const minutes = et.minute;
  const dayOfWeek = et.weekday;
  
  // Pre-market + live trading: 08:00-15:00 ET (DST-safe)
  const isPreMarketOrLive = (hours >= 8 && hours < 15) || 
                           (hours === 7 && minutes >= 30); // 07:30-08:00 ET edge case
  
  // Len v pracovné dni (1-5 = Monday-Friday)
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  
  if (isPreMarketOrLive && isWeekday) {
    // Check if last bulk preload was > 5 min ago
    const lastPreload = await redisClient.get('bulk:last_preload_ts');
    const now = Date.now();
    const fiveMinAgo = now - (5 * 60 * 1000);
    
    if (!lastPreload || parseInt(lastPreload) < fiveMinAgo) {
      console.log('🔄 Running bulk preload...');
      // Run bulk preload logic here
      await redisClient.setEx('bulk:last_preload_ts', 3600, now.toString());
    }
  }
};

// V ingestLoop(), volať každých 60s:
await scheduleBulkPreload();
```

**Riešenie B: Externý cron s ET timezone**

```bash
# V /etc/cron.d/premarketprice (alebo systemd timer)
TZ=America/New_York
*/5 8-15 * * 1-5 /usr/bin/pm2 restart pmp-bulk-preloader
```

**Odporúčanie:** Riešenie A (interný scheduler) - jednoduchšie, DST-safe, bez externých závislostí

---

### 3. Trading Calendar Aware Regular Close

**Problém:**
- Hardcoded 16:00 ET pre regular close
- Neberie do úvahy early closes (pred sviatkami)

**Riešenie:**

```typescript
// V polygonWorker.ts, saveRegularClose():
async function saveRegularClose(apiKey: string, date: string): Promise<void> {
  // Namiesto hardcoded 16:00 ET, detekovať skutočný close:
  
  // 1. Skúsiť získať regular close z Polygon API (aggs endpoint)
  // 2. Ak nie je early close, použiť 16:00 ET
  // 3. Ak je early close, použiť skutočný close time
  
  const tickers = await getUniverse('sp500');
  const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
  
  for (const snapshot of snapshots) {
    const symbol = snapshot.ticker;
    const regularClose = snapshot.day?.c;
    
    // Check if market had early close (detect from volume/time patterns)
    // Or use trading calendar API
    
    if (regularClose && regularClose > 0) {
      // Save with actual trading day date
      await prisma.dailyRef.upsert({
        where: { symbol_date: { symbol, date: dateObj } },
        update: { regularClose },
        create: { symbol, date: dateObj, regularClose }
      });
    }
  }
}
```

**Alternatíva (jednoduchšia):**
- Použiť Polygon market status API na detekciu early close
- Alebo hardcode známe early close days (Thanksgiving, Christmas Eve)

---

### 4. On-demand Previous Close v API Endpointoch

**Problém:**
- On-demand prevClose fetch je len v `ingestBatch()` (worker)
- API endpointy (heatmap, stocks) preskakujú tickery bez prevClose

**Riešenie:**

Vytvoriť helper funkciu pre on-demand prevClose fetch:

```typescript
// src/lib/utils/marketCapUtils.ts
export async function fetchPreviousCloseOnDemand(
  ticker: string,
  apiKey: string,
  maxLookback: number = 10
): Promise<number | null> {
  // Rate limit: max 20 requests per minute
  // Cache výsledky v Redis (TTL: 24h)
  
  const cacheKey = `prevClose:ondemand:${ticker}`;
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return parseFloat(cached);
  }
  
  // Fetch from Polygon API
  const today = getDateET();
  for (let i = 1; i <= maxLookback; i++) {
    const prevDate = new Date(today);
    prevDate.setDate(prevDate.getDate() - i);
    const prevDateStr = prevDate.toISOString().split('T')[0];
    
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${prevDateStr}/${prevDateStr}?adjusted=true&apiKey=${apiKey}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const prevClose = data.results[0].c;
        if (prevClose > 0) {
          // Cache in Redis
          await redisClient.setEx(cacheKey, 86400, prevClose.toString());
          return prevClose;
        }
      }
    }
    
    // Rate limiting
    await sleep(200);
  }
  
  return null;
}
```

**Použitie v API endpointoch:**

```typescript
// V /api/heatmap/route.ts alebo /api/stocks/route.ts:
if (previousClose === 0 && currentPrice > 0) {
  // Try on-demand fetch (rate limited, cached)
  const onDemandPrevClose = await fetchPreviousCloseOnDemand(
    ticker, 
    process.env.POLYGON_API_KEY,
    10 // max lookback
  );
  
  if (onDemandPrevClose) {
    previousClose = onDemandPrevClose;
    // Also save to DB for future use
    await setPrevClose(today, ticker, onDemandPrevClose);
  } else {
    // Still no prevClose, skip ticker
    skippedNoPrice++;
    continue;
  }
}
```

**Rate limiting:**
- Max 20 on-demand requests per minute
- Cache výsledky v Redis (TTL: 24h)
- Prioritizovať premium tickers (top 200)

---

### 5. Freshness Metriky

**Riešenie:**

```typescript
// src/lib/utils/freshnessMetrics.ts
export async function getFreshnessMetrics(): Promise<{
  fresh: number;      // < 2 min
  recent: number;     // 2-5 min
  stale: number;      // 5-15 min
  veryStale: number;  // > 15 min
  total: number;
}> {
  const tickers = await getUniverse('sp500');
  const now = Date.now();
  
  let fresh = 0, recent = 0, stale = 0, veryStale = 0;
  
  for (const ticker of tickers) {
    const lastUpdate = await redisClient.get(`worker:last_update:${ticker}`);
    if (!lastUpdate) {
      veryStale++;
      continue;
    }
    
    const ageMs = now - parseInt(lastUpdate);
    const ageMin = ageMs / (60 * 1000);
    
    if (ageMin < 2) fresh++;
    else if (ageMin < 5) recent++;
    else if (ageMin < 15) stale++;
    else veryStale++;
  }
  
  return {
    fresh,
    recent,
    stale,
    veryStale,
    total: tickers.length
  };
}
```

**API endpoint:**

```typescript
// /api/metrics/freshness
export async function GET() {
  const metrics = await getFreshnessMetrics();
  return NextResponse.json(metrics);
}
```

---

## 📋 Priorita implementácie

### **Priorita 1 (Kritické):**
1. ✅ **Rozšírený lookback** - UŽ IMPLEMENTOVANÉ
2. 🔄 **DST-safe bulk preloader** - Potrebné implementovať
3. 🔄 **On-demand prevClose v API** - Potrebné implementovať

### **Priorita 2 (Dôležité):**
4. 🔄 **Trading calendar aware regular close** - Potrebné implementovať
5. 🔄 **Freshness metriky** - Potrebné implementovať

### **Priorita 3 (Vylepšenia):**
6. 🔄 **Startup warmup po 04:00 ET** - Nice to have
7. 🔄 **Rozšírený preloader okno (04:00-08:00 ET)** - Nice to have

---

## 🔍 Odpoveď na otázku: Kde beží bulk preloader cron?

**Aktuálne:**
- **PM2 cron** (`ecosystem.config.js`, riadok 88)
- **Format:** `*/5 13-20 * * 1-5` (UTC)
- **Problém:** DST posun

**Riešenie:**
- **Odporúčané:** Presunúť do interného schedulera v polygon workeri (DST-safe)
- **Alternatíva:** Externý cron s `TZ=America/New_York`

---

## 📝 Zhrnutie

**Už opravené:**
- ✅ Rozšírený lookback z 3 na 10 dní

**Potrebné opraviť:**
- 🔄 DST problém s bulk preloader
- 🔄 On-demand prevClose v API
- 🔄 Trading calendar aware regular close
- 🔄 Freshness metriky

**Verdikt:**
- Jadro systému je solídne
- Identifikované problémy sú reálne, ale nie kritické
- Opravy sú priamočiaré a implementovateľné

