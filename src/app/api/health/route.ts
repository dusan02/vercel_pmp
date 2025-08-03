import { NextRequest, NextResponse } from 'next/server';
import { checkRedisHealth } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const redisHealth = await checkRedisHealth();
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisHealth,
        api: {
          status: 'healthy',
          message: 'API is responding'
        }
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        vercel: process.env.VERCEL === '1' ? 'true' : 'false'
      }
    };

    // If Redis is unhealthy, mark overall status as degraded
    if (redisHealth.status === 'unhealthy') {
      healthStatus.status = 'degraded';
    }

    return NextResponse.json(healthStatus);

  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 