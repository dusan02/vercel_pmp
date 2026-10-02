import { redisClient } from '@/lib/redis/client';

/**
 * Backward-compat facade — the actual client lives in @/lib/redis/client.
 * This module used to create a SECOND socket at import time (duplicate
 * connection, leaked handle in tests). Now it only re-exports the shared
 * client and keeps the legacy helper API.
 */

// Cache keys
export const CACHE_KEYS = {
  STOCK_DATA: 'stock_data',
  CACHE_STATUS: 'cache_status',
  LAST_UPDATE: 'last_update',
  STOCK_COUNT: 'stock_count'
} as const;

// Cache TTL (Time To Live) - 5 minutes
export const CACHE_TTL = 300; // seconds

// Helper functions — shared client connects eagerly on import; when it is
// not open (Redis down / still connecting) we degrade to null instead of
// racing a second connect() call.
export async function getCachedData(key: string) {
  try {
    if (!redisClient || !redisClient.isOpen) return null;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data.toString()) : null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

export async function setCachedData(key: string, data: any, ttl: number = CACHE_TTL) {
  try {
    if (!redisClient || !redisClient.isOpen) return false;
    await redisClient.setEx(key, ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
}

export async function deleteCachedData(key: string) {
  try {
    if (!redisClient || !redisClient.isOpen) return false;
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Redis delete error:', error);
    return false;
  }
}

export async function getCacheStatus() {
  try {
    if (!redisClient || !redisClient.isOpen) return null;
    const status = await redisClient.get(CACHE_KEYS.CACHE_STATUS);
    return status ? JSON.parse(status.toString()) : null;
  } catch (error) {
    console.error('Redis status error:', error);
    return null;
  }
}

export async function setCacheStatus(status: any) {
  try {
    if (!redisClient || !redisClient.isOpen) return false;
    await redisClient.setEx(CACHE_KEYS.CACHE_STATUS, CACHE_TTL, JSON.stringify(status));
    return true;
  } catch (error) {
    console.error('Redis status set error:', error);
    return false;
  }
}

export default redisClient;
export { redisClient };

// Re-export from redis/client.ts for backward compatibility
export { checkRedisHealth, getRedisSubscriber } from '@/lib/redis/client';
