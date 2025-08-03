/**
 * Prometheus metrics implementation for monitoring
 */

export interface MetricsData {
  http_requests_total: number;
  http_request_duration_seconds: number;
  cache_hits_total: number;
  cache_misses_total: number;
  cache_size_bytes: number;
  redis_connections_active: number;
  api_errors_total: number;
  background_jobs_total: number;
  background_job_duration_seconds: number;
}

class PrometheusMetrics {
  private metrics: MetricsData = {
    http_requests_total: 0,
    http_request_duration_seconds: 0,
    cache_hits_total: 0,
    cache_misses_total: 0,
    cache_size_bytes: 0,
    redis_connections_active: 0,
    api_errors_total: 0,
    background_jobs_total: 0,
    background_job_duration_seconds: 0,
  };

  private startTimes: Map<string, number> = new Map();

  /**
   * Record HTTP request
   */
  recordHttpRequest(method: string, path: string, statusCode: number, duration: number) {
    this.metrics.http_requests_total++;
    this.metrics.http_request_duration_seconds += duration;
    
    if (statusCode >= 400) {
      this.metrics.api_errors_total++;
    }
  }

  /**
   * Record cache hit
   */
  recordCacheHit() {
    this.metrics.cache_hits_total++;
  }

  /**
   * Record cache miss
   */
  recordCacheMiss() {
    this.metrics.cache_misses_total++;
  }

  /**
   * Update cache size
   */
  updateCacheSize(size: number) {
    this.metrics.cache_size_bytes = size;
  }

  /**
   * Update Redis connections
   */
  updateRedisConnections(count: number) {
    this.metrics.redis_connections_active = count;
  }

  /**
   * Record background job
   */
  recordBackgroundJob(duration: number) {
    this.metrics.background_jobs_total++;
    this.metrics.background_job_duration_seconds += duration;
  }

  /**
   * Start timing an operation
   */
  startTimer(operation: string): string {
    const id = `${operation}_${Date.now()}_${Math.random()}`;
    this.startTimes.set(id, Date.now());
    return id;
  }

  /**
   * End timing an operation
   */
  endTimer(id: string): number {
    const startTime = this.startTimes.get(id);
    if (!startTime) {
      return 0;
    }
    
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    this.startTimes.delete(id);
    return duration;
  }

  /**
   * Get all metrics in Prometheus format
   */
  getMetrics(): string {
    const timestamp = Date.now();
    const lines = [
      '# HELP http_requests_total Total number of HTTP requests',
      '# TYPE http_requests_total counter',
      `http_requests_total ${this.metrics.http_requests_total} ${timestamp}`,
      '',
      '# HELP http_request_duration_seconds Total duration of HTTP requests in seconds',
      '# TYPE http_request_duration_seconds counter',
      `http_request_duration_seconds ${this.metrics.http_request_duration_seconds} ${timestamp}`,
      '',
      '# HELP cache_hits_total Total number of cache hits',
      '# TYPE cache_hits_total counter',
      `cache_hits_total ${this.metrics.cache_hits_total} ${timestamp}`,
      '',
      '# HELP cache_misses_total Total number of cache misses',
      '# TYPE cache_misses_total counter',
      `cache_misses_total ${this.metrics.cache_misses_total} ${timestamp}`,
      '',
      '# HELP cache_hit_ratio Cache hit ratio (0-1)',
      '# TYPE cache_hit_ratio gauge',
      `cache_hit_ratio ${this.getCacheHitRatio()} ${timestamp}`,
      '',
      '# HELP cache_size_bytes Current cache size in bytes',
      '# TYPE cache_size_bytes gauge',
      `cache_size_bytes ${this.metrics.cache_size_bytes} ${timestamp}`,
      '',
      '# HELP redis_connections_active Number of active Redis connections',
      '# TYPE redis_connections_active gauge',
      `redis_connections_active ${this.metrics.redis_connections_active} ${timestamp}`,
      '',
      '# HELP api_errors_total Total number of API errors',
      '# TYPE api_errors_total counter',
      `api_errors_total ${this.metrics.api_errors_total} ${timestamp}`,
      '',
      '# HELP background_jobs_total Total number of background jobs',
      '# TYPE background_jobs_total counter',
      `background_jobs_total ${this.metrics.background_jobs_total} ${timestamp}`,
      '',
      '# HELP background_job_duration_seconds Total duration of background jobs in seconds',
      '# TYPE background_job_duration_seconds counter',
      `background_job_duration_seconds ${this.metrics.background_job_duration_seconds} ${timestamp}`,
      '',
      '# HELP app_uptime_seconds Application uptime in seconds',
      '# TYPE app_uptime_seconds gauge',
      `app_uptime_seconds ${this.getUptime()} ${timestamp}`,
    ];

    return lines.join('\n');
  }

  /**
   * Get cache hit ratio
   */
  private getCacheHitRatio(): number {
    const total = this.metrics.cache_hits_total + this.metrics.cache_misses_total;
    return total > 0 ? this.metrics.cache_hits_total / total : 0;
  }

  /**
   * Get application uptime
   */
  private getUptime(): number {
    return process.uptime();
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.metrics = {
      http_requests_total: 0,
      http_request_duration_seconds: 0,
      cache_hits_total: 0,
      cache_misses_total: 0,
      cache_size_bytes: 0,
      redis_connections_active: 0,
      api_errors_total: 0,
      background_jobs_total: 0,
      background_job_duration_seconds: 0,
    };
    this.startTimes.clear();
  }

  /**
   * Get metrics as JSON for API responses
   */
  getMetricsJson() {
    return {
      ...this.metrics,
      cache_hit_ratio: this.getCacheHitRatio(),
      uptime_seconds: this.getUptime(),
      timestamp: new Date().toISOString(),
    };
  }
}

// Global metrics instance
export const prometheusMetrics = new PrometheusMetrics();

/**
 * Middleware to record HTTP metrics
 */
export function recordHttpMetrics(method: string, path: string, statusCode: number, duration: number) {
  prometheusMetrics.recordHttpRequest(method, path, statusCode, duration);
}

/**
 * Middleware to record cache metrics
 */
export function recordCacheMetrics(hit: boolean) {
  if (hit) {
    prometheusMetrics.recordCacheHit();
  } else {
    prometheusMetrics.recordCacheMiss();
  }
}

/**
 * Utility to time operations
 */
export function withMetrics<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const timerId = prometheusMetrics.startTimer(operation);
  
  return fn().finally(() => {
    const duration = prometheusMetrics.endTimer(timerId);
    if (operation.includes('background')) {
      prometheusMetrics.recordBackgroundJob(duration);
    }
  });
}

/**
 * Record background service status update
 */
export function updateBackgroundServiceStatus(isRunning: boolean) {
  // This could be expanded to track service status metrics
  console.log(`📊 Background service status: ${isRunning ? 'running' : 'stopped'}`);
}

/**
 * Record background update
 */
export function recordBackgroundUpdate() {
  prometheusMetrics.recordBackgroundJob(0); // Duration will be set by withMetrics
}

/**
 * Record background error
 */
export function recordBackgroundError(error: string) {
  prometheusMetrics.recordHttpRequest('BACKGROUND', 'error', 500, 0);
  console.error(`❌ Background service error: ${error}`);
} 