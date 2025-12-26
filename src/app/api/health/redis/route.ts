import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis/client';

/**
 * Redis health check endpoint with detailed diagnostics
 * Returns Redis connectivity, ping, and key existence checks
 * 
 * GET /api/health/redis
 */
export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    const diagnostics: Record<string, any> = {};
    
    // 1. Check Redis connection
    const isConnected = redisClient && redisClient.isOpen;
    diagnostics.connected = isConnected;
    diagnostics.isOpen = redisClient?.isOpen || false;
    
    if (!isConnected) {
      return NextResponse.json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        diagnostics: {
          ...diagnostics,
          message: 'Redis client not connected',
          ping: null,
          keyChecks: null
        }
      }, { status: 503 });
    }
    
    // 2. Ping test
    let pingMs: number | null = null;
    try {
      const pingStart = Date.now();
      await redisClient.ping();
      pingMs = Date.now() - pingStart;
      diagnostics.ping = pingMs;
    } catch (error) {
      diagnostics.pingError = error instanceof Error ? error.message : String(error);
    }
    
    // 3. Check key existence (diagnostics)
    const keyChecks: Record<string, boolean> = {};
    const keysToCheck = [
      'freshness:last_update',
      'bulk:last_success_ts',
      'bulk:last_duration_ms',
      'worker:last_success_ts',
      'lock:bulk_preload'
    ];
    
    try {
      for (const key of keysToCheck) {
        const exists = await redisClient.exists(key);
        keyChecks[key] = exists === 1;
      }
      diagnostics.keyChecks = keyChecks;
      
      // Check freshness hash size
      const freshnessHashSize = await redisClient.hLen('freshness:last_update');
      diagnostics.freshnessHashSize = freshnessHashSize;
    } catch (error) {
      diagnostics.keyCheckError = error instanceof Error ? error.message : String(error);
    }
    
    // 4. Determine status
    const isHealthy = isConnected && pingMs !== null && pingMs < 100;
    const status = isHealthy ? 'healthy' : (isConnected ? 'degraded' : 'unhealthy');
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status,
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      diagnostics: {
        ...diagnostics,
        message: isHealthy 
          ? 'Redis is healthy and responsive' 
          : isConnected 
            ? 'Redis connected but slow or key checks failed'
            : 'Redis not connected'
      }
    }, {
      status: status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (error) {
    console.error('Error in Redis health check:', error);
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
} 