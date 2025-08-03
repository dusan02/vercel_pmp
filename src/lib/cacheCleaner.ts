import { redisClient } from './redis';
import { getCacheConfig } from './envConfig';

interface CacheCleanerOptions {
  maxAge: number; // Maximum age in seconds
  batchSize: number; // Number of keys to process per batch
  interval: number; // Cleanup interval in milliseconds
}

/**
 * Cache cleaner for removing outdated data
 */
export class CacheCleaner {
  private options: CacheCleanerOptions;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(options: Partial<CacheCleanerOptions> = {}) {
    this.options = {
      maxAge: 24 * 60 * 60, // 24 hours default
      batchSize: 100,
      interval: 60 * 60 * 1000, // 1 hour default
      ...options
    };
  }

  /**
   * Start the cache cleaner
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Cache cleaner is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting cache cleaner...');

    // Run initial cleanup
    this.cleanup();

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, this.options.interval);
  }

  /**
   * Stop the cache cleaner
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Cache cleaner is not running');
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log('🛑 Cache cleaner stopped');
  }

  /**
   * Perform cleanup of outdated cache entries
   */
  private async cleanup() {
    try {
      if (!redisClient || !redisClient.isOpen) {
        console.log('⚠️ Redis not available, skipping cache cleanup');
        return;
      }

      console.log('🧹 Starting cache cleanup...');
      const config = getCacheConfig();
      const cutoffTime = Date.now() - (this.options.maxAge * 1000);
      let cleanedCount = 0;

      // Get all cache keys
      const keys = await redisClient.keys('*');
      const outdatedKeys: string[] = [];

      // Check each key for age
      for (const key of keys) {
        try {
          const ttl = await redisClient.ttl(key);
          if (ttl === -1) { // No expiration set
            const exists = await redisClient.exists(key);
            if (exists) {
              // For keys without TTL, we'll keep them for now
              // You could add additional logic here to check last access time
              continue;
            }
          } else if (ttl > this.options.maxAge) {
            outdatedKeys.push(key);
          }
        } catch (error) {
          console.error(`Error checking key ${key}:`, error);
        }
      }

      // Delete outdated keys in batches
      for (let i = 0; i < outdatedKeys.length; i += this.options.batchSize) {
        const batch = outdatedKeys.slice(i, i + this.options.batchSize);
        if (batch.length > 0) {
          await redisClient.del(batch);
          cleanedCount += batch.length;
        }
      }

      console.log(`✅ Cache cleanup completed: ${cleanedCount} keys removed`);

    } catch (error) {
      console.error('❌ Cache cleanup error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      if (!redisClient || !redisClient.isOpen) {
        return { error: 'Redis not available' };
      }

      const keys = await redisClient.keys('*');
      const stats = {
        totalKeys: keys.length,
        memoryUsage: await redisClient.memoryUsage(),
        info: await redisClient.info('memory'),
        timestamp: new Date().toISOString()
      };

      return stats;
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

// Global cache cleaner instance
export const cacheCleaner = new CacheCleaner();

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  cacheCleaner.start();
}

// Graceful shutdown
process.on('SIGTERM', () => {
  cacheCleaner.stop();
});

process.on('SIGINT', () => {
  cacheCleaner.stop();
}); 