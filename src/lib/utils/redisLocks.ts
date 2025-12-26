/**
 * Redis-based distributed locks and rate limiters
 * Production-safe implementations for preventing race conditions and DDoS
 */

import { redisClient } from '../redis/client';
import { logger } from './logger';

/**
 * Acquire a distributed lock using Redis SET NX EX
 * 
 * @param key - Lock key (e.g., 'lock:bulk_preload')
 * @param ttlSeconds - Lock TTL in seconds (auto-releases after this time)
 * @param retryMs - Optional: retry interval if lock is held (default: no retry)
 * @param maxRetries - Optional: max retry attempts (default: 0 = no retry)
 * @returns Lock token (random string) if acquired, null if failed
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number,
  retryMs: number = 0,
  maxRetries: number = 0
): Promise<string | null> {
  // FAIL-CLOSED: If Redis unavailable, don't acquire lock (prevent parallel execution)
  if (!redisClient || !redisClient.isOpen) {
    logger.warn(`Redis unavailable, cannot acquire lock: ${key} - FAIL-CLOSED (skipping operation)`);
    return null;
  }

  const lockKey = `lock:${key}`;
  const lockToken = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  let attempts = 0;
  
  while (attempts <= maxRetries) {
    try {
      // SET key value NX EX ttl - atomic operation
      // NX = only set if not exists
      // EX = expire after ttl seconds
      const result = await redisClient.set(lockKey, lockToken, {
        NX: true,
        EX: ttlSeconds
      });

      if (result === 'OK') {
        return lockToken;
      }

      // Lock is held by another process
      if (attempts < maxRetries && retryMs > 0) {
        await new Promise(resolve => setTimeout(resolve, retryMs));
        attempts++;
      } else {
        return null;
      }
    } catch (error) {
      logger.error(`Error acquiring lock ${lockKey}:`, error);
      return null;
    }
  }

  return null;
}

/**
 * Release a distributed lock
 * Only releases if the lock token matches (prevents releasing someone else's lock)
 * 
 * @param key - Lock key
 * @param lockToken - Token returned from acquireLock()
 * @returns true if released, false if failed or token mismatch
 */
export async function releaseLock(key: string, lockToken: string): Promise<boolean> {
  if (!redisClient || !redisClient.isOpen) {
    return false;
  }

  const lockKey = `lock:${key}`;
  
  try {
    // Lua script for atomic check-and-delete
    // Only delete if value matches (prevents releasing someone else's lock)
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await redisClient.eval(luaScript, 1, lockKey, lockToken);
    return result === 1;
  } catch (error) {
    logger.error(`Error releasing lock ${lockKey}:`, error);
    return false;
  }
}

/**
 * Execute a function with a distributed lock
 * Automatically acquires and releases the lock
 * 
 * @param key - Lock key
 * @param ttlSeconds - Lock TTL
 * @param fn - Function to execute while holding the lock
 * @returns Result of fn() or null if lock acquisition failed
 */
export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const lockToken = await acquireLock(key, ttlSeconds);
  
  if (!lockToken) {
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(key, lockToken);
  }
}

/**
 * Token bucket rate limiter
 * Implements sliding window token bucket algorithm
 * 
 * @param key - Rate limit key (e.g., 'ratelimit:ondemand_prevclose')
 * @param maxTokens - Maximum tokens in bucket
 * @param refillRate - Tokens per second
 * @param windowSeconds - Time window in seconds (for Redis key rotation)
 * @returns { allowed: boolean, remaining: number, resetAt: number }
 */
export async function checkTokenBucket(
  key: string,
  maxTokens: number,
  refillRate: number,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  // FAIL-CLOSED: If Redis unavailable, deny request (prevent DDoS on Polygon API)
  if (!redisClient || !redisClient.isOpen) {
    logger.warn(`Redis unavailable for rate limiting, denying: ${key} - FAIL-CLOSED (preventing API spam)`);
    return {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + (windowSeconds * 1000)
    };
  }

  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
  const rateLimitKey = `ratelimit:${key}:${Math.floor(windowStart / 1000)}`;
  
  try {
    // Get current state
    const stateStr = await redisClient.get(rateLimitKey);
    let tokens = maxTokens;
    let lastRefill = windowStart;

    if (stateStr) {
      const state = JSON.parse(stateStr);
      tokens = state.tokens;
      lastRefill = state.lastRefill;
    }

    // Calculate tokens to add based on time passed
    const timePassed = (now - lastRefill) / 1000; // seconds
    const tokensToAdd = Math.floor(timePassed * refillRate);
    tokens = Math.min(maxTokens, tokens + tokensToAdd);
    lastRefill = now;

    // Check if we can consume a token
    const allowed = tokens >= 1;
    
    if (allowed) {
      tokens -= 1;
    }

    // Save state back to Redis
    const newState = {
      tokens,
      lastRefill
    };
    
    await redisClient.setEx(
      rateLimitKey,
      windowSeconds + 10, // TTL slightly longer than window
      JSON.stringify(newState)
    );

    return {
      allowed,
      remaining: Math.max(0, tokens),
      resetAt: windowStart + (windowSeconds * 1000)
    };
  } catch (error) {
    logger.error(`Error in token bucket rate limiter ${key}:`, error);
    // Fail open
    return {
      allowed: true,
      remaining: maxTokens,
      resetAt: Date.now() + (windowSeconds * 1000)
    };
  }
}

/**
 * Simple counter-based rate limiter (alternative to token bucket)
 * Uses fixed window counting
 * 
 * @param key - Rate limit key
 * @param limit - Max requests per window
 * @param windowSeconds - Time window in seconds
 * @returns { allowed: boolean, remaining: number, resetAt: number }
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!redisClient || !redisClient.isOpen) {
    logger.warn(`Redis unavailable for rate limiting, allowing: ${key}`);
    return {
      allowed: true,
      remaining: limit,
      resetAt: Date.now() + (windowSeconds * 1000)
    };
  }

  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
  const rateLimitKey = `ratelimit:${key}:${Math.floor(windowStart / 1000)}`;
  
  try {
    // Increment counter atomically
    const count = await redisClient.incr(rateLimitKey);
    
    // Set expiration on first request in window
    if (count === 1) {
      await redisClient.expire(rateLimitKey, windowSeconds + 10);
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);

    return {
      allowed,
      remaining,
      resetAt: windowStart + (windowSeconds * 1000)
    };
  } catch (error) {
    logger.error(`Error in rate limiter ${key}:`, error);
    return {
      allowed: true,
      remaining: limit,
      resetAt: Date.now() + (windowSeconds * 1000)
    };
  }
}

