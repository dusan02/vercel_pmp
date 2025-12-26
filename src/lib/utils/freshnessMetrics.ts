/**
 * Freshness metrics for tracking data freshness
 * Uses Redis hash for O(1) access even with 600+ tickers
 */

import { redisClient } from '../redis/client';
import { logger } from './logger';

export interface FreshnessMetrics {
  fresh: number;      // < 2 min
  recent: number;      // 2-5 min
  stale: number;      // 5-15 min
  veryStale: number;  // > 15 min
  total: number;
  percentage: {
    fresh: number;
    recent: number;
    stale: number;
    veryStale: number;
  };
  agePercentiles?: {
    p50: number;  // Median age in minutes
    p90: number;  // 90th percentile age in minutes
    p99: number;  // 99th percentile age in minutes
  };
}

/**
 * Update freshness timestamp for a ticker
 * Uses Redis hash for efficient batch operations
 * 
 * @param ticker - Stock symbol
 * @param timestamp - Last update timestamp (default: now)
 */
export async function updateFreshnessTimestamp(
  ticker: string,
  timestamp: number = Date.now()
): Promise<void> {
  if (!redisClient || !redisClient.isOpen) {
    return;
  }

  try {
    const hashKey = 'freshness:last_update';
    await redisClient.hSet(hashKey, ticker, timestamp.toString());
    
    // Set expiration on hash (24h) - only set once per day
    const ttl = await redisClient.ttl(hashKey);
    if (ttl === -1) {
      await redisClient.expire(hashKey, 86400); // 24h
    }
  } catch (error) {
    logger.warn(`Error updating freshness timestamp for ${ticker}:`, error);
  }
}

/**
 * Batch update freshness timestamps
 * More efficient than individual updates
 * 
 * @param updates - Map of ticker -> timestamp
 */
export async function updateFreshnessTimestampsBatch(
  updates: Map<string, number>
): Promise<void> {
  if (!redisClient || !redisClient.isOpen) {
    return;
  }

  try {
    const hashKey = 'freshness:last_update';
    const fields: Record<string, string> = {};
    
    updates.forEach((timestamp, ticker) => {
      fields[ticker] = timestamp.toString();
    });

    if (Object.keys(fields).length > 0) {
      await redisClient.hSet(hashKey, fields);
      
      // Set expiration on hash (24h)
      const ttl = await redisClient.ttl(hashKey);
      if (ttl === -1) {
        await redisClient.expire(hashKey, 86400);
      }
    }
  } catch (error) {
    logger.warn('Error batch updating freshness timestamps:', error);
  }
}

/**
 * Get freshness metrics for all tickers or a subset
 * Uses single HGETALL for O(1) access
 * 
 * @param tickers - Optional: specific tickers to check (default: all)
 * @returns Freshness metrics
 */
export async function getFreshnessMetrics(
  tickers?: string[]
): Promise<FreshnessMetrics> {
  const now = Date.now();
  let fresh = 0, recent = 0, stale = 0, veryStale = 0;

  if (!redisClient || !redisClient.isOpen) {
    return {
      fresh: 0,
      recent: 0,
      stale: 0,
      veryStale: 0,
      total: tickers?.length || 0,
      percentage: {
        fresh: 0,
        recent: 0,
        stale: 0,
        veryStale: 0
      }
    };
  }

  try {
    const hashKey = 'freshness:last_update';
    
    let timestamps: Record<string, string>;
    
    if (tickers && tickers.length > 0) {
      // Fetch only specific tickers (HMGET) - ensures we only count current universe
      const values = await redisClient.hmGet(hashKey, tickers);
      timestamps = {};
      tickers.forEach((ticker, index) => {
        if (values[index]) {
          timestamps[ticker] = values[index];
        }
      });
      // Total = number of tickers with timestamps (missing = tickers.length - total)
    } else {
      // Fetch all (HGETALL) - may include old tickers not in current universe
      // For accurate metrics, prefer passing tickers array
      timestamps = await redisClient.hGetAll(hashKey);
    }

    // Total = number of tickers with valid timestamps
    // Missing = tickers.length - total (if tickers provided)
    const total = Object.keys(timestamps).length;
    const ages: number[] = []; // For percentile calculation

    for (const [ticker, timestampStr] of Object.entries(timestamps)) {
      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        veryStale++;
        continue;
      }

      const ageMs = now - timestamp;
      const ageMin = ageMs / (60 * 1000);
      ages.push(ageMin); // Collect for percentiles

      if (ageMin < 2) {
        fresh++;
      } else if (ageMin < 5) {
        recent++;
      } else if (ageMin < 15) {
        stale++;
      } else {
        veryStale++;
      }
    }

    const percentage = total > 0 ? {
      fresh: (fresh / total) * 100,
      recent: (recent / total) * 100,
      stale: (stale / total) * 100,
      veryStale: (veryStale / total) * 100
    } : {
      fresh: 0,
      recent: 0,
      stale: 0,
      veryStale: 0
    };

    // Calculate age percentiles (P50, P90, P99)
    let agePercentiles: { p50: number; p90: number; p99: number } | undefined;
    if (ages.length > 0) {
      const sortedAges = ages.sort((a, b) => a - b);
      const p50Index = Math.min(Math.floor(sortedAges.length * 0.5), sortedAges.length - 1);
      const p90Index = Math.min(Math.floor(sortedAges.length * 0.9), sortedAges.length - 1);
      const p99Index = Math.min(Math.floor(sortedAges.length * 0.99), sortedAges.length - 1);
      
      agePercentiles = {
        p50: Math.round((sortedAges[p50Index] ?? 0) * 100) / 100,
        p90: Math.round((sortedAges[p90Index] ?? 0) * 100) / 100,
        p99: Math.round((sortedAges[p99Index] ?? 0) * 100) / 100
      };
    }

    const result: FreshnessMetrics = {
      fresh,
      recent,
      stale,
      veryStale,
      total,
      percentage
    };
    
    if (agePercentiles) {
      result.agePercentiles = agePercentiles;
    }
    
    return result;
  } catch (error) {
    logger.error('Error getting freshness metrics:', error);
    return {
      fresh: 0,
      recent: 0,
      stale: 0,
      veryStale: 0,
      total: tickers?.length || 0,
      percentage: {
        fresh: 0,
        recent: 0,
        stale: 0,
        veryStale: 0
      }
    };
  }
}

/**
 * Get freshness timestamp for a specific ticker
 * 
 * @param ticker - Stock symbol
 * @returns Timestamp or null if not found
 */
export async function getFreshnessTimestamp(ticker: string): Promise<number | null> {
  if (!redisClient || !redisClient.isOpen) {
    return null;
  }

  try {
    const hashKey = 'freshness:last_update';
    const timestampStr = await redisClient.hGet(hashKey, ticker);
    
    if (timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      return isNaN(timestamp) ? null : timestamp;
    }
    
    return null;
  } catch (error) {
    logger.warn(`Error getting freshness timestamp for ${ticker}:`, error);
    return null;
  }
}

