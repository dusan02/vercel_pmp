import { NextRequest, NextResponse } from 'next/server';
import { getEnvConfig } from '@/lib/envConfig';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';
    
    const config = getEnvConfig();
    
    const response: any = {
      success: true,
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        project: config.project,
        domain: config.domain,
        isProduction: config.isProduction,
      },
      redis: {
        status: 'unhealthy',
        message: 'Redis not available in Edge Runtime',
        connected: false,
      },
      cache: {
        enabled: true,
        type: 'memory',
        fallback: true,
      }
    };

    // Add detailed information if requested
    if (detailed) {
      response.redisConfig = {
        url: 'not available in Edge Runtime',
        token: 'not available in Edge Runtime',
        environment: process.env.NODE_ENV,
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