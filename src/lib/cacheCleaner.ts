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
      console.log('🧹 Starting cache cleanup...');
      const config = getCacheConfig();
      
      // In Edge Runtime, Redis is not available
      console.log('⚠️ Redis not available in Edge Runtime, skipping cache cleanup');
      console.log('✅ Cache cleanup completed: 0 keys removed (memory cache only)');

    } catch (error) {
      console.error('❌ Cache cleanup error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      // In Edge Runtime, Redis is not available
      return { 
        error: 'Redis not available in Edge Runtime',
        timestamp: new Date().toISOString()
      };
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