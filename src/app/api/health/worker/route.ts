import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis/client';
import { getFreshnessMetrics } from '@/lib/utils/freshnessMetrics';
import { getUniverse } from '@/lib/redis/operations';

/**
 * Worker health check endpoint
 * Returns worker status, freshness metrics, and bulk preload status
 * 
 * GET /api/health/worker
 */
export async function GET(request: NextRequest) {
  try {
    const now = Date.now();
    
    // 1. Get worker last success timestamp
    let workerLastSuccess: number | null = null;
    let workerAgeMinutes: number | null = null;
    
    if (redisClient && redisClient.isOpen) {
      const workerLastSuccessStr = await redisClient.get('worker:last_success_ts');
      if (workerLastSuccessStr) {
        workerLastSuccess = parseInt(workerLastSuccessStr, 10);
        workerAgeMinutes = Math.floor((now - workerLastSuccess) / 60000);
      }
    }
    
    // 2. Get bulk preload status
    let bulkLastSuccess: number | null = null;
    let bulkLastDuration: number | null = null;
    let bulkLastError: string | null = null;
    let bulkAgeMinutes: number | null = null;
    
    if (redisClient && redisClient.isOpen) {
      const bulkLastSuccessStr = await redisClient.get('bulk:last_success_ts');
      const bulkLastDurationStr = await redisClient.get('bulk:last_duration_ms');
      const bulkLastErrorStr = await redisClient.get('bulk:last_error');
      
      if (bulkLastSuccessStr) {
        bulkLastSuccess = parseInt(bulkLastSuccessStr, 10);
        bulkAgeMinutes = Math.floor((now - bulkLastSuccess) / 60000);
      }
      
      if (bulkLastDurationStr) {
        bulkLastDuration = parseInt(bulkLastDurationStr, 10);
      }
      
      if (bulkLastErrorStr) {
        bulkLastError = bulkLastErrorStr;
      }
    }
    
    // 3. Get freshness metrics
    const universe = await getUniverse('sp500');
    const metrics = await getFreshnessMetrics(universe);
    
    // 4. Check for freshness incident (log-based alert)
    // Alert if p99 > 10 min during market hours (07:30-16:00 ET)
    const { nowET, toET } = await import('@/lib/utils/dateET');
    const etNow = nowET();
    const et = toET(etNow);
    const hours = et.hour;
    const minutes = et.minute;
    const isMarketHours = (hours >= 7 && hours < 16) || (hours === 7 && minutes >= 30);
    
    if (isMarketHours && metrics.agePercentiles && metrics.agePercentiles.p99 > 10) {
      console.error(`ALERT: Worker freshness incident - p99 age ${metrics.agePercentiles.p99.toFixed(1)}min exceeds 10min threshold during market hours`);
    }
    
    // 5. Determine overall status
    const isWorkerHealthy = workerLastSuccess && workerAgeMinutes !== null && workerAgeMinutes < 10;
    const isBulkHealthy = !bulkLastError && (bulkLastSuccess === null || (bulkAgeMinutes !== null && bulkAgeMinutes < 10));
    const isFreshnessHealthy = metrics.percentage.fresh > 80;
    
    const overallStatus = (isWorkerHealthy && isBulkHealthy && isFreshnessHealthy) ? 'healthy' :
                         (isWorkerHealthy || isBulkHealthy) ? 'degraded' : 'unhealthy';
    
    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      worker: {
        lastSuccess: workerLastSuccess ? new Date(workerLastSuccess).toISOString() : null,
        ageMinutes: workerAgeMinutes,
        isHealthy: isWorkerHealthy
      },
      bulkPreload: {
        lastSuccess: bulkLastSuccess ? new Date(bulkLastSuccess).toISOString() : null,
        lastDurationMs: bulkLastDuration,
        lastDurationMin: bulkLastDuration ? (bulkLastDuration / 60000).toFixed(1) : null,
        lastError: bulkLastError,
        ageMinutes: bulkAgeMinutes,
        isHealthy: isBulkHealthy,
        warnings: bulkLastDuration && bulkLastDuration > 6 * 60 * 1000 ? ['Duration exceeds 6min threshold'] : []
      },
      freshness: {
        fresh: metrics.fresh,
        recent: metrics.recent,
        stale: metrics.stale,
        veryStale: metrics.veryStale,
        total: metrics.total,
        missing: universe.length - metrics.total,
        percentageFresh: metrics.percentage.fresh,
        agePercentiles: metrics.agePercentiles,
        isHealthy: isFreshnessHealthy
      },
      universe: {
        size: universe.length
      }
    }, {
      status: overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (error) {
    console.error('Error in worker health check:', error);
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}

