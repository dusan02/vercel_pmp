import { NextRequest, NextResponse } from 'next/server';
import { checkRedisHealth } from '@/lib/redis';
import { getEnvConfig } from '@/lib/envConfig';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';
    
    const config = getEnvConfig();
    const health = await checkRedisHealth();
    
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        project: config.project,
        domain: config.domain,
        isProduction: config.isProduction,
      },
      redis: {
        status: health.status,
        message: health.message,
        connected: health.status === 'healthy',
      },
      cache: {
        enabled: true,
        type: config.isProduction ? 'redis' : 'memory',
        fallback: !config.isProduction || !process.env.UPSTASH_REDIS_REST_URL,
      }
    };

    // Add detailed information if requested
    if (detailed) {
      response.redis = {
        ...response.redis,
        config: {
          url: process.env.UPSTASH_REDIS_REST_URL ? 'configured' : 'not configured',
          token: process.env.UPSTASH_REDIS_REST_TOKEN ? 'configured' : 'not configured',
          environment: process.env.NODE_ENV,
        }
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Error in /api/health/redis:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Health check failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Edge function configuration for Vercel
export const runtime = 'edge';
export const preferredRegion = 'iad1'; // US East (N. Virginia) 