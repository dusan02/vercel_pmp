import { prometheusMetrics, recordHttpMetrics, recordCacheMetrics, withMetrics } from '../prometheus';

describe('Prometheus Metrics', () => {
  beforeEach(() => {
    prometheusMetrics.reset();
  });

  describe('HTTP Request Metrics', () => {
    it('should record HTTP requests correctly', () => {
      recordHttpMetrics('GET', '/api/stocks', 200, 0.5);
      recordHttpMetrics('POST', '/api/favorites', 201, 0.3);
      recordHttpMetrics('GET', '/api/health', 404, 0.1);

      const metrics = prometheusMetrics.getMetricsJson();
      
      expect(metrics.http_requests_total).toBe(3);
      expect(metrics.http_request_duration_seconds).toBe(0.9);
      expect(metrics.api_errors_total).toBe(1); // 404 is an error
    });

    it('should categorize status codes correctly', () => {
      recordHttpMetrics('GET', '/api/test', 200, 0.1);
      recordHttpMetrics('GET', '/api/test', 300, 0.1);
      recordHttpMetrics('GET', '/api/test', 400, 0.1);
      recordHttpMetrics('GET', '/api/test', 500, 0.1);

      const metrics = prometheusMetrics.getMetricsJson();
      expect(metrics.api_errors_total).toBe(2); // 400 and 500 are errors
    });
  });

  describe('Cache Metrics', () => {
    it('should record cache hits and misses correctly', () => {
      recordCacheMetrics(true);  // hit
      recordCacheMetrics(true);  // hit
      recordCacheMetrics(false); // miss
      recordCacheMetrics(true);  // hit

      const metrics = prometheusMetrics.getMetricsJson();
      
      expect(metrics.cache_hits_total).toBe(3);
      expect(metrics.cache_misses_total).toBe(1);
      expect(metrics.cache_hit_ratio).toBe(0.75); // 3/4 = 0.75
    });

    it('should handle zero cache operations', () => {
      const metrics = prometheusMetrics.getMetricsJson();
      expect(metrics.cache_hit_ratio).toBe(0);
    });
  });

  describe('Background Job Metrics', () => {
    it('should record background job duration', () => {
      prometheusMetrics.recordBackgroundJob(5.5);
      prometheusMetrics.recordBackgroundJob(2.3);

      const metrics = prometheusMetrics.getMetricsJson();
      
      expect(metrics.background_jobs_total).toBe(2);
      expect(metrics.background_job_duration_seconds).toBe(7.8);
    });
  });

  describe('Timer Operations', () => {
    it('should time operations correctly', async () => {
      const timerId = prometheusMetrics.startTimer('test-operation');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const duration = prometheusMetrics.endTimer(timerId);
      
      expect(duration).toBeGreaterThan(0.09); // Should be around 0.1 seconds
      expect(duration).toBeLessThan(0.2); // But not too much more
    });

    it('should handle invalid timer IDs', () => {
      const duration = prometheusMetrics.endTimer('invalid-id');
      expect(duration).toBe(0);
    });

    it('should work with withMetrics utility', async () => {
      const result = await withMetrics('background-job', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'success';
      });

      expect(result).toBe('success');
      
      const metrics = prometheusMetrics.getMetricsJson();
      expect(metrics.background_jobs_total).toBe(1);
      expect(metrics.background_job_duration_seconds).toBeGreaterThan(0.04);
    });
  });

  describe('Prometheus Format', () => {
    it('should generate valid Prometheus format', () => {
      recordHttpMetrics('GET', '/api/test', 200, 0.1);
      recordCacheMetrics(true);
      prometheusMetrics.updateCacheSize(1024);
      prometheusMetrics.updateRedisConnections(1);

      const prometheusFormat = prometheusMetrics.getMetrics();
      
      expect(prometheusFormat).toContain('# HELP http_requests_total');
      expect(prometheusFormat).toContain('# TYPE http_requests_total counter');
      expect(prometheusFormat).toContain('http_requests_total 1');
      expect(prometheusFormat).toContain('cache_hits_total 1');
      expect(prometheusFormat).toContain('cache_size_bytes 1024');
      expect(prometheusFormat).toContain('redis_connections_active 1');
    });

    it('should include all required metrics', () => {
      const prometheusFormat = prometheusMetrics.getMetrics();
      
      const requiredMetrics = [
        'http_requests_total',
        'http_request_duration_seconds',
        'cache_hits_total',
        'cache_misses_total',
        'cache_hit_ratio',
        'cache_size_bytes',
        'redis_connections_active',
        'api_errors_total',
        'background_jobs_total',
        'background_job_duration_seconds',
        'app_uptime_seconds'
      ];

      requiredMetrics.forEach(metric => {
        expect(prometheusFormat).toContain(`# HELP ${metric}`);
        expect(prometheusFormat).toContain(`# TYPE ${metric}`);
      });
    });
  });

  describe('JSON Format', () => {
    it('should provide metrics in JSON format', () => {
      recordHttpMetrics('GET', '/api/test', 200, 0.1);
      recordCacheMetrics(true);
      prometheusMetrics.updateCacheSize(2048);

      const jsonMetrics = prometheusMetrics.getMetricsJson();
      
      expect(jsonMetrics).toHaveProperty('http_requests_total');
      expect(jsonMetrics).toHaveProperty('cache_hits_total');
      expect(jsonMetrics).toHaveProperty('cache_size_bytes');
      expect(jsonMetrics).toHaveProperty('cache_hit_ratio');
      expect(jsonMetrics).toHaveProperty('uptime_seconds');
      expect(jsonMetrics).toHaveProperty('timestamp');
      
      expect(jsonMetrics.http_requests_total).toBe(1);
      expect(jsonMetrics.cache_hits_total).toBe(1);
      expect(jsonMetrics.cache_size_bytes).toBe(2048);
      expect(jsonMetrics.cache_hit_ratio).toBe(1);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all metrics to zero', () => {
      recordHttpMetrics('GET', '/api/test', 200, 0.1);
      recordCacheMetrics(true);
      prometheusMetrics.updateCacheSize(1024);
      prometheusMetrics.recordBackgroundJob(1.5);

      // Verify metrics are set
      let metrics = prometheusMetrics.getMetricsJson();
      expect(metrics.http_requests_total).toBe(1);
      expect(metrics.cache_hits_total).toBe(1);
      expect(metrics.cache_size_bytes).toBe(1024);
      expect(metrics.background_jobs_total).toBe(1);

      // Reset
      prometheusMetrics.reset();

      // Verify metrics are reset
      metrics = prometheusMetrics.getMetricsJson();
      expect(metrics.http_requests_total).toBe(0);
      expect(metrics.cache_hits_total).toBe(0);
      expect(metrics.cache_size_bytes).toBe(0);
      expect(metrics.background_jobs_total).toBe(0);
    });
  });
}); 