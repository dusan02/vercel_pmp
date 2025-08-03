import { createClient } from 'redis';

// Redis client configuration with fallback to in-memory cache
let redisClient: any = null;
let inMemoryCache = new Map();
let cacheTimestamps = new Map();

// Check if we're in a serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Initialize Redis client for both serverless and non-serverless environments
try {
  // Use Upstash Redis if available
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redisUrl = `redis://default:${process.env.UPSTASH_REDIS_REST_TOKEN}@${process.env.UPSTASH_REDIS_REST_URL.replace('https://', '')}:6379`;
    
    console.log('🔍 Using Upstash Redis');
    console.log('🔍 Environment check:', {
      UPSTASH_REDIS_REST_URL: 'SET',
      UPSTASH_REDIS_REST_TOKEN: 'SET'
    });
      
    redisClient = createClient({
      url: redisUrl,
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
      redisClient.connect().catch((err: any) => {
        console.log('⚠️ Redis not available, using in-memory cache');
        redisClient = null;
      });
    }
  } else {
    console.log('⚠️ Upstash Redis not configured, using in-memory cache');
    redisClient = null;
  }
} catch (error) {
  console.log('⚠️ Redis not available, using in-memory cache');
  redisClient = null;
}

// Cache keys
export const CACHE_KEYS = {
  STOCK_DATA: 'stock_data',
  CACHE_STATUS: 'cache_status',
  LAST_UPDATE: 'last_update',
  STOCK_COUNT: 'stock_count'
} as const;

// Cache TTL (Time To Live) - 2 minutes
export const CACHE_TTL = 120; // seconds

// Helper functions with fallback to in-memory cache
export async function getCachedData(key: string) {
  try {
    if (redisClient && redisClient.isOpen) {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data.toString()) : null;
    } else {
      // Use in-memory cache as fallback
      const data = inMemoryCache.get(key);
      const timestamp = cacheTimestamps.get(key);
      if (data && timestamp && Date.now() - timestamp < CACHE_TTL * 1000) {
        return data;
      }
      return null;
    }
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export async function setCachedData(key: string, data: any, ttl: number = CACHE_TTL) {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.setEx(key, ttl, JSON.stringify(data));
    } else {
      // Use in-memory cache as fallback
      inMemoryCache.set(key, data);
      cacheTimestamps.set(key, Date.now());
    }
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
}

export async function deleteCachedData(key: string) {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.del(key);
    } else {
      // Use in-memory cache as fallback
      inMemoryCache.delete(key);
      cacheTimestamps.delete(key);
    }
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
}

// Helper function to generate cache keys with project prefix
export function getCacheKey(project: string, ticker: string, type: string = 'price'): string {
  return `${type}:${project}:${ticker}`;
}

// Helper function to get all cache keys for a project
export function getProjectCacheKeys(project: string, type: string = 'price'): string {
  return `${type}:${project}:*`;
}

// Health check function
export async function checkRedisHealth(): Promise<{ status: 'healthy' | 'unhealthy'; message: string }> {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.ping();
      return { status: 'healthy', message: 'Redis is connected and responding' };
    } else {
      return { status: 'unhealthy', message: 'Redis is not connected, using in-memory cache' };
    }
  } catch (error) {
    return { status: 'unhealthy', message: `Redis health check failed: ${error}` };
  }
} 