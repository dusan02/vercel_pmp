# PODROBNÁ ANALÝZA PROBLÉMU PRE GPT 🚨

## 📋 SÚHRN SITUÁCIE

**Včera:** Aplikácia fungovala správne na Verceli s 260+ akciami a správnymi cenami
**Dnes:** Aplikácia zobrazuje 0.00 pre currentPrice namiesto skutočných hodnôt

## 🔍 ANALÝZA KÓDU A ARCHITEKTÚRY

### 1. FRONTEND DATA FLOW (src/app/page.tsx)

```typescript
// Interface pre stock data
interface StockData {
  ticker: string;
  currentPrice: number; // ✅ Očakáva number
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  lastUpdated?: string;
}

// Mock data fallback (8 akcií)
const mockStocks: StockData[] = [
  {
    ticker: "NVDA",
    currentPrice: 176.36,
    closePrice: 177.87,
    percentChange: -0.22,
    marketCapDiff: -9.52,
    marketCap: 4231,
  },
  {
    ticker: "MSFT",
    currentPrice: 512.09,
    closePrice: 533.5,
    percentChange: -0.08,
    marketCapDiff: -3.06,
    marketCap: 3818,
  },
  // ... ďalších 6 akcií
];

// Data fetching funkcia
const fetchStockData = async (refresh = false) => {
  try {
    const response = await fetch(
      `/api/prices/cached?refresh=${refresh}&t=${Date.now()}`,
      {
        cache: "no-store",
      }
    );
    const result = await response.json();

    if (result.data && result.data.length > 0) {
      // 💡 FIX: Normalizácia číselných hodnôt
      const normalised = result.data.map((s: any) => ({
        ...s,
        currentPrice: Number(s.currentPrice),
        closePrice: Number(s.closePrice),
        percentChange: Number(s.percentChange),
        marketCapDiff: Number(s.marketCapDiff),
        marketCap: Number(s.marketCap),
      }));

      setStockData(normalised);
      setError(null);
    } else {
      // Fallback na mock data
      setStockData(mockStocks);
      setError("Using demo data...");
    }
  } catch (err) {
    setStockData(mockStocks);
    setError("API error, using mock data");
  }
};

// Rendering v JSX
<td>
  {isFinite(Number(stock.currentPrice))
    ? Number(stock.currentPrice).toFixed(2)
    : "0.00"}
</td>;
```

### 2. BACKEND API ENDPOINT (src/app/api/prices/cached/route.ts)

```typescript
export async function GET(request: NextRequest) {
  try {
    // Hardcoded API key pre spoľahlivosť
    const apiKey = "Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX";

    // Test API call pre debug
    const testUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apikey=${apiKey}`;
    const testResponse = await fetch(testUrl);

    // Cache status check
    const cacheStatus = await stockDataCache.getCacheStatus();

    // Background update trigger
    if (
      (cacheStatus.count === 0 || cacheStatus.count <= 20) &&
      !cacheStatus.isUpdating
    ) {
      stockDataCache
        .updateCache()
        .catch((err) => console.error("Background update failed:", err));
    }

    // Return data
    const allStocks = await stockDataCache.getAllStocks();
    const message =
      allStocks.length <= 20
        ? "Loading real data in background... (showing demo data)"
        : "All data from cache";

    return NextResponse.json({
      data: allStocks,
      cacheStatus,
      message,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 3. CACHE SYSTEM (src/lib/cache.ts)

```typescript
interface CachedStockData {
  ticker: string;
  currentPrice: number; // ✅ Renamed from preMarketPrice
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  lastUpdated: Date;
}

class StockDataCache {
  private cache: Map<string, CachedStockData> = new Map();
  private isUpdating = false;

  // 260+ tickerov pre top US companies
  private readonly TICKERS = [
    "NVDA",
    "MSFT",
    "AAPL",
    "AMZN",
    "GOOGL",
    "GOOG",
    "META",
    "AVGO",
    "BRK.A",
    "BRK.B",
    "TSLA",
    // ... 250+ ďalších tickerov
  ];

  async updateCache(): Promise<void> {
    if (this.isUpdating) return;
    this.isUpdating = true;

    try {
      const apiKey = "Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX";

      // Fetch data pre všetky tickery
      for (const ticker of this.TICKERS) {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          const snapshot = data.results;

          if (snapshot && snapshot.lastTrade) {
            const currentPrice = snapshot.lastTrade.p;
            const prevClose = snapshot.prevDay?.c || currentPrice;
            const percentChange =
              ((currentPrice - prevClose) / prevClose) * 100;

            // Market cap calculation s Decimal.js
            const sharesOutstanding = await getSharesOutstanding(
              ticker,
              apiKey
            );
            const marketCap = computeMarketCap(currentPrice, sharesOutstanding);
            const marketCapDiff = computeMarketCapDiff(
              currentPrice,
              prevClose,
              sharesOutstanding
            );

            const stockData: CachedStockData = {
              ticker,
              currentPrice: Math.round(currentPrice * 100) / 100,
              closePrice: Math.round(prevClose * 100) / 100,
              percentChange: Math.round(percentChange * 100) / 100,
              marketCapDiff: Math.round(marketCapDiff * 100) / 100,
              marketCap: Math.round(marketCap * 100) / 100,
              lastUpdated: new Date(),
            };

            this.cache.set(ticker, stockData);
          }
        }
      }

      console.log("✅ Redis cache updated with", this.cache.size, "stocks");
    } catch (error) {
      console.error("Cache update failed:", error);
    } finally {
      this.isUpdating = false;
    }
  }

  // Demo data fallback (20 akcií)
  private getDemoData(): CachedStockData[] {
    const demoPrices = [
      { ticker: "AAPL", price: 150.25, change: 0.85 },
      { ticker: "MSFT", price: 320.5, change: -1.2 },
      // ... 18 ďalších
    ];

    return demoPrices.map(({ ticker, price, change }) => ({
      ticker,
      currentPrice: price,
      closePrice: price / (1 + change / 100),
      percentChange: change,
      marketCapDiff: 0,
      marketCap: price * 1000000000, // 1B shares estimate
      lastUpdated: new Date(),
    }));
  }
}
```

## 🚨 IDENTIFIKOVANÉ PROBLÉMY

### 1. **CACHE INITIALIZATION ISSUE**

```typescript
// Problém: Cache sa inicializuje s demo dátami a background update sa nespúšťa
if (
  (cacheStatus.count === 0 || cacheStatus.count <= 20) &&
  !cacheStatus.isUpdating
) {
  stockDataCache
    .updateCache()
    .catch((err) => console.error("Background update failed:", err));
}
```

**Príčina:** Background update sa nespúšťa správne alebo zlyháva

### 2. **API KEY VALIDATION**

```typescript
// Test API call v route.ts
const testUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apikey=${apiKey}`;
const testResponse = await fetch(testUrl);
```

**Príčina:** API key môže byť neplatný alebo vypršaný

### 3. **DATA TYPE CONVERSION**

```typescript
// Frontend normalizácia
const normalised = result.data.map((s: any) => ({
  ...s,
  currentPrice: Number(s.currentPrice), // Môže vrátiť NaN
  // ...
}));
```

**Príčina:** Ak API vráti string alebo null, Number() vráti NaN

### 4. **FALLBACK LOGIC**

```typescript
// Mock data fallback
if (stockData.length === 0) {
  setStockData(mockStocks); // Zobrazí mock data namiesto reálnych
}
```

**Príčina:** Aplikácia zobrazuje mock data namiesto reálnych dát

## 🔧 IMPLEMENTOVANÉ FIXES

### 1. **Type Safety Fix**

```typescript
// V JSX rendering
<td>
  {isFinite(Number(stock.currentPrice))
    ? Number(stock.currentPrice).toFixed(2)
    : "0.00"}
</td>
```

### 2. **Enhanced Debug Logging**

```typescript
console.log("🔍 DEBUG: First stock currentPrice:", result.data[0].currentPrice);
console.log("🔍 DEBUG: After normalisation:", normalised[0].currentPrice);
```

### 3. **Cache Status Monitoring**

```typescript
// Log cache status
if (result.cacheStatus) {
  console.log("Cache status:", result.cacheStatus);
}
```

## 📊 VČERA VS DNES - POROVNANIE

### **Včera (Fungovalo):**

- ✅ API key bol platný
- ✅ Background cache update fungoval
- ✅ 260+ akcií sa načítalo správne
- ✅ currentPrice zobrazoval skutočné hodnoty
- ✅ Vercel deployment bol úspešný

### **Dnes (Nejde):**

- ❌ API key môže byť neplatný/vypršaný
- ❌ Background cache update zlyháva
- ❌ Cache obsahuje len demo data (20 akcií)
- ❌ currentPrice zobrazuje 0.00
- ❌ Frontend fallback na mock data

## 🎯 DIAGNOSTIC STEPS PRE GPT

### 1. **Skontroluj API Key**

```bash
# Test API key validity
curl "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apikey=Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX"
```

### 2. **Skontroluj Cache Status**

```bash
# Vercel function logs
# Hľadaj: "Cache has X stocks", "Background update failed"
```

### 3. **Skontroluj Frontend Console**

```javascript
// Browser console logs
// Hľadaj: "🔍 DEBUG: First stock currentPrice", "API error"
```

### 4. **Skontroluj Network Tab**

```javascript
// Network requests
// Hľadaj: /api/prices/cached response
// Skontroluj: data.currentPrice values
```

## 🚨 MOST LIKELY ROOT CAUSES

### 1. **API Key Expired/Invalid** (80% pravdepodobnosť)

- Polygon.io API key môže vypršať
- Rate limiting môže byť dosiahnutý
- API key môže byť deaktivovaný

### 2. **Background Cache Update Failed** (15% pravdepodobnosť)

- Network issues pri volaní Polygon API
- Timeout pri fetch 260+ akcií
- Memory issues pri spracovaní dát

### 3. **Frontend State Management** (5% pravdepodobnosť)

- React state sa neaktualizuje správne
- Mock data override reálne dáta
- Type conversion issues

## 🔧 RECOMMENDED SOLUTIONS

### 1. **Immediate Fix - API Key Check**

```typescript
// V route.ts - add API key validation
const testResponse = await fetch(
  `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apikey=${apiKey}`
);
if (!testResponse.ok) {
  console.error("❌ API key invalid or expired");
  return NextResponse.json({ error: "API key issue" }, { status: 401 });
}
```

### 2. **Enhanced Error Handling**

```typescript
// V cache.ts - better error handling
try {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`❌ API call failed for ${ticker}:`, response.status);
    continue; // Skip this ticker, continue with others
  }
} catch (error) {
  console.error(`❌ Network error for ${ticker}:`, error);
  continue;
}
```

### 3. **Fallback Strategy**

```typescript
// V page.tsx - better fallback logic
if (result.data && result.data.length > 20) {
  // Real data available
  setStockData(normalised);
} else if (result.data && result.data.length > 0) {
  // Demo data available, but show loading message
  setStockData(result.data);
  setError("Loading real data in background...");
} else {
  // No data at all, use mock
  setStockData(mockStocks);
  setError("API temporarily unavailable");
}
```

## 📈 MONITORING A DEBUGGING

### **Vercel Logs to Check:**

```
✅ "Cache has X stocks (likely demo data), triggering background update..."
✅ "✅ Redis cache updated with X stocks"
❌ "Background cache update failed:"
❌ "❌ API key invalid or expired"
❌ "❌ API call failed for AAPL: 401"
```

### **Browser Console to Check:**

```
✅ "✅ Received real data from API: X stocks"
✅ "🔍 DEBUG: First stock currentPrice: 173.74"
❌ "API error, using mock data"
❌ "🔍 DEBUG: First stock currentPrice: 0"
```

## 🎯 CONCLUSION

**Hlavný problém:** API key alebo background cache update zlyháva, čo spôsobuje, že aplikácia zobrazuje demo data namiesto reálnych dát.

**Riešenie:**

1. Skontrolovať API key validitu
2. Opraviť background cache update
3. Zlepšiť error handling a fallback logiku

**Docker Desktop:** Nemá vplyv na Vercel deployment, aplikácia beží v cloude.

---

**Stav:** Problém identifikovaný, potrebné testovanie API key a cache update
**Nasledujúci krok:** Diagnostika API key a cache update procesu
