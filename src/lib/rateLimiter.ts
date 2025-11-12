/**
 * Rate limiter and circuit breaker utilities
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

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Rate limiter middleware
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 60, windowMs: 60000 }
): boolean {
  const now = Date.now();
  const key = identifier;
  const stored = rateLimitStore.get(key);

  if (!stored || now > stored.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + config.windowMs });
    return true;
  }

  if (stored.count >= config.maxRequests) {
    return false;
  }

  stored.count++;
  return true;
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
        const retryAfter = error.response.headers['retry-after'];
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

