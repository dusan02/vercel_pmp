/**
 * Rate limiter and circuit breaker utilities
 * 
 * In-memory rate limiter uses sliding window log algorithm (Edge-compatible).
 * For multi-instance deployments, use redisRateLimit (Node.js runtime only).
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailureTime: number;
  successCount: number;
}

// Sliding window log: store timestamps of requests per identifier
const slidingWindowStore = new Map<string, number[]>();
const circuitBreakers = new Map<string, CircuitBreakerState>();

// Cleanup expired entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer: NodeJS.Timeout | null = null;

function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, timestamps] of slidingWindowStore.entries()) {
    // Remove entries where all timestamps are older than 2 minutes (max window we'd use)
    const cutoff = now - 120_000;
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) {
      slidingWindowStore.delete(key);
    } else if (fresh.length !== timestamps.length) {
      slidingWindowStore.set(key, fresh);
    }
  }
}

// Start cleanup timer
if (typeof window === 'undefined') {
  cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL);
}

/**
 * In-memory sliding window rate limiter (Edge-compatible).
 * More accurate than fixed window — prevents burst-at-boundary problem.
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 60, windowMs: 60000 }
): boolean {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  const timestamps = slidingWindowStore.get(identifier) || [];
  // Filter to only timestamps within the current window
  const recent = timestamps.filter(t => t > windowStart);
  
  if (recent.length >= config.maxRequests) {
    slidingWindowStore.set(identifier, recent);
    return false;
  }
  
  recent.push(now);
  slidingWindowStore.set(identifier, recent);
  return true;
}

/**
 * Redis-based sliding window rate limiter for Node.js runtime (non-Edge).
 * Use this in API routes that run in Node.js runtime for multi-instance accuracy.
 * Falls back to in-memory if Redis is unavailable.
 */
export async function redisRateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 60, windowMs: 60000 }
): Promise<boolean> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (!redisClient || !redisClient.isOpen) {
      return rateLimit(identifier, config);
    }
    
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const key = `ratelimit:${identifier}`;
    
    // Remove expired entries and add current timestamp atomically
    const pipeline = redisClient.multi();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}`);
    pipeline.zcard(key);
    pipeline.pexpire(key, config.windowMs);
    
    const results = await pipeline.exec();
    const count = results?.[2]?.[1] as number;
    
    return count <= config.maxRequests;
  } catch {
    // Fallback to in-memory if Redis fails
    return rateLimit(identifier, config);
  }
}

/**
 * Circuit breaker for external API calls
 */
export function circuitBreaker(
  service: string,
  failureThreshold: number = 5,
  successThreshold: number = 2,
  timeout: number = 60000
): { isOpen: boolean; recordSuccess: () => void; recordFailure: () => void } {
  const state = circuitBreakers.get(service) || {
    isOpen: false,
    failures: 0,
    lastFailureTime: 0,
    successCount: 0
  };

  const now = Date.now();

  // Auto-recover after timeout
  if (state.isOpen && now - state.lastFailureTime > timeout) {
    state.isOpen = false;
    state.failures = 0;
    state.successCount = 0;
  }

  return {
    isOpen: state.isOpen,
    recordSuccess: () => {
      if (state.isOpen) {
        state.successCount++;
        if (state.successCount >= successThreshold) {
          state.isOpen = false;
          state.failures = 0;
          state.successCount = 0;
        }
      } else {
        state.failures = Math.max(0, state.failures - 1);
      }
      circuitBreakers.set(service, state);
    },
    recordFailure: () => {
      state.failures++;
      state.lastFailureTime = now;
      if (state.failures >= failureThreshold) {
        state.isOpen = true;
        state.successCount = 0;
      }
      circuitBreakers.set(service, state);
    }
  };
}

/**
 * Exponential backoff for retries
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check for 429 (rate limit) with Retry-After header
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers.get('retry-after');
        if (retryAfter) {
          const delay = parseInt(retryAfter) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) break;

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Retry failed');
}

