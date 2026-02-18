/**
 * Health check endpoint (Canary Sanity Check)
 * 
 * Aggregates:
 * - Database connection (Prisma)
 * - Redis connection
 * - Worker status (last success timestamp)
 * - Cron status (last success timestamp)
 * - Worker health (/api/health/worker)
 * - Redis health (/api/health/redis)
 * - Freshness metrics (/api/metrics/freshness)
 * 
 * Usage: GET /api/health
 * 
 * This is a canary endpoint - one curl = 3 checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRedisHealth } from '@/lib/redis';
import { prisma } from '@/lib/db/prisma';

// Health check thresholds
const WORKER_STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const CRON_STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      message: string;
      responseTime?: number;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      message: string;
    };
    worker: {
      status: 'healthy' | 'stale' | 'unknown';
      message: string;
      lastSuccess?: string;
      ageMinutes?: number;
    };
    cron: {
      status: 'healthy' | 'stale' | 'unknown';
      message: string;
      lastSuccess?: string;
      ageHours?: number;
    };
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'unhealthy', message: 'Not checked yet' },
      redis: { status: 'unhealthy', message: 'Not checked yet' },
      worker: { status: 'unknown', message: 'Not checked yet' },
      cron: { status: 'unknown', message: 'Not checked yet' },
    },
  };

  // 1. Check database
  try {
    const dbStartTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbResponseTime = Date.now() - dbStartTime;
    healthStatus.checks.database = {
      status: 'healthy',
      message: 'Database is connected and responding',
      responseTime: dbResponseTime,
    };
  } catch (error) {
    healthStatus.checks.database = {
      status: 'unhealthy',
      message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
    healthStatus.status = 'unhealthy';
  }

  // 2. Check Redis
  try {
    const redisHealth = await checkRedisHealth();
    healthStatus.checks.redis = {
      status: redisHealth.status,
      message: redisHealth.message,
    };
    if (redisHealth.status === 'unhealthy') {
      healthStatus.status = healthStatus.status === 'unhealthy' ? 'unhealthy' : 'degraded';
    }
  } catch (error) {
    healthStatus.checks.redis = {
      status: 'unhealthy',
      message: `Redis check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
    healthStatus.status = healthStatus.status === 'unhealthy' ? 'unhealthy' : 'degraded';
  }

  // 3. Check worker status (last success timestamp from Redis)
  try {
    const { redisClient } = await import('@/lib/redis');
    if (redisClient && redisClient.isOpen) {
      const workerLastSuccess = await redisClient.get('worker:last_success_ts');
      if (workerLastSuccess) {
        const lastSuccessTs = parseInt(workerLastSuccess, 10);
        const ageMs = Date.now() - lastSuccessTs;
        const ageMinutes = Math.floor(ageMs / 60000);

        if (ageMs < WORKER_STALE_THRESHOLD) {
          healthStatus.checks.worker = {
            status: 'healthy',
            message: `Worker is running (last success: ${ageMinutes} min ago)`,
            lastSuccess: new Date(lastSuccessTs).toISOString(),
            ageMinutes,
          };
        } else {
          healthStatus.checks.worker = {
            status: 'stale',
            message: `Worker may be stale (last success: ${ageMinutes} min ago)`,
            lastSuccess: new Date(lastSuccessTs).toISOString(),
            ageMinutes,
          };
          healthStatus.status = healthStatus.status === 'unhealthy' ? 'unhealthy' : 'degraded';
        }
      } else {
        healthStatus.checks.worker = {
          status: 'unknown',
          message: 'Worker status not available (no timestamp found)',
        };
        healthStatus.status = healthStatus.status === 'unhealthy' ? 'unhealthy' : 'degraded';
      }
    } else {
      healthStatus.checks.worker = {
        status: 'unknown',
        message: 'Cannot check worker status (Redis not available)',
      };
    }
  } catch (error) {
    healthStatus.checks.worker = {
      status: 'unknown',
      message: `Worker check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  // 4. Check cron status (last success timestamp from Redis)
  try {
    const { redisClient } = await import('@/lib/redis');
    if (redisClient && redisClient.isOpen) {
      const cronLastSuccess = await redisClient.get('cron:static_data:last_success_ts');
      if (cronLastSuccess) {
        const lastSuccessTs = parseInt(cronLastSuccess, 10);
        const ageMs = Date.now() - lastSuccessTs;
        const ageHours = Math.floor(ageMs / 3600000);

        if (ageMs < CRON_STALE_THRESHOLD) {
          healthStatus.checks.cron = {
            status: 'healthy',
            message: `Cron is running (last success: ${ageHours} hours ago)`,
            lastSuccess: new Date(lastSuccessTs).toISOString(),
            ageHours,
          };
        } else {
          healthStatus.checks.cron = {
            status: 'stale',
            message: `Cron may be stale (last success: ${ageHours} hours ago)`,
            lastSuccess: new Date(lastSuccessTs).toISOString(),
            ageHours,
          };
          healthStatus.status = healthStatus.status === 'unhealthy' ? 'unhealthy' : 'degraded';
        }
      } else {
        healthStatus.checks.cron = {
          status: 'unknown',
          message: 'Cron status not available (no timestamp found)',
        };
        // Cron is not critical for immediate operation, so don't degrade status
      }
    } else {
      healthStatus.checks.cron = {
        status: 'unknown',
        message: 'Cannot check cron status (Redis not available)',
      };
    }
  } catch (error) {
    healthStatus.checks.cron = {
      status: 'unknown',
      message: `Cron check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  // 5. Aggregate external health checks (canary sanity check)
  let workerHealth: any = null;
  let redisHealth: any = null;
  let freshnessMetrics: any = null;

  try {
    // Fetch worker health (internal call)
    const workerResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/health/worker`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (workerResponse.ok) {
      workerHealth = await workerResponse.json();
    }
  } catch (error) {
    console.warn('Failed to fetch worker health:', error);
  }

  try {
    // Fetch Redis health (internal call)
    const redisResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/health/redis`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (redisResponse.ok) {
      redisHealth = await redisResponse.json();
    }
  } catch (error) {
    console.warn('Failed to fetch Redis health:', error);
  }

  try {
    // Fetch freshness metrics (internal call)
    const freshnessResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/metrics/freshness`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (freshnessResponse.ok) {
      freshnessMetrics = await freshnessResponse.json();
    }
  } catch (error) {
    console.warn('Failed to fetch freshness metrics:', error);
  }

  // Determine overall canary status
  const canaryStatus = (
    healthStatus.status === 'healthy' &&
    workerHealth?.status === 'healthy' &&
    redisHealth?.status === 'healthy' &&
    freshnessMetrics?.success === true
  ) ? 'healthy' : 'degraded';

  // 6. Check worker operations health (saveRegularClose, bootstrapPreviousCloses)
  let operationsHealth: any = null;
  try {
    const { getAllHealthStatuses } = await import('@/workers/healthMonitor');
    const statuses = await getAllHealthStatuses();
    operationsHealth = statuses.reduce((acc: any, s: any) => {
      acc[s.operation] = {
        isHealthy: s.isHealthy,
        lastSuccessAt: s.lastSuccessAt,
        lastSuccessCount: s.lastSuccessCount,
        lastError: s.lastError,
        hoursSinceLastSuccess: s.hoursSinceLastSuccess,
      };
      return acc;
    }, {});
  } catch (error) {
    console.warn('Failed to fetch operations health:', error);
  }

  const totalResponseTime = Date.now() - startTime;
  const statusCode = canaryStatus === 'healthy' ? 200 : 503;

  return NextResponse.json(
    {
      ...healthStatus,
      canary: {
        status: canaryStatus,
        checks: {
          worker: workerHealth,
          redis: redisHealth,
          freshness: freshnessMetrics
        }
      },
      operations: operationsHealth,
      responseTime: totalResponseTime,
    },
    {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
