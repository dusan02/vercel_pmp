import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData, deleteCachedData } from '@/lib/redis';

interface CacheStatus {
  redisConnected: boolean;
  memoryFallback: boolean;
  lastTest: string;
  cacheHits: number;
  cacheMisses: number;
  totalRequests: number;
  hitRate: number;
  averageResponseTime: number;
  errors: string[];
}

// In-memory metrics storage
let cacheMetrics = {
  hits: 0,
  misses: 0,
  totalRequests: 0,
  responseTimes: [] as number[],
  errors: [] as string[]
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testCache = searchParams.get('test') === 'true';
    
    let redisConnected = false;
    let memoryFallback = false;
    let testResult = null;
    const errors: string[] = [];

    // Test Redis connection
    try {
      const testKey = 'cache_status_test';
      const testData = { timestamp: Date.now(), test: true };
      
      // Try to set and get data from Redis
      const setResult = await setCachedData(testKey, testData, 60);
      const getResult = await getCachedData(testKey);
      await deleteCachedData(testKey);
      
      if (setResult && getResult && getResult.timestamp === testData.timestamp) {
        redisConnected = true;
        testResult = { success: true, data: getResult };
      } else {
        memoryFallback = true;
        errors.push('Redis operation failed, using memory fallback');
      }
    } catch (error) {
      memoryFallback = true;
      errors.push(`Redis connection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Calculate metrics
    const totalRequests = cacheMetrics.totalRequests;
    const hitRate = totalRequests > 0 ? (cacheMetrics.hits / totalRequests) * 100 : 0;
    const averageResponseTime = cacheMetrics.responseTimes.length > 0 
      ? cacheMetrics.responseTimes.reduce((a, b) => a + b, 0) / cacheMetrics.responseTimes.length 
      : 0;

    const status: CacheStatus = {
      redisConnected,
      memoryFallback,
      lastTest: new Date().toISOString(),
      cacheHits: cacheMetrics.hits,
      cacheMisses: cacheMetrics.misses,
      totalRequests,
      hitRate: Math.round(hitRate * 100) / 100,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      errors: [...errors, ...cacheMetrics.errors.slice(-5)] // Last 5 errors
    };

    return NextResponse.json({
      success: true,
      data: status,
      test: testCache ? testResult : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in /api/cache/status:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

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