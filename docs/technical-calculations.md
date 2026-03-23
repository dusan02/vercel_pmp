# Technical Documentation - Market Cap Calculations

## Overview
This document provides technical details about market cap and percent change calculations in the application.

## Core Functions

### `computeMarketCap(price: number, shares: number): number`
Computes market cap in billions USD using Decimal.js for precision.

```typescript
export function computeMarketCap(price: number, shares: number): number {
  try {
    const result = new Decimal(price)
      .mul(shares)
      .div(1_000_000_000) // Convert to billions
      .toNumber();

    return Math.round(result * 100) / 100; // Round to 2 decimal places
  } catch (error) {
    console.error('Error computing market cap:', error);
    throw error;
  }
}
```

### `computeMarketCapDiff(currentPrice: number, prevClose: number, shares: number): number`
Computes market cap difference in billions USD.

```typescript
export function computeMarketCapDiff(currentPrice: number, prevClose: number, shares: number): number {
  try {
    const result = new Decimal(currentPrice)
      .minus(prevClose)
      .mul(shares)
      .div(1_000_000_000) // Convert to billions
      .toNumber();

    return Math.round(result * 100) / 100; // Round to 2 decimal places
  } catch (error) {
    console.error('Error computing market cap diff:', error);
    throw error;
  }
}
```

### `computePercentChange(currentPrice: number, prevClose: number, session?: string, regularClose?: number): number`
Computes percent change with session-aware logic.

```typescript
export function computePercentChange(
  currentPrice: number,
  prevClose: number,
  session?: 'pre' | 'live' | 'after' | 'closed',
  regularClose?: number | null
): number {
  // Session-aware logic
  if (session !== undefined) {
    try {
      const { calculatePercentChange } = require('./priceResolver');
      const result = calculatePercentChange(currentPrice, session, prevClose, regularClose || null);
      return Math.round(result.changePct * 100) / 100;
    } catch (error) {
      console.error('Error in session-aware percent change calculation:', error);
      // Fallback to simple calculation
    }
  }

  // Simple calculation (backward compatibility)
  try {
    if (!prevClose || prevClose <= 0) {
      return 0;
    }

    const result = new Decimal(currentPrice)
      .minus(prevClose)
      .div(prevClose)
      .times(100)
      .toNumber();

    return Math.round(result * 100) / 100;
  } catch (error) {
    console.error('Error computing percent change:', error);
    throw error;
  }
}
```

## Data Sources and Priority

### 1. Cache (Priority 1)
- **Source**: Redis cache with 24-hour TTL
- **Endpoint**: `/api/stocks` cache data
- **Advantage**: Fastest response time
- **Validation**: Applied after cache retrieval

### 2. SessionPrice (Priority 2)
- **Source**: Database `SessionPrice` table
- **Filtering**: Last 24 hours, ordered by timestamp
- **Logic**: Prefer newer than `Ticker.lastPriceUpdated`

### 3. Ticker (Priority 3 - Fallback)
- **Source**: Database `Ticker` table
- **Data**: Denormalized `lastMarketCap`, `lastPrice`, `latestPrevClose`
- **Usage**: When cache and session data are unavailable

## Validation Functions

### `validateMarketCap(marketCap: number, ticker: string): boolean`
Filters out invalid market cap values.

```typescript
export function validateMarketCap(marketCap: number, ticker: string): boolean {
  // Filter out zero or negative market caps
  if (marketCap <= 0) {
    console.warn(`⚠️ Zero or negative market cap detected for ${ticker}: ${marketCap}B - filtering out`);
    return false;
  }

  // Filter out extremely high market caps (possible data errors)
  if (marketCap > 10000) { // > $10 trillion
    console.warn(`⚠️ Extremely high market cap detected for ${ticker}: ${marketCap}B - possible data error`);
    return false;
  }

  return true;
}
```

### `validatePercentChange(percentChange: number, ticker: string): boolean`
Filters out extreme percent changes.

```typescript
export function validatePercentChange(percentChange: number, ticker: string): boolean {
  // Filter out extreme percent changes (possible splits or data errors)
  if (Math.abs(percentChange) > 100) {
    console.warn(`⚠️ Extreme percent change detected for ${ticker}: ${percentChange.toFixed(2)}% - filtering out`);
    return false;
  }

  return true;
}
```

### `validatePriceChange(currentPrice: number, prevClose: number): void`
Validates price data and warns about extreme changes.

```typescript
export function validatePriceChange(currentPrice: number, prevClose: number): void {
  // Check for zero or negative values
  if (currentPrice <= 0 || prevClose <= 0) {
    console.warn(`⚠️ Invalid price data detected - current: $${currentPrice}, prev: $${prevClose}`);
    return;
  }

  const percentChange = Math.abs((currentPrice - prevClose) / prevClose) * 100;

  // Check for extreme changes (possible splits or data errors)
  if (percentChange > 100) {
    console.warn(`⚠️ Extreme price change detected: ${percentChange.toFixed(2)}% - possible stock split or data error`);
  }

  if (currentPrice < 0.01 || prevClose < 0.01) {
    throw new Error('Suspiciously low price detected - possible data error');
  }
}
```

## Error Handling

### Common Scenarios

1. **Missing Previous Close**
   - **Detection**: `previousClose === 0`
   - **Action**: On-demand fetch from Polygon API
   - **Fallback**: Skip ticker if still missing

2. **Missing Shares Data**
   - **Detection**: `sharesOutstanding === 0`
   - **Action**: Use denormalized market cap
   - **Fallback**: Skip if market cap is also 0

3. **Extreme Values**
   - **Detection**: Validation functions return false
   - **Action**: Log warning and skip ticker
   - **Purpose**: Prevent misleading heatmap display

## Performance Considerations

### Caching Strategy
- **Share Counts**: 24-hour TTL in memory cache
- **Previous Close**: 24-hour TTL in memory cache
- **Stock Data**: Redis cache with 15-minute TTL
- **Batch Operations**: Parallel API calls where possible

### Decimal.js Usage
- **Precision**: All calculations use Decimal.js for floating-point accuracy
- **Rounding**: Results rounded to 2 decimal places
- **Performance**: Minimal overhead for financial calculations

## Debug Tools

### `logCalculationData()`
Detailed logging for individual ticker calculations.

```typescript
export function logCalculationData(
  ticker: string, 
  currentPrice: number, 
  prevClose: number, 
  shares: number, 
  marketCap: number, 
  marketCapDiff: number, 
  percentChange: number
): void {
  console.log(`📊 ${ticker} Calculation Details:`);
  console.log(`   Current Price: $${currentPrice}`);
  console.log(`   Previous Close: $${prevClose}`);
  console.log(`   Shares Outstanding: ${shares.toLocaleString()}`);
  console.log(`   Market Cap: $${marketCap}B`);
  console.log(`   Market Cap Diff: $${marketCapDiff}B`);
  console.log(`   Percent Change: ${percentChange >= 0 ? '+' : ''}${percentChange}%`);
  console.log(`   Formula: ($${currentPrice} - $${prevClose}) × ${shares.toLocaleString()} ÷ 1,000,000,000 = $${marketCapDiff}B`);
}
```

### `getCacheStatus()`
Returns cache statistics for debugging.

```typescript
export function getCacheStatus(): {
  shareCounts: { size: number; entries: Array<{ ticker: string; shares: number; age: number }> };
  prevCloses: { size: number; entries: Array<{ ticker: string; prevClose: number; age: number }> };
} {
  // Returns cache hit rates, entry ages, etc.
}
```

## Integration Points

### Heatmap API (`/api/heatmap/route.ts`)
```typescript
// Validation applied to both cache and DB paths
if (!validateMarketCap(marketCap, ticker)) {
  skippedNoMarketCap++;
  continue;
}

if (!validatePercentChange(changePercent, ticker)) {
  skippedNoPrice++;
  continue;
}
```

### Stocks API (`/api/stocks/route.ts`)
```typescript
// Uses same validation functions
const marketCap = computeMarketCap(currentPrice, sharesOutstanding);
const percentChange = computePercentChange(currentPrice, previousClose, session, regularClose);
```

## Testing

### Unit Tests
- Location: `src/lib/__tests__/marketCapUtils.test.ts`
- Coverage: All calculation and validation functions
- Edge Cases: Zero values, extreme changes, invalid inputs

### Integration Tests
- Location: `src/workers/__tests__/polygonWorker.integration.test.ts`
- Focus: End-to-end calculation workflows
- Data Validation: Real-world data scenarios

## Best Practices

1. **Always validate inputs** before calculations
2. **Use Decimal.js** for financial calculations
3. **Log extreme values** for debugging
4. **Filter invalid data** rather than displaying it
5. **Cache appropriately** for performance
6. **Handle missing data** gracefully
7. **Round consistently** to 2 decimal places
