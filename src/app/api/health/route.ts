import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Simple health check with timeout protection
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
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

    // Try Redis check with timeout (optional)
    try {
      const redisCheckPromise = import('@/lib/redis').then(m => m.checkRedisHealth());
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis check timeout')), 1000)
      );
      
      const redisHealth = await Promise.race([redisCheckPromise, timeoutPromise]) as any;
      healthStatus.services.redis = redisHealth;
      
      if (redisHealth?.status === 'unhealthy') {
        healthStatus.status = 'degraded';
      }
    } catch (error) {
      // Redis check failed or timed out - mark as degraded but still return healthy
      healthStatus.services.redis = {
        status: 'unavailable',
        message: error instanceof Error ? error.message : 'Redis check failed'
      };
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