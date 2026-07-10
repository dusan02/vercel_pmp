/**
 * Redis Cache Utilities
 * Shared functions for clearing and managing Redis cache
 */

import { getDateET } from './dateET';

/**
 * Clear Redis cache for previous closes
 * Used by both cron jobs and manual scripts
 */
export async function clearRedisPrevCloseCache(): Promise<void> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (redisClient && redisClient.isOpen) {
      const today = getDateET();
      const { REDIS_KEYS } = await import('@/lib/redis/keys');
      const key = REDIS_KEYS.prevclose(today);
      
      // Delete the hash key
      const deleted = await redisClient.del(key);
      if (deleted > 0) {
        console.log(`✅ Cleared Redis previous close cache for ${today}`);
      } else {
        console.log('ℹ️  No Redis previous close cache entries found for today');
      }
      
      // Also try to clear yesterday's cache (in case it's still there)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      if (yesterdayStr) {
        const yesterdayKey = REDIS_KEYS.prevclose(yesterdayStr);
        await redisClient.del(yesterdayKey);
      }
    } else {
      console.log('⚠️  Redis not available - skipping Redis cache clear');
    }
  } catch (error) {
    console.warn('⚠️  Failed to clear Redis cache:', error);
  }
}
