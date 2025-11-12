/**
 * Unified Cache Interface
 * Provides consistent cache access with Redis primary and in-memory fallback
 */

import { redisClient } from './redis';
import { PriceData } from './types';

// In-memory fallback cache
const inMemoryCache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();

/**
 * Unified cache interface
 */
export class UnifiedCache {
  /**
   * Get data from cache (Redis primary, in-memory fallback)
   */
  static async get<T>(key: string): Promise<T | null> {
    // Try Redis first
    if (redisClient && redisClient.isOpen) {
      try {
        const data = await redisClient.get(key);
        if (data) {
          return JSON.parse(data.toString()) as T;
        }
      } catch (error) {
        console.error(`Redis get error for key ${key}:`, error);
      }
    }

    // Fallback to in-memory cache
    const cached = inMemoryCache.get(key);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < cached.ttl * 1000) {
        return cached.data as T;
      } else {
        // Expired, remove it
        inMemoryCache.delete(key);
      }
    }

    return null;
  }

  /**
   * Set data in cache (Redis primary, in-memory fallback)
   */
  static async set<T>(key: string, data: T, ttl: number = 300): Promise<boolean> {
    // Try Redis first
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.setEx(key, ttl, JSON.stringify(data));
        return true;
      } catch (error) {
        console.error(`Redis set error for key ${key}:`, error);
      }
    }

    // Fallback to in-memory cache
    inMemoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });

    // Cleanup expired entries periodically
    if (inMemoryCache.size > 1000) {
      this.cleanup();
    }

    return true;
  }

  /**
   * Delete data from cache
   */
  static async delete(key: string): Promise<boolean> {
    // Delete from Redis
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.del(key);
      } catch (error) {
        console.error(`Redis delete error for key ${key}:`, error);
      }
    }

    // Delete from in-memory cache
    inMemoryCache.delete(key);
    return true;
  }

  /**
   * Get multiple keys at once
   */
  static async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    if (keys.length === 0) return result;

    // Try Redis first
    if (redisClient && redisClient.isOpen) {
      try {
        const values = await redisClient.mGet(keys);
        keys.forEach((key, index) => {
          const value = values[index];
          if (value) {
            try {
              result.set(key, JSON.parse(value.toString()) as T);
            } catch (e) {
              console.error(`Error parsing cache data for ${key}:`, e);
            }
          }
        });
        return result;
      } catch (error) {
        console.error('Redis mGet error:', error);
      }
    }

    // Fallback to in-memory cache
    keys.forEach(key => {
      const cached = inMemoryCache.get(key);
      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < cached.ttl * 1000) {
          result.set(key, cached.data as T);
        } else {
          inMemoryCache.delete(key);
        }
      }
    });

    return result;
  }

  /**
   * Set multiple keys at once
   */
  static async setMany<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean> {
    const ttl = items[0]?.ttl || 300;

    // Try Redis first
    if (redisClient && redisClient.isOpen) {
      try {
        const pipeline = redisClient.multi();
        items.forEach(({ key, value }) => {
          pipeline.setEx(key, ttl, JSON.stringify(value));
        });
        await pipeline.exec();
        return true;
      } catch (error) {
        console.error('Redis pipeline set error:', error);
      }
    }

    // Fallback to in-memory cache
    const now = Date.now();
    items.forEach(({ key, value, ttl: itemTtl }) => {
      inMemoryCache.set(key, {
        data: value,
        timestamp: now,
        ttl: itemTtl || ttl
      });
    });

    return true;
  }

  /**
   * Check if cache is available (Redis or in-memory)
   */
  static isAvailable(): boolean {
    return (redisClient && redisClient.isOpen) || true; // In-memory is always available
  }

  /**
   * Get cache type (redis or memory)
   */
  static getCacheType(): 'redis' | 'memory' {
    return (redisClient && redisClient.isOpen) ? 'redis' : 'memory';
  }

  /**
   * Cleanup expired in-memory cache entries
   */
  static cleanup(): void {
    const now = Date.now();
    for (const [key, cached] of inMemoryCache.entries()) {
      const age = now - cached.timestamp;
      if (age >= cached.ttl * 1000) {
        inMemoryCache.delete(key);
      }
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  static async clear(): Promise<void> {
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.flushDb();
      } catch (error) {
        console.error('Redis flush error:', error);
      }
    }
    inMemoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getStats() {
    return {
      type: this.getCacheType(),
      memorySize: inMemoryCache.size,
      redisConnected: redisClient && redisClient.isOpen
    };
  }
}

