import { redisOps } from './enhancedOperations';
import { REDIS_KEYS, REDIS_TTL } from './keys';
import { PriceData } from '../types';

/**
 * Enhanced Redis operations with automatic fallback to localStorage
 * Maintains backward compatibility while adding resilience
 */

// --- Atomic Operations ---

/**
 * Atomically update last price and heatmap with fallback
 */
export async function atomicUpdatePrice(
    session: 'pre' | 'live' | 'after',
    symbol: string,
    data: PriceData,
    changePct: number
): Promise<boolean> {
    try {
        const key = REDIS_KEYS.last(session, symbol);
        const stockDataKey = REDIS_KEYS.stockData(symbol);
        const heatmapKey = REDIS_KEYS.heatmap(session);
        const ttl = session === 'live' ? REDIS_TTL.LIVE : REDIS_TTL.PRE_AFTER;
        const score = Math.round(changePct * 10000);

        // Validate inputs
        if (!symbol || !data || typeof changePct !== 'number' || !isFinite(changePct)) {
            console.error(`❌ Invalid inputs for atomic update ${symbol}:`, { symbol, data, changePct });
            return false;
        }

        // Use enhanced Redis operations with fallback
        const operations = [
            { type: 'setEx', key, args: [ttl, JSON.stringify(data)] },
            { type: 'setEx', key: stockDataKey, args: [ttl, JSON.stringify(data)] },
        ];

        const multiSuccess = await redisOps.multi(operations);
        
        if (multiSuccess) {
            // Handle ZAdd separately
            const zAddSuccess = await redisOps.zAdd(heatmapKey, [{ score, value: symbol }]);
            return zAddSuccess;
        }

        return false;
    } catch (error) {
        console.error(`❌ Error in enhanced atomic update for ${symbol}:`, error);
        return false;
    }
}

/**
 * Set last price for a symbol in a session with fallback
 */
export async function setLast(
    session: 'pre' | 'live' | 'after',
    symbol: string,
    data: PriceData
): Promise<boolean> {
    try {
        const key = REDIS_KEYS.last(session, symbol);
        const ttl = session === 'live' ? REDIS_TTL.LIVE : REDIS_TTL.PRE_AFTER;
        
        return await redisOps.setEx(key, ttl, JSON.stringify(data));
    } catch (error) {
        console.error(`❌ Error in enhanced setLast for ${symbol}:`, error);
        return false;
    }
}

/**
 * Get last price for a symbol in a session with fallback
 */
export async function getLast(
    session: 'pre' | 'live' | 'after',
    symbol: string
): Promise<PriceData | null> {
    try {
        const key = REDIS_KEYS.last(session, symbol);
        const data = await redisOps.get(key);
        
        if (data) {
            return JSON.parse(data) as PriceData;
        }
        
        return null;
    } catch (error) {
        console.error(`❌ Error in enhanced getLast for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get heatmap data for a session with fallback
 */
export async function getHeatmap(
    session: 'pre' | 'live' | 'after',
    start = 0,
    stop = -1
): Promise<{ score: number; value: string }[]> {
    try {
        const key = REDIS_KEYS.heatmap(session);
        return await redisOps.zRange(key, start, stop);
    } catch (error) {
        console.error(`❌ Error in enhanced getHeatmap for ${session}:`, error);
        return [];
    }
}

/**
 * Set previous close with fallback
 */
export async function setPrevClose(
    date: string,
    symbol: string,
    prevClose: number
): Promise<boolean> {
    try {
        const key = `${REDIS_KEYS.prevclose(date)}:${symbol}`;
        return await redisOps.setEx(key, REDIS_TTL.PREVCLOSE, JSON.stringify(prevClose));
    } catch (error) {
        console.error(`❌ Error in enhanced setPrevClose for ${symbol}:`, error);
        return false;
    }
}

/**
 * Get previous close for multiple symbols with fallback
 */
export async function getPrevClose(
    date: string,
    symbols: string[]
): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    
    try {
        // Get each symbol's previous close
        for (const symbol of symbols) {
            const key = `${REDIS_KEYS.prevclose(date)}:${symbol}`;
            const data = await redisOps.get(key);
            
            if (data) {
                const prevClose = JSON.parse(data) as number;
                if (typeof prevClose === 'number' && isFinite(prevClose)) {
                    result.set(symbol, prevClose);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error in enhanced getPrevClose:', error);
    }
    
    return result;
}

/**
 * Delete keys with fallback cleanup
 */
export async function del(keys: string[]): Promise<boolean> {
    try {
        let success = true;
        
        for (const key of keys) {
            const result = await redisOps.del(key);
            if (!result) {
                success = false;
            }
        }
        
        return success;
    } catch (error) {
        console.error('❌ Error in enhanced del:', error);
        return false;
    }
}

/**
 * Get Redis status with fallback info
 */
export async function getRedisStatus(): Promise<{
    redis: boolean;
    fallback: boolean;
    lastCheck: number;
    message: string;
}> {
    try {
        const status = await redisOps.getStatus();
        
        let message = 'All systems operational';
        if (!status.redis) {
            message = 'Redis unavailable, using localStorage fallback';
        }
        
        return {
            ...status,
            message
        };
    } catch (error) {
        console.error('❌ Error getting Redis status:', error);
        return {
            redis: false,
            fallback: true,
            lastCheck: Date.now(),
            message: 'Error checking Redis status'
        };
    }
}

/**
 * Clear all cache (both Redis and fallback)
 */
export async function clearAllCache(): Promise<boolean> {
    try {
        // Clear Redis (if available)
        const { redisClient } = await import('./client');
        if (redisClient && redisClient.isOpen) {
            try {
                await redisClient.flushDb();
            } catch (error) {
                console.warn('⚠️ Failed to clear Redis:', error);
            }
        }
        
        // Clear fallback storage
        if (typeof localStorage !== 'undefined') {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('redis_fallback_')) {
                    localStorage.removeItem(key);
                }
            });
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error clearing cache:', error);
        return false;
    }
}

/**
 * Initialize enhanced Redis operations
 * This should be called once at application startup
 */
export async function initializeEnhancedRedis(): Promise<void> {
    try {
        // Clean up any expired fallback entries
        redisOps.cleanupExpiredFallbacks();
        
        // Check Redis status
        const status = await getRedisStatus();
        console.log(`🔗 Redis Status: ${status.message}`);
        
        // Log fallback usage if Redis is down
        if (!status.redis) {
            console.warn('⚠️ Running in fallback mode - some features may be limited');
        }
    } catch (error) {
        console.error('❌ Failed to initialize enhanced Redis:', error);
    }
}

// Export the enhanced operations for direct use if needed
export { redisOps };

// --- Legacy exports for backward compatibility ---

/**
 * Get universe set (fallback to empty array if Redis unavailable)
 */
export async function getUniverse(type: string): Promise<string[]> {
  try {
    const { redisClient } = await import('./client');
    if (redisClient && redisClient.isOpen) {
      const key = REDIS_KEYS.universe(type);
      return await redisClient.sMembers(key);
    }
    return [];
  } catch (error) {
    console.warn(`⚠️ Failed to get universe ${type}:`, error);
    return [];
  }
}

/**
 * Add to universe set
 */
export async function addToUniverse(type: string, symbols: string[]): Promise<boolean> {
  try {
    const { redisClient } = await import('./client');
    if (redisClient && redisClient.isOpen) {
      const key = REDIS_KEYS.universe(type);
      await redisClient.sAdd(key, symbols);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`⚠️ Failed to add to universe ${type}:`, error);
    return false;
  }
}

/**
 * Publish tick to Redis Pub/Sub
 */
export async function publishTick(symbol: string, session: string, data: any): Promise<boolean> {
  try {
    const { redisClient } = await import('./client');
    if (redisClient && redisClient.isOpen) {
      const channel = `tick:${session}`;
      await redisClient.publish(channel, JSON.stringify({ symbol, ...data }));
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`⚠️ Failed to publish tick ${symbol}:`, error);
    return false;
  }
}

/**
 * Get cached data
 */
export async function getCachedData(key: string): Promise<any | null> {
  try {
    const data = await redisOps.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn(`⚠️ Failed to get cached data ${key}:`, error);
    return null;
  }
}

/**
 * Set cached data
 */
export async function setCachedData(key: string, data: any, ttl?: number): Promise<boolean> {
  try {
    const ttlToUse = ttl || REDIS_TTL.LIVE;
    return await redisOps.setEx(key, ttlToUse, JSON.stringify(data));
  } catch (error) {
    console.warn(`⚠️ Failed to set cached data ${key}:`, error);
    return false;
  }
}

/**
 * Multi-get JSON data from multiple keys
 */
export async function mGetJsonMap<T>(keys: string[]): Promise<Map<string, T | null>> {
  const result = new Map<string, T | null>();
  
  try {
    for (const key of keys) {
      const data = await redisOps.get(key);
      result.set(key, data ? JSON.parse(data) : null);
    }
  } catch (error) {
    console.warn('⚠️ Failed to mGetJsonMap:', error);
  }
  
  return result;
}
