// Cache metrics management for Edge Runtime compatibility

interface CacheMetrics {
  hits: number;
  misses: number;
  totalRequests: number;
  responseTimes: number[];
  errors: string[];
}

// In-memory metrics storage
let cacheMetrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  totalRequests: 0,
  responseTimes: [],
  errors: []
};

// Export function to update metrics (called from other modules)
export function updateCacheMetrics(hit: boolean, responseTime: number, error?: string) {
  cacheMetrics.totalRequests++;
  
  if (hit) {
    cacheMetrics.hits++;
  } else {
    cacheMetrics.misses++;
  }
  
  cacheMetrics.responseTimes.push(responseTime);
  
  // Keep only last 100 response times
  if (cacheMetrics.responseTimes.length > 100) {
    cacheMetrics.responseTimes = cacheMetrics.responseTimes.slice(-100);
  }
  
  if (error) {
    cacheMetrics.errors.push(error);
    // Keep only last 10 errors
    if (cacheMetrics.errors.length > 10) {
      cacheMetrics.errors = cacheMetrics.errors.slice(-10);
    }
  }
}

// Reset metrics (for testing or admin purposes)
export function resetCacheMetrics() {
  cacheMetrics = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
    responseTimes: [],
    errors: []
  };
}

// Get current metrics
export function getCacheMetrics() {
  return { ...cacheMetrics };
}

// Calculate derived metrics
export function getCacheStatus() {
  const totalRequests = cacheMetrics.totalRequests;
  const hitRate = totalRequests > 0 ? (cacheMetrics.hits / totalRequests) * 100 : 0;
  const averageResponseTime = cacheMetrics.responseTimes.length > 0 
    ? cacheMetrics.responseTimes.reduce((a, b) => a + b, 0) / cacheMetrics.responseTimes.length 
    : 0;

  return {
    redisConnected: false, // Always false in Edge Runtime
    memoryFallback: true,  // Always true in Edge Runtime
    lastTest: new Date().toISOString(),
    cacheHits: cacheMetrics.hits,
    cacheMisses: cacheMetrics.misses,
    totalRequests,
    hitRate: Math.round(hitRate * 100) / 100,
    averageResponseTime: Math.round(averageResponseTime * 100) / 100,
    errors: ['Redis not available in Edge Runtime, using memory fallback', ...cacheMetrics.errors.slice(-5)]
  };
} 