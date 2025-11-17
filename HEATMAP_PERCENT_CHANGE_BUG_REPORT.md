# Heatmap Percent Change Bug Report

## 📋 Executive Summary

**Problem:** Heatmap (`/heatmap`) displays incorrect percent change values compared to main page (`/`). 

**Example:** GOOGL shows **0.02%** in heatmap, but **+4.43%** on main page (premarket price).

**Status:** 🔴 **BUG CONFIRMED** - Data inconsistency between endpoints

**Impact:** Users see different percent change values on different pages, causing confusion and potential trust issues.

---

## 🔍 Problem Description

### Symptom
- **Main page** (`http://localhost:3000/`): Shows correct premarket percent change (e.g., GOOGL: +4.43%)
- **Heatmap page** (`http://localhost:3000/heatmap`): Shows incorrect percent change (e.g., GOOGL: 0.02%)

### Data Flow Analysis

#### Main Page (`/`) - `/api/stocks` endpoint
1. Fetches data from Polygon API snapshot
2. Gets `currentPrice` from `getCurrentPrice(snapshotData)`
3. Gets `prevClose` from `getPreviousClose(ticker)` (Polygon API `/v2/aggs/ticker/{ticker}/prev`)
4. Calculates: `percentChange = computePercentChange(currentPrice, prevClose)`
5. **Result:** Correct premarket percent change

#### Heatmap Page (`/heatmap`) - `/api/heatmap` endpoint
1. Fetches `SessionPrice` from database (last 7 days)
2. Gets `currentPrice` from `SessionPrice.lastPrice`
3. Gets `previousClose` from `DailyRef.previousClose` (database, last 7 days)
4. Calculates `changePercent` using complex logic:
   ```typescript
   if (currentPrice > 0 && previousClose > 0 && previousClose !== currentPrice) {
     changePercent = computePercentChange(currentPrice, previousClose);
   } else if (currentPrice > 0 && previousClose === 0 && priceInfo?.changePct) {
     changePercent = priceInfo.changePct; // Uses SessionPrice.changePct
   }
   ```
5. **Result:** Incorrect percent change (often 0% or very small values)

---

## 🔬 Root Cause Analysis

### Primary Issue: Stale Database Data

**Problem 1: SessionPrice.lastPrice may be outdated**
- `SessionPrice` is updated by background workers/cron jobs
- If worker hasn't run recently, `lastPrice` may be from hours/days ago
- Heatmap uses this stale `lastPrice` instead of real-time price

**Problem 2: DailyRef.previousClose may be wrong date**
- `DailyRef` stores previous close for specific dates
- Query looks back 7 days: `date: { gte: weekAgo, lt: tomorrow }`
- May pick wrong date's `previousClose` if today's data isn't available
- Should use yesterday's close, not any date from last 7 days

**Problem 3: Data source mismatch**
- Main page: Uses **Polygon API** (real-time, accurate)
- Heatmap: Uses **Database** (may be stale, cached)

### Secondary Issue: Logic Flaw

**Current logic in `/api/heatmap`:**
```typescript
if (currentPrice > 0 && previousClose > 0 && previousClose !== currentPrice) {
  changePercent = computePercentChange(currentPrice, previousClose);
} else if (currentPrice > 0 && previousClose === 0 && priceInfo?.changePct) {
  changePercent = priceInfo.changePct; // Fallback to SessionPrice.changePct
}
```

**Problem:** 
- If `previousClose` exists but is from wrong date → wrong calculation
- If `SessionPrice.changePct` is stale → wrong value
- No validation that `previousClose` is actually yesterday's close

---

## 💡 Recommended Solution

### Option 1: Use Same Data Source as Main Page (Recommended)

**Make heatmap use Polygon API for prices, just like main page:**

1. **For current price:** Use Polygon API snapshot (same as `/api/stocks`)
2. **For previous close:** Use Polygon API `/v2/aggs/ticker/{ticker}/prev` (same as `/api/stocks`)
3. **Calculate percent change:** Use `computePercentChange(currentPrice, prevClose)` (same as `/api/stocks`)

**Pros:**
- ✅ Consistent data across all pages
- ✅ Real-time, accurate prices
- ✅ Same calculation logic

**Cons:**
- ⚠️ Slower (API calls for each ticker)
- ⚠️ Rate limiting concerns (but can batch/cache)

**Implementation:**
```typescript
// In /api/heatmap/route.ts
import { getCurrentPrice, getPreviousClose, computePercentChange } from '@/lib/marketCapUtils';

for (const ticker of tickers) {
  // Get real-time price from Polygon (same as /api/stocks)
  const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
  const snapshotResponse = await fetch(snapshotUrl);
  const snapshotData = await snapshotResponse.json();
  const currentPrice = getCurrentPrice(snapshotData);
  
  // Get previous close from Polygon (same as /api/stocks)
  const prevClose = await getPreviousClose(ticker);
  
  // Calculate percent change (same as /api/stocks)
  const percentChange = computePercentChange(currentPrice, prevClose);
  
  // Use database only for sector/industry/shares
  // ...
}
```

### Option 2: Fix Database Data Source

**Keep using database, but ensure data is fresh and correct:**

1. **For current price:** Use `SessionPrice.lastPrice` but validate it's recent (e.g., within last 15 minutes)
2. **For previous close:** Use `DailyRef.previousClose` but ensure it's from **yesterday's date**, not any date from last 7 days
3. **Fallback:** If database data is stale, fall back to Polygon API

**Pros:**
- ✅ Faster (database queries)
- ✅ Less API calls

**Cons:**
- ⚠️ Requires data freshness validation
- ⚠️ More complex logic
- ⚠️ Still may have stale data issues

**Implementation:**
```typescript
// Validate SessionPrice is recent (within 15 minutes)
const priceInfo = priceMap.get(ticker);
const priceAge = priceInfo?.lastTs ? Date.now() - new Date(priceInfo.lastTs).getTime() : Infinity;
const isPriceRecent = priceAge < 15 * 60 * 1000; // 15 minutes

if (!isPriceRecent) {
  // Fallback to Polygon API
  const currentPrice = await getCurrentPriceFromPolygon(ticker);
}

// Get previous close from yesterday's date specifically
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const dailyRef = await prisma.dailyRef.findFirst({
  where: {
    symbol: ticker,
    date: yesterday, // Specifically yesterday, not last 7 days
  },
});
```

### Option 3: Hybrid Approach (Best of Both Worlds)

**Use database for bulk data, Polygon API for validation/correction:**

1. **Primary:** Use database (`SessionPrice`, `DailyRef`) for speed
2. **Validation:** Check data freshness and correctness
3. **Fallback:** If data is stale or missing, use Polygon API
4. **Cache:** Cache Polygon API results to reduce calls

**Pros:**
- ✅ Fast (database primary)
- ✅ Accurate (Polygon fallback)
- ✅ Resilient (handles stale data)

**Cons:**
- ⚠️ Most complex implementation
- ⚠️ Requires careful caching strategy

---

## 🧪 Testing Checklist

### Before Fix
- [ ] Document current behavior: GOOGL shows 0.02% in heatmap, +4.43% on main page
- [ ] Check database: What is `SessionPrice.lastPrice` for GOOGL?
- [ ] Check database: What is `DailyRef.previousClose` for GOOGL? What date?
- [ ] Check Polygon API: What is real-time price for GOOGL?
- [ ] Check Polygon API: What is previous close for GOOGL?

### After Fix
- [ ] Verify GOOGL shows same percent change on both pages
- [ ] Test with multiple tickers (NVDA, AAPL, MSFT, etc.)
- [ ] Test with different scenarios:
  - [ ] Ticker with fresh database data
  - [ ] Ticker with stale database data
  - [ ] Ticker with missing database data
- [ ] Performance test: Heatmap load time
- [ ] Rate limiting test: Ensure no API rate limit issues

---

## 📝 Code References

### Key Files
- `src/app/api/stocks/route.ts` - Main page endpoint (works correctly)
- `src/app/api/heatmap/route.ts` - Heatmap endpoint (has bug)
- `src/lib/marketCapUtils.ts` - Utility functions (`getCurrentPrice`, `getPreviousClose`, `computePercentChange`)

### Current Implementation (Buggy)
**File:** `src/app/api/heatmap/route.ts`
**Lines:** 276-303

```typescript
const priceInfo = priceMap.get(ticker);
const dailyRefClose = previousCloseMap.get(ticker);

let currentPrice = priceInfo?.price || 0; // From SessionPrice (may be stale)
let previousClose = dailyRefClose || 0; // From DailyRef (may be wrong date)

// Complex logic that may use stale data
if (currentPrice > 0 && previousClose > 0 && previousClose !== currentPrice) {
  changePercent = computePercentChange(currentPrice, previousClose);
} else if (currentPrice > 0 && previousClose === 0 && priceInfo?.changePct) {
  changePercent = priceInfo.changePct; // May be stale
}
```

### Correct Implementation (Main Page)
**File:** `src/app/api/stocks/route.ts`
**Lines:** 284-293

```typescript
// Get real-time price from Polygon
const currentPrice = getCurrentPrice(snapshotData);

// Get previous close from Polygon
const prevClose = await getPreviousClose(ticker);

// Calculate percent change
const percentChange = computePercentChange(currentPrice, prevClose);
```

---

## 🔗 Related Issues

### Similar Problems
- Heatmap may have same issue with other data (market cap, etc.)
- Other endpoints may have stale data issues
- Database vs API data consistency across application

### Dependencies
- Polygon API rate limits
- Database update frequency (cron jobs)
- Cache TTL settings

---

## 📅 Timeline

- **Initial Report:** Current session
- **Root Cause Identified:** Data source mismatch (database vs API)
- **Status:** Awaiting fix implementation

---

## ✅ Recommended Action

**Immediate Fix:** Implement Hybrid Approach (Option 3 - Best of Both Worlds)

1. ✅ **FIXED:** Use `SessionPrice.changePct` if recent (within 15 minutes) - most accurate for premarket/intraday
2. ✅ **FIXED:** Use `computePercentChange(currentPrice, previousClose)` if both prices available
3. ✅ **FIXED:** Use `DailyRef.previousClose` from **yesterday's date** (not last 7 days) - ensures correct previous close
4. ✅ **FIXED:** Fallback to `SessionPrice.changePct` even if not recent, if `previousClose` is missing

**Implementation Details:**
- `DailyRef` query now uses **yesterday's date specifically** (not last 7 days range)
- `SessionPrice.changePct` is prioritized if data is recent (within 15 minutes)
- Falls back to calculated `changePercent` if `SessionPrice` is stale
- Maintains database performance while ensuring accuracy

**Expected Result:**
- ✅ Heatmap shows same percent change as main page (when data is recent)
- ✅ Uses most accurate source (recent SessionPrice.changePct for premarket)
- ✅ Falls back gracefully when data is stale
- ✅ Consistent user experience

**Priority:** 🔴 **HIGH** - Data accuracy is critical for financial application

**Status:** ✅ **IMPLEMENTED** - Awaiting testing

---

## 📧 Additional Notes

### Why This Matters
- **User Trust:** Inconsistent data erodes user confidence
- **Financial Accuracy:** Wrong percent changes can mislead investors
- **User Experience:** Users expect same data across all pages

### Performance Considerations
- Current heatmap loads ~615 companies
- Polygon API calls: 615 tickers × 2 calls (snapshot + prev) = 1,230 calls
- With 2-minute cache: ~10 calls per minute (manageable)
- Can batch requests or use Polygon batch endpoints if available

### Alternative: Batch Processing
- Process tickers in batches (e.g., 50 at a time)
- Use Polygon batch endpoints if available
- Implement progressive loading (show data as it arrives)

---

**Report Created:** Based on user feedback and code analysis
**Status:** Ready for implementation
**Next Step:** Choose solution option and implement fix

