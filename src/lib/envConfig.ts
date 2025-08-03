/**
 * Environment configuration with domain-based API key switching
 */

export interface EnvConfig {
  polygonApiKey: string;
  fallbackApiKey?: string;
  project: string;
  domain: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

/**
 * Get environment configuration based on current domain
 */
export function getEnvConfig(hostname?: string): EnvConfig {
  const host = hostname?.toLowerCase() || '';
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isTest = process.env.NODE_ENV === 'test';

  // Detect project from domain
  let project = 'pmp';
  let domain = 'premarketprice.com';
  let polygonApiKey = process.env.POLYGON_API_KEY || '';

  if (host.includes('capmovers.com')) {
    project = 'cm';
    domain = 'capmovers.com';
    polygonApiKey = process.env.CM_POLYGON_API_KEY || process.env.POLYGON_API_KEY || '';
  } else if (host.includes('gainerslosers.com')) {
    project = 'gl';
    domain = 'gainerslosers.com';
    polygonApiKey = process.env.GL_POLYGON_API_KEY || process.env.POLYGON_API_KEY || '';
  } else if (host.includes('stockcv.com')) {
    project = 'cv';
    domain = 'stockcv.com';
    polygonApiKey = process.env.CV_POLYGON_API_KEY || process.env.POLYGON_API_KEY || '';
  } else if (host.includes('premarketprice.com')) {
    project = 'pmp';
    domain = 'premarketprice.com';
    polygonApiKey = process.env.PMP_POLYGON_API_KEY || process.env.POLYGON_API_KEY || '';
  }

  // Fallback API key for development or when primary key fails
  const fallbackApiKey = process.env.FALLBACK_POLYGON_API_KEY;

  return {
    polygonApiKey,
    fallbackApiKey,
    project,
    domain,
    isProduction,
    isDevelopment,
    isTest
  };
}

/**
 * Get Redis configuration based on environment
 */
export function getRedisConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    useMemoryFallback: !isProduction || !process.env.UPSTASH_REDIS_REST_URL,
    ttl: {
      default: 120, // 2 minutes
      fallback: 60, // 1 minute for fallback data
      long: 300, // 5 minutes for stable data
    }
  };
}

/**
 * Get cache configuration with project-specific settings
 */
export function getCacheConfig(project?: string) {
  const config = getEnvConfig();
  const redisConfig = getRedisConfig();
  
  return {
    ...redisConfig,
    prefix: project || config.project,
    keys: {
      stockData: (ticker: string) => `stock:${project || config.project}:${ticker}`,
      favorites: (project: string) => `favorites:${project}`,
      status: 'cache:status',
      metrics: 'cache:metrics',
    }
  };
}

/**
 * Validate environment configuration
 */
export function validateEnvConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const config = getEnvConfig();

  if (!config.polygonApiKey) {
    errors.push('POLYGON_API_KEY is not configured');
  }

  if (config.isProduction && !process.env.UPSTASH_REDIS_REST_URL) {
    errors.push('UPSTASH_REDIS_REST_URL is required in production');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get environment-specific settings
 */
export function getEnvironmentSettings() {
  const config = getEnvConfig();
  
  return {
    api: {
      timeout: config.isProduction ? 10000 : 30000, // 10s prod, 30s dev
      retries: config.isProduction ? 2 : 1,
      rateLimit: config.isProduction ? 100 : 1000, // requests per minute
    },
    cache: {
      enabled: true,
      ttl: config.isProduction ? 120 : 60, // 2min prod, 1min dev
      maxSize: config.isProduction ? 1000 : 100, // max cached items
    },
    logging: {
      level: config.isProduction ? 'warn' : 'debug',
      enableMetrics: config.isProduction,
    }
  };
} 