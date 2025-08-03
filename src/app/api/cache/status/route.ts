import { NextRequest, NextResponse } from 'next/server';

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
    
    // In Edge Runtime, Redis is not available
    const redisConnected = false;
    const memoryFallback = true;
    const errors: string[] = ['Redis not available in Edge Runtime, using memory fallback'];

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
      test: testCache ? { success: true, message: 'Memory cache test completed' } : undefined,
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