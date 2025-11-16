/**
 * Redis-backed rate limiter
 * Replaces in-memory rate limiting for better scalability
 */

import { redisClient } from './redis';
import { logger } from './logger';

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

// Rate limit configurations for different endpoint types
const rateLimitConfigs: Record<string, RateLimitConfig> = {
  // Auth endpoints: 5 requests per 15 minutes
  auth: { limit: 5, windowMs: 15 * 60 * 1000 },
  
  // Background service: 10 requests per minute
  background: { limit: 10, windowMs: 60 * 1000 },
  
  // General API: 60 requests per minute
  api: { limit: 60, windowMs: 60 * 1000 },
  
  // Main page: 200 requests per 15 minutes
  page: { limit: 200, windowMs: 15 * 60 * 1000 }
};

/**
 * Check rate limit for a given identifier (IP, user ID, etc.)
 */
export async function checkRateLimit(
  identifier: string,
  type: keyof typeof rateLimitConfigs
): Promise<{ allowed: boolean; limit: number; remaining: number; reset: number }> {
  const config = (rateLimitConfigs[type] || rateLimitConfigs.api) as RateLimitConfig;
  const now = Date.now();
  const key = `ratelimit:${type}:${identifier}`;
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
  const windowKey = `${key}:${windowStart}`;
  const reset = windowStart + config.windowMs;

  try {
    if (redisClient && redisClient.isOpen) {
      // Use Redis for rate limiting with atomic operations
      // First, try to get current count
      const currentCount = await redisClient.get(windowKey);
      const count = currentCount ? parseInt(currentCount.toString(), 10) : 0;
      
      // Increment atomically
      const multi = redisClient.multi();
      multi.incr(windowKey);
      if (count === 0) {
        // Set expiration on first request in window
        multi.expire(windowKey, Math.ceil(config.windowMs / 1000));
      }
      const results = await multi.exec();
      
      // Get the incremented count from results
      const newCount = results?.[0]?.[1] ? parseInt(results[0][1].toString(), 10) : count + 1;
      const remaining = Math.max(0, config.limit - newCount);
      const allowed = newCount <= config.limit;

      return {
        allowed,
        limit: config.limit,
        remaining,
        reset
      };
    } else {
      // Fallback: allow request if Redis is unavailable
      logger.warn('Redis unavailable for rate limiting, allowing request');
      return {
        allowed: true,
        limit: config.limit,
        remaining: config.limit - 1,
        reset
      };
    }
  } catch (error) {
    // If Redis is unavailable, allow the request but log the error
    logger.error({ err: error }, 'Rate limiter error, allowing request');
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit - 1,
      reset
    };
  }
}

/**
 * Get client IP from request
 */
export function getClientIP(request: Request | { headers: Headers }): string {
  // Check various headers for IP (handles proxies/load balancers)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIP = forwarded.split(',')[0];
    if (firstIP) {
      return firstIP.trim();
    }
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

