import { stockDataCache } from './cache';
import { setCachedData, getCachedData } from './redis';
import { dbHelpers } from './database';
import { 
  updateBackgroundServiceStatus, 
  recordBackgroundUpdate, 
  recordBackgroundError 
} from './prometheus';

interface BackgroundServiceConfig {
  updateInterval: number; // milliseconds
  batchSize: number;
  maxRetries: number;
  retryDelay: number;
}

class BackgroundDataService {
  private cache: typeof stockDataCache;
  private config: BackgroundServiceConfig;
  private isRunning: boolean = false;
  private updateTimer?: NodeJS.Timeout;
  private lastUpdateTime: Date = new Date();
  private updateCount: number = 0;
  private errorCount: number = 0;

  constructor(cache: typeof stockDataCache, config: BackgroundServiceConfig) {
    this.cache = cache;
    this.config = config;
  }

  /**
   * Start the background service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('🔄 Background service is already running');
      return;
    }

    console.log('🚀 Starting background data service...');
    this.isRunning = true;
    updateBackgroundServiceStatus(true);

    // Initial update
    await this.performUpdate();

    // Schedule regular updates
    this.scheduleNextUpdate();

    console.log(`✅ Background service started - updates every ${this.config.updateInterval / 1000}s`);
  }

  /**
   * Stop the background service
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('🔄 Background service is not running');
      return;
    }

    console.log('🛑 Stopping background service...');
    this.isRunning = false;
    updateBackgroundServiceStatus(false);

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = undefined;
    }

    console.log('✅ Background service stopped');
  }

  /**
   * Schedule the next update
   */
  private scheduleNextUpdate(): void {
    if (!this.isRunning) return;

    this.updateTimer = setTimeout(async () => {
      await this.performUpdate();
      this.scheduleNextUpdate();
    }, this.config.updateInterval);
  }

  /**
   * Perform a single update cycle
   */
  private async performUpdate(): Promise<void> {
    const startTime = Date.now();
    console.log(`🔄 Starting background update #${++this.updateCount} at ${new Date().toISOString()}`);

    try {
      // Update cache with new data
      await this.cache.updateCache();

      // Update last update time
      this.lastUpdateTime = new Date();

      // Store update status in Redis
      await this.storeUpdateStatus({
        lastUpdate: this.lastUpdateTime.toISOString(),
        updateCount: this.updateCount,
        errorCount: this.errorCount,
        isRunning: this.isRunning,
        nextUpdate: new Date(Date.now() + this.config.updateInterval).toISOString()
      });

      const duration = Date.now() - startTime;
      console.log(`✅ Background update completed in ${duration}ms`);
      recordBackgroundUpdate(); // Duration will be set by withMetrics

    } catch (error) {
      this.errorCount++;
      console.error('❌ Background update failed:', error);
      recordBackgroundError(error.message || 'Unknown error');

      // Store error status
      await this.storeUpdateStatus({
        lastUpdate: this.lastUpdateTime.toISOString(),
        updateCount: this.updateCount,
        errorCount: this.errorCount,
        isRunning: this.isRunning,
        lastError: error instanceof Error ? error.message : String(error),
        nextUpdate: new Date(Date.now() + this.config.updateInterval).toISOString()
      });

      // Retry logic
      if (this.errorCount <= this.config.maxRetries) {
        console.log(`🔄 Retrying in ${this.config.retryDelay}ms (attempt ${this.errorCount}/${this.config.maxRetries})`);
        setTimeout(() => this.performUpdate(), this.config.retryDelay);
      } else {
        console.error('❌ Max retries exceeded, stopping background service');
        this.stop();
      }
    }
  }

  /**
   * Store update status in cache
   */
  private async storeUpdateStatus(status: {
    lastUpdate: string;
    updateCount: number;
    errorCount: number;
    isRunning: boolean;
    lastError?: string;
    nextUpdate: string;
  }): Promise<void> {
    try {
      await setCachedData('background_service_status', status, 300); // 5 minutes TTL
    } catch (error) {
      console.error('Failed to store background service status:', error);
    }
  }

  /**
   * Get current service status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    lastUpdate: string;
    updateCount: number;
    errorCount: number;
    nextUpdate: string;
    lastError?: string;
  } | null> {
    try {
      const status = await getCachedData('background_service_status');
      return status;
    } catch (error) {
      console.error('Failed to get background service status:', error);
      return null;
    }
  }

  /**
   * Force an immediate update
   */
  async forceUpdate(): Promise<void> {
    console.log('🔄 Forcing immediate background update...');
    await this.performUpdate();
  }

  /**
   * Get service statistics
   */
  getStats(): {
    isRunning: boolean;
    updateCount: number;
    errorCount: number;
    lastUpdateTime: Date;
    config: BackgroundServiceConfig;
  } {
    return {
      isRunning: this.isRunning,
      updateCount: this.updateCount,
      errorCount: this.errorCount,
      lastUpdateTime: this.lastUpdateTime,
      config: this.config
    };
  }
}

// Default configuration
const DEFAULT_CONFIG: BackgroundServiceConfig = {
  updateInterval: 2 * 60 * 1000, // 2 minúty (optimálny pomer: výkon + cena)
  batchSize: 50,
  maxRetries: 3,
  retryDelay: 30 * 1000 // 30 seconds
};

// Create singleton instance
let backgroundService: BackgroundDataService | null = null;

export function createBackgroundService(cache: typeof stockDataCache, config?: Partial<BackgroundServiceConfig>): BackgroundDataService {
  if (!backgroundService) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    backgroundService = new BackgroundDataService(cache, finalConfig);
  }
  return backgroundService;
}

export function getBackgroundService(): BackgroundDataService | null {
  return backgroundService;
}

export { BackgroundDataService };
export type { BackgroundServiceConfig }; 