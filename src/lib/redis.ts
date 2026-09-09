import { createClient } from 'redis';

// Redis client configuration
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis connection failed after 10 retries');
        return false;
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

// Connect to Redis
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redisClient.on('ready', () => {
  console.log('✅ Redis ready for operations');
});

// Initialize connection
if (!redisClient.isOpen) {
  redisClient.connect().catch(console.error);
}

// Cache keys
export const CACHE_KEYS = {
  STOCK_DATA: 'stock_data',
  CACHE_STATUS: 'cache_status',
  LAST_UPDATE: 'last_update',
  STOCK_COUNT: 'stock_count'
} as const;

// Cache TTL (Time To Live) - 5 minutes
export const CACHE_TTL = 300; // seconds

// Helper functions
export async function getCachedData(key: string) {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    const data = await redisClient.get(key);
    return data ? JSON.parse(data.toString()) : null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

export async function setCachedData(key: string, data: any, ttl: number = CACHE_TTL) {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    await redisClient.setEx(key, ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
}

export async function deleteCachedData(key: string) {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Redis delete error:', error);
    return false;
  }
}

export async function getCacheStatus() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    const status = await redisClient.get(CACHE_KEYS.CACHE_STATUS);
    return status ? JSON.parse(status.toString()) : null;
  } catch (error) {
    console.error('Redis status error:', error);
    return null;
  }
}

export async function setCacheStatus(status: any) {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
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