import Decimal from 'decimal.js';

// Cache for share counts (24-hour TTL)
const shareCountCache = new Map<string, { shares: number; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Cache for previous close (24-hour TTL)
const prevCloseCache = new Map<string, { prevClose: number; timestamp: number }>();

/**
 * Get market status from Polygon API
 */
export async function getMarketStatus(): Promise<{ market: string; serverTime: string }> {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      throw new Error('Polygon API key not configured');
    }

    const url = `https://api.polygon.io/v1/marketstatus/now?apiKey=${apiKey}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      market: data.market,
      serverTime: data.serverTime
    };

  } catch (error) {
    console.error('❌ Error fetching market status:', error);
    // Default to closed if API fails
    return { market: 'closed', serverTime: new Date().toISOString() };
  }
}

/**
 * Fetch share count from Polygon API with caching
 */
export async function getSharesOutstanding(ticker: string, currentPrice?: number): Promise<number> {
  const now = Date.now();
  const cached = shareCountCache.get(ticker);

  // Return cached value if still valid (24-hour cache)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    console.log(`📊 Using cached shares for ${ticker}: ${cached.shares.toLocaleString()}`);
    return cached.shares;
  }

  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      throw new Error('Polygon API key not configured');
    }

    const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      console.warn(`⚠️ Polygon API error for ${ticker} shares: ${response.status} ${response.statusText}`);
      return 0;
    }

    const data = await response.json();

    const results = data.results;

    // Prefer weighted shares, but fall back to share_class_shares_outstanding when missing (common for ADRs/OTC/etc).
    let shares: number =
      results?.weighted_shares_outstanding ||
      results?.share_class_shares_outstanding ||
      0;

    // Best-effort fallback: if shares are missing but Polygon provides market_cap,
    // estimate shares = market_cap / currentPrice (only when currentPrice is provided and valid).
    if ((!shares || shares <= 0) && results?.market_cap && currentPrice && currentPrice > 0) {
      const estimated = results.market_cap / currentPrice;
      if (Number.isFinite(estimated) && estimated > 0) {
        shares = estimated;
        console.log(`🧮 Estimated shares for ${ticker} from market_cap: ${Math.round(shares).toLocaleString()}`);
      }
    }

    if (!shares || shares <= 0) {
      console.warn(`⚠️ No shares outstanding found for ${ticker} (shares+market_cap fallback failed), using 0`);
      return 0;
    }

    // Cache the result for 24 hours
    shareCountCache.set(ticker, { shares, timestamp: now });

    console.log(`✅ Fetched shares for ${ticker}: ${shares.toLocaleString()}`);
    return shares;

  } catch (error) {
    console.error(`❌ Error fetching shares for ${ticker}:`, error);

    // Return cached value even if expired as fallback
    if (cached) {
      console.warn(`⚠️ Using expired cached shares for ${ticker}: ${cached.shares.toLocaleString()}`);
      return cached.shares;
    }

    throw error;
  }
}

/**
 * Get previous close from Polygon aggregates with adjusted=true and 24-hour cache
 */
export async function getPreviousClose(ticker: string): Promise<number> {
  const now = Date.now();
  const cached = prevCloseCache.get(ticker);

  // Return cached value if still valid (24-hour cache until midnight ET)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    console.log(`📊 Using cached prevClose for ${ticker}: $${cached.prevClose}`);
    return cached.prevClose;
  }

  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      throw new Error('Polygon API key not configured');
    }

    // Use /v2/aggs/prev?adjusted=true as single source of truth
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${apiKey}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data?.results?.[0]?.c) {
      throw new Error(`No previous close found for ${ticker}`);
    }

    const prevClose = data.results[0].c;

    // Cache the result for 24 hours
    prevCloseCache.set(ticker, { prevClose, timestamp: now });

    // Log len ak nie je v tichom režime (pre API endpointy)
    if (process.env.SILENT_PREVCLOSE_LOGS !== 'true') {
      console.log(`✅ Fetched prevClose for ${ticker}: $${prevClose}`);
    }
    return prevClose;

  } catch (error) {
    console.error(`❌ Error fetching previous close for ${ticker}:`, error);

    // Return cached value even if expired as fallback
    if (cached) {
      console.warn(`⚠️ Using expired cached prevClose for ${ticker}: $${cached.prevClose}`);
      return cached.prevClose;
    }

    throw error;
  }
}

/**
 * Get current price from Polygon snapshot data with robust fallbacks
 */
export function getCurrentPrice(snapshotData: unknown): number {
  const data = snapshotData as { ticker?: { lastTrade?: { p?: number }; min?: { c?: number }; day?: { c?: number }; prevDay?: { c?: number } } };

  // Priority 1: lastTrade.p (most current)
  if (data?.ticker?.lastTrade?.p && data.ticker.lastTrade.p > 0) {
    console.log(`✅ Using lastTrade.p: $${data.ticker.lastTrade.p}`);
    return data.ticker.lastTrade.p;
  }

  // Priority 2: min.c (current minute data)
  if (data?.ticker?.min?.c && data.ticker.min.c > 0) {
    console.log(`✅ Using min.c: $${data.ticker.min.c}`);
    return data.ticker.min.c;
  }

  // Priority 3: day.c (day close - most reliable fallback)
  if (data?.ticker?.day?.c && data.ticker.day.c > 0) {
    console.log(`✅ Using day.c: $${data.ticker.day.c}`);
    return data.ticker.day.c;
  }

  // Priority 4: prevDay.c (previous day close)
  if (data?.ticker?.prevDay?.c && data.ticker.prevDay.c > 0) {
    console.log(`✅ Using prevDay.c: $${data.ticker.prevDay.c}`);
    return data.ticker.prevDay.c;
  }

  // Log the full snapshot data for debugging
  console.error('❌ No valid price found in snapshot data:', JSON.stringify(snapshotData, null, 2));
  throw new Error('No valid price found in snapshot data - all fallbacks exhausted');
}

/**
 * Compute market cap in billions USD using Decimal.js for precision
 */
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

/**
 * Compute market cap difference in billions USD using Decimal.js for precision
 */
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

/**
 * Compute percent change using Decimal.js for precision
 * 
 * If session and regularClose are provided, uses session-aware logic:
 * - Pre-market/Live: vs previousClose (D-1)
 * - After-hours/Closed: vs regularClose (D) if available, else previousClose (D-1)
 * 
 * Otherwise, uses simple calculation vs previousClose (backward compatibility)
 */
export function computePercentChange(
  currentPrice: number,
  prevClose: number,
  session?: 'pre' | 'live' | 'after' | 'closed',
  regularClose?: number | null
): number {
  // If session-aware parameters are provided, use calculatePercentChange logic
  if (session !== undefined) {
    try {
      const { calculatePercentChange } = require('./priceResolver');
      const result = calculatePercentChange(currentPrice, session, prevClose, regularClose || null);
      return Math.round(result.changePct * 100) / 100; // Round to 2 decimal places
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

    return Math.round(result * 100) / 100; // Round to 2 decimal places
  } catch (error) {
    console.error('Error computing percent change:', error);
    throw error;
  }
}

/**
 * Validate price data for extreme changes (possible splits)
 */
export function validatePriceChange(currentPrice: number, prevClose: number): void {
  const percentChange = Math.abs((currentPrice - prevClose) / prevClose) * 100;

  if (percentChange > 40) {
    console.warn(`⚠️ Extreme price change detected: ${percentChange.toFixed(2)}% - possible stock split or data error`);
  }

  if (currentPrice < 0.01 || prevClose < 0.01) {
    throw new Error('Suspiciously low price detected - possible data error');
  }
}

/**
 * Log detailed calculation data for debugging
 */
export function logCalculationData(ticker: string, currentPrice: number, prevClose: number, shares: number, marketCap: number, marketCapDiff: number, percentChange: number): void {
  console.log(`📊 ${ticker} Calculation Details:`);
  console.log(`   Current Price: $${currentPrice}`);
  console.log(`   Previous Close: $${prevClose}`);
  console.log(`   Shares Outstanding: ${shares.toLocaleString()}`);
  console.log(`   Market Cap: $${marketCap}B`);
  console.log(`   Market Cap Diff: $${marketCapDiff}B`);
  console.log(`   Percent Change: ${percentChange >= 0 ? '+' : ''}${percentChange}%`);
  console.log(`   Formula: ($${currentPrice} - $${prevClose}) × ${shares.toLocaleString()} ÷ 1,000,000,000 = $${marketCapDiff}B`);
}

/**
 * Clear all caches (useful for testing)
 */
export function clearAllCaches(): void {
  shareCountCache.clear();
  prevCloseCache.clear();
  console.log('🧹 All caches cleared');
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(): {
  shareCounts: { size: number; entries: Array<{ ticker: string; shares: number; age: number }> };
  prevCloses: { size: number; entries: Array<{ ticker: string; prevClose: number; age: number }> };
} {
  const now = Date.now();

  const shareEntries = Array.from(shareCountCache.entries()).map(([ticker, data]) => ({
    ticker,
    shares: data.shares,
    age: Math.round((now - data.timestamp) / 1000 / 60) // Age in minutes
  }));

  const prevCloseEntries = Array.from(prevCloseCache.entries()).map(([ticker, data]) => ({
    ticker,
    prevClose: data.prevClose,
    age: Math.round((now - data.timestamp) / 1000 / 60) // Age in minutes
  }));

  return {
    shareCounts: {
      size: shareCountCache.size,
      entries: shareEntries
    },
    prevCloses: {
      size: prevCloseCache.size,
      entries: prevCloseEntries
    }
  };
}