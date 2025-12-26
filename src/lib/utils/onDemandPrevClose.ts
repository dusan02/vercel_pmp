/**
 * On-demand previous close fetching with rate limiting and deduplication
 * Production-safe implementation to prevent DDoS and thundering herd
 */

import { redisClient } from '../redis/client';
import { acquireLock, releaseLock, checkTokenBucket } from './redisLocks';
import { getDateET, createETDate } from './dateET';
import { getLastTradingDay } from './timeUtils';
import { logger } from './logger';
import { setPrevClose } from '../redis/operations';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

/**
 * Fetch previous close for a single ticker with rate limiting and deduplication
 * 
 * @param ticker - Stock symbol
 * @param targetDate - Target date (YYYY-MM-DD), defaults to today
 * @param maxLookback - Maximum days to look back (default: 10)
 * @returns Previous close price or null if not found
 */
export async function fetchPreviousCloseOnDemand(
  ticker: string,
  targetDate?: string,
  maxLookback: number = 10
): Promise<number | null> {
  if (!POLYGON_API_KEY) {
    logger.warn('POLYGON_API_KEY not set, cannot fetch previous close');
    return null;
  }

  const today = targetDate || getDateET();
  const cacheKey = `prevClose:ondemand:${today}:${ticker}`;
  const lockKey = `prevclose:ondemand:${ticker}`;

  // 1. Check cache first (O(1))
  try {
    if (redisClient && redisClient.isOpen) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const price = parseFloat(cached);
        if (price > 0) {
          return price;
        }
      }
    }
  } catch (error) {
    logger.warn(`Cache read error for ${ticker}:`, error);
  }

  // 2. Check global rate limit (20 requests per minute)
  // NOTE: This counts per-ticker calls, not outbound API requests
  // Range endpoint = 1 request, fallback day-by-day = up to 10 requests
  // We use conservative limit to account for fallback worst case
  const rateLimitCheck = await checkTokenBucket(
    'ondemand_prevclose',
    20, // max tokens (conservative: assumes range endpoint, worst case = 20 tickers/min)
    20 / 60, // refill rate: 20 tokens per 60 seconds
    60 // window: 60 seconds
  );

  if (!rateLimitCheck.allowed) {
    logger.warn(`Rate limit exceeded for on-demand prevClose, ticker: ${ticker}`);
    return null;
  }

  // 3. Acquire per-ticker lock (prevent thundering herd)
  const lockToken = await acquireLock(lockKey, 30); // 30s TTL
  
  if (!lockToken) {
    // Lock is held by another request - wait briefly and check cache again
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      if (redisClient && redisClient.isOpen) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const price = parseFloat(cached);
          if (price > 0) {
            return price;
          }
        }
      }
    } catch (error) {
      // Ignore cache read errors
    }
    
    // Still no cache - return null (another request is fetching it)
    return null;
  }

  try {
    // 4. Double-check cache after acquiring lock (another request might have fetched it)
    if (redisClient && redisClient.isOpen) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const price = parseFloat(cached);
        if (price > 0) {
          await releaseLock(lockKey, lockToken);
          return price;
        }
      }
    }

    // 5. Fetch from Polygon API
    // Use getLastTradingDay() to find the actual last trading day (more efficient than looping)
    const lastTradingDay = getLastTradingDay(createETDate(today));
    const lastTradingDayStr = getDateET(lastTradingDay);

    // Try to fetch range (last 10 days) in one request if possible
    // Otherwise, fetch day by day starting from last trading day
    const prevClose = await fetchPrevCloseFromPolygon(
      ticker,
      lastTradingDayStr,
      maxLookback
    );

    if (prevClose && prevClose > 0) {
      // 6. Cache result (24h TTL)
      try {
        if (redisClient && redisClient.isOpen) {
          await redisClient.setEx(cacheKey, 86400, prevClose.toString());
          
          // Also save to Redis operations (for consistency with worker)
          await setPrevClose(today, ticker, prevClose);
        }
      } catch (error) {
        logger.warn(`Cache write error for ${ticker}:`, error);
      }

      return prevClose;
    }

    return null;
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}

/**
 * Fetch previous close from Polygon API
 * Tries to use range endpoint first (more efficient), falls back to single day
 * 
 * @param ticker - Stock symbol
 * @param startDate - Start date (YYYY-MM-DD)
 * @param maxLookback - Maximum days to look back
 * @returns Previous close price or null
 */
async function fetchPrevCloseFromPolygon(
  ticker: string,
  startDate: string,
  maxLookback: number
): Promise<number | null> {
  try {
    // Try range endpoint first (more efficient - 1 request instead of 10)
    // This counts as 1 outbound API request
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() - maxLookback);
    const endDateStr = endDate.toISOString().split('T')[0];

    const rangeUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${endDateStr}/${startDate}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    
    const rangeResponse = await fetch(rangeUrl);
    
    if (rangeResponse.ok) {
      const rangeData = await rangeResponse.json();
      
      if (rangeData.results && rangeData.results.length > 0) {
        // Find the most recent valid close (results are sorted by date ascending)
        for (let i = rangeData.results.length - 1; i >= 0; i--) {
          const result = rangeData.results[i];
          if (result.c && result.c > 0) {
            return result.c;
          }
        }
      }
    }

    // Fallback: fetch day by day (if range endpoint didn't work)
    // WARNING: This can make up to maxLookback (10) outbound requests per ticker
    // Rate limiter at ticker level (20/min) is conservative to account for this
    const startDateObj = new Date(startDate);
    
    for (let i = 0; i < maxLookback; i++) {
      const checkDate = new Date(startDateObj);
      checkDate.setDate(checkDate.getDate() - i);
      const checkDateStr = checkDate.toISOString().split('T')[0];

      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${checkDateStr}/${checkDateStr}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          const prevClose = data.results[0].c;
          if (prevClose > 0) {
            return prevClose;
          }
        }
      }

      // Rate limiting: small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return null;
  } catch (error) {
    logger.error(`Error fetching previous close for ${ticker}:`, error);
    return null;
  }
}

/**
 * Batch fetch previous closes for multiple tickers with timeout budget
 * API-safe version: respects timeout budget and max tickers cap
 * 
 * @param tickers - Array of stock symbols
 * @param targetDate - Target date (YYYY-MM-DD)
 * @param options - Options for batch fetch
 * @returns Map of ticker -> previous close price
 */
export async function fetchPreviousClosesBatch(
  tickers: string[],
  targetDate?: string,
  options: {
    maxTickers?: number;        // Cap on number of tickers to fetch (default: 50)
    timeoutBudget?: number;      // Max time in ms to spend on fetching (default: 600ms)
    maxConcurrent?: number;      // Max concurrent fetches (default: 5)
  } = {}
): Promise<Map<string, number>> {
  const {
    maxTickers = 50,
    timeoutBudget = 600,
    maxConcurrent = 5
  } = options;

  const results = new Map<string, number>();
  const today = targetDate || getDateET();
  const startTime = Date.now();

  // Cap tickers to maxTickers (prioritize first N)
  const tickersToFetch = tickers.slice(0, maxTickers);

  // Process in batches to respect rate limits
  for (let i = 0; i < tickersToFetch.length; i += maxConcurrent) {
    // Check timeout budget
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutBudget) {
      logger.warn(`On-demand prevClose batch timeout budget exceeded (${elapsed}ms), stopping early`);
      break;
    }

    const batch = tickersToFetch.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (ticker) => {
      const prevClose = await fetchPreviousCloseOnDemand(ticker, today);
      if (prevClose && prevClose > 0) {
        results.set(ticker, prevClose);
      }
    });

    await Promise.all(batchPromises);

    // Small delay between batches (only if we have time left)
    const elapsedAfterBatch = Date.now() - startTime;
    if (i + maxConcurrent < tickersToFetch.length && elapsedAfterBatch < timeoutBudget - 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Batch fetch previous closes and persist to DB
 * API-safe version with timeout budget and DB persistence
 * 
 * @param tickers - Array of stock symbols
 * @param targetDate - Target date (YYYY-MM-DD)
 * @param options - Options for batch fetch
 * @returns Map of ticker -> previous close price
 */
export async function fetchPreviousClosesBatchAndPersist(
  tickers: string[],
  targetDate?: string,
  options: {
    maxTickers?: number;
    timeoutBudget?: number;
    maxConcurrent?: number;
  } = {}
): Promise<Map<string, number>> {
  const results = await fetchPreviousClosesBatch(tickers, targetDate, options);
  const today = targetDate || getDateET();

  // Persist successful results to DB
  if (results.size > 0) {
    try {
      const { prisma } = await import('@/lib/db/prisma');
      const dateObj = createETDate(today);
      const lastTradingDay = getLastTradingDay(dateObj);

      const persistPromises = Array.from(results.entries()).map(async ([ticker, prevClose]) => {
        try {
          // Save to DailyRef
          await prisma.dailyRef.upsert({
            where: {
              symbol_date: {
                symbol: ticker,
                date: lastTradingDay
              }
            },
            update: {
              previousClose: prevClose,
              updatedAt: new Date()
            },
            create: {
              symbol: ticker,
              date: lastTradingDay,
              previousClose: prevClose
            }
          });

          // Update Ticker.latestPrevClose
          await prisma.ticker.update({
            where: { symbol: ticker },
            data: {
              latestPrevClose: prevClose,
              latestPrevCloseDate: lastTradingDay,
              updatedAt: new Date()
            }
          });
        } catch (error) {
          logger.warn(`Failed to persist prevClose for ${ticker}:`, error);
        }
      });

      await Promise.all(persistPromises);
      logger.info(`Persisted ${results.size} previous closes to DB`);
    } catch (error) {
      logger.error('Error persisting previous closes to DB:', error);
    }
  }

  return results;
}

