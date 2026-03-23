import { redisClient } from './client';
import { safeGetItem, safeSetItem } from '@/lib/utils/safeStorage';

// Local storage fallback keys
const CACHE_PREFIX = 'redis_fallback_';
const FALLBACK_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheOptions {
  ttl?: number;
  useFallback?: boolean;
}

/**
 * Enhanced Redis operations with automatic fallback to localStorage
 */
export class EnhancedRedisOperations {
  private static instance: EnhancedRedisOperations;
  private isRedisAvailable: boolean = true;
  private lastRedisCheck: number = 0;
  private readonly REDIS_CHECK_INTERVAL = 30 * 1000; // 30 seconds

  static getInstance(): EnhancedRedisOperations {
    if (!EnhancedRedisOperations.instance) {
      EnhancedRedisOperations.instance = new EnhancedRedisOperations();
    }
    return EnhancedRedisOperations.instance;
  }

  private async checkRedisHealth(): Promise<boolean> {
    try {
      if (!redisClient || !redisClient.isOpen) {
        return false;
      }
      
      // Simple ping test
      await redisClient.ping();
      return true;
    } catch (error) {
      console.warn('⚠️ Redis health check failed:', error);
      return false;
    }
  }

  private async ensureRedisAvailable(): Promise<boolean> {
    const now = Date.now();
    
    // Check Redis health periodically
    if (now - this.lastRedisCheck > this.REDIS_CHECK_INTERVAL) {
      this.isRedisAvailable = await this.checkRedisHealth();
      this.lastRedisCheck = now;
    }
    
    return this.isRedisAvailable;
  }

  private getFallbackKey(key: string): string {
    return `${CACHE_PREFIX}${key}`;
  }

  /**
   * Set value with automatic fallback
   */
  async setEx(key: string, ttl: number, value: string, options: CacheOptions = {}): Promise<boolean> {
    const { useFallback = true } = options;
    
    try {
      const redisAvailable = await this.ensureRedisAvailable();
      
      if (redisAvailable) {
        await redisClient.setEx(key, ttl, value);
        
        // Also set in localStorage as backup
        if (useFallback) {
          safeSetItem(this.getFallbackKey(key), JSON.stringify({
            value,
            expires: Date.now() + (ttl * 1000)
          }));
        }
        
        return true;
      }
    } catch (error) {
      console.warn(`⚠️ Redis set failed for ${key}, using fallback:`, error);
    }
    
    // Fallback to localStorage
    if (useFallback) {
      try {
        safeSetItem(this.getFallbackKey(key), JSON.stringify({
          value,
          expires: Date.now() + (ttl * 1000)
        }));
        return true;
      } catch (fallbackError) {
        console.error(`❌ Fallback set failed for ${key}:`, fallbackError);
      }
    }
    
    return false;
  }

  /**
   * Get value with automatic fallback
   */
  async get(key: string, options: CacheOptions = {}): Promise<string | null> {
    const { useFallback = true } = options;
    
    // Try Redis first
    try {
      const redisAvailable = await this.ensureRedisAvailable();
      
      if (redisAvailable) {
        const value = await redisClient.get(key);
        if (value !== null) {
          return value;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Redis get failed for ${key}, trying fallback:`, error);
    }
    
    // Fallback to localStorage
    if (useFallback) {
      try {
        const fallbackData = safeGetItem(this.getFallbackKey(key));
        if (fallbackData) {
          const parsed = JSON.parse(fallbackData);
          
          // Check if expired
          if (parsed.expires && Date.now() > parsed.expires) {
            safeSetItem(this.getFallbackKey(key), null as any); // Clean up expired
            return null;
          }
          
          return parsed.value;
        }
      } catch (fallbackError) {
        console.error(`❌ Fallback get failed for ${key}:`, fallbackError);
      }
    }
    
    return null;
  }

  /**
   * Delete with fallback cleanup
   */
  async del(key: string, options: CacheOptions = {}): Promise<boolean> {
    const { useFallback = true } = options;
    
    try {
      const redisAvailable = await this.ensureRedisAvailable();
      
      if (redisAvailable) {
        await redisClient.del(key);
      }
    } catch (error) {
      console.warn(`⚠️ Redis del failed for ${key}:`, error);
    }
    
    // Clean up fallback
    if (useFallback) {
      try {
        safeSetItem(this.getFallbackKey(key), null as any);
      } catch (fallbackError) {
        console.error(`❌ Fallback del failed for ${key}:`, fallbackError);
      }
    }
    
    return true;
  }

  /**
   * ZAdd with fallback (for sorted sets)
   */
  async zAdd(key: string, members: { score: number; value: string }[], options: CacheOptions = {}): Promise<boolean> {
    const { useFallback = true } = options;
    
    try {
      const redisAvailable = await this.ensureRedisAvailable();
      
      if (redisAvailable) {
        await redisClient.zAdd(key, members);
        
        // Store in localStorage as simple array
        if (useFallback) {
          const existingData = await this.zRange(key, 0, -1, { useFallback: true });
          const updatedData = [...existingData];
          
          members.forEach(member => {
            const index = updatedData.findIndex(item => item.value === member.value);
            if (index >= 0) {
              updatedData[index] = member;
            } else {
              updatedData.push(member);
            }
          });
          
          safeSetItem(this.getFallbackKey(key), JSON.stringify({
            type: 'zset',
            data: updatedData,
            expires: Date.now() + FALLBACK_TTL
          }));
        }
        
        return true;
      }
    } catch (error) {
      console.warn(`⚠️ Redis zAdd failed for ${key}, using fallback:`, error);
    }
    
    return false;
  }

  /**
   * ZRange with fallback
   */
  async zRange(key: string, start: number, stop: number, options: CacheOptions = {}): Promise<{ score: number; value: string }[]> {
    const { useFallback = true } = options;
    
    // Try Redis first
    try {
      const redisAvailable = await this.ensureRedisAvailable();
      
      if (redisAvailable) {
        const results = await redisClient.zRange(key, start, stop, { withScores: true });
        return results.map(([value, score]: [string, number]) => ({ value, score }));
      }
    } catch (error) {
      console.warn(`⚠️ Redis zRange failed for ${key}, trying fallback:`, error);
    }
    
    // Fallback to localStorage
    if (useFallback) {
      try {
        const fallbackData = safeGetItem(this.getFallbackKey(key));
        if (fallbackData) {
          const parsed = JSON.parse(fallbackData);
          
          // Check if expired
          const now = Date.now();
          if (parsed.expires && now > parsed.expires) {
            safeSetItem(this.getFallbackKey(key), null as any);
            return [];
          }
          
          if (parsed.type === 'zset' && Array.isArray(parsed.data)) {
            return parsed.data.slice(start, stop === -1 ? undefined : stop + 1);
          }
        }
      } catch (fallbackError) {
        console.error(`❌ Fallback zRange failed for ${key}:`, fallbackError);
      }
    }
    
    return [];
  }

  /**
   * Multi/Exec with fallback
   */
  async multi(operations: Array<{ type: string; key: string; args: any[] }>, options: CacheOptions = {}): Promise<boolean> {
    const { useFallback = true } = options;
    
    try {
      const redisAvailable = await this.ensureRedisAvailable();
      
      if (redisAvailable) {
        const multi = redisClient.multi();
        
        operations.forEach(op => {
          switch (op.type) {
            case 'setEx':
              multi.setEx(op.key, ...op.args);
              break;
            case 'zAdd':
              multi.zAdd(op.key, op.args[0]);
              break;
            // Add more operations as needed
          }
        });
        
        const results = await multi.exec();
        return results !== null;
      }
    } catch (error) {
      console.warn('⚠️ Redis multi failed, executing individually:', error);
    }
    
    // Fallback: execute operations individually
    if (useFallback) {
      try {
        for (const op of operations) {
          switch (op.type) {
            case 'setEx':
              await this.setEx(op.key, op.args[0], op.args[1], { useFallback: true });
              break;
            case 'zAdd':
              await this.zAdd(op.key, op.args, { useFallback: true });
              break;
          }
        }
        return true;
      } catch (fallbackError) {
        console.error('❌ Fallback multi failed:', fallbackError);
      }
    }
    
    return false;
  }

  /**
   * Clean up expired fallback entries
   */
  cleanupExpiredFallbacks(): void {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();
      
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          try {
            const data = safeGetItem(key);
            if (data) {
              const parsed = JSON.parse(data);
              if (parsed.expires && now > parsed.expires) {
                safeSetItem(key, null as any);
              }
            }
          } catch (error) {
            // Clean up corrupted entries
            safeSetItem(key, null as any);
          }
        }
      });
    } catch (error) {
      console.warn('⚠️ Failed to cleanup expired fallbacks:', error);
    }
  }

  /**
   * Get Redis status
   */
  async getStatus(): Promise<{ redis: boolean; fallback: boolean; lastCheck: number }> {
    const redisAvailable = await this.ensureRedisAvailable();
    
    return {
      redis: redisAvailable,
      fallback: true, // Always available
      lastCheck: this.lastRedisCheck
    };
  }
}

// Export singleton instance
export const redisOps = EnhancedRedisOperations.getInstance();

// Cleanup expired entries periodically
if (typeof window !== 'undefined') {
  setInterval(() => {
    redisOps.cleanupExpiredFallbacks();
  }, 60 * 1000); // Every minute
}
