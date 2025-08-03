import { NextRequest, NextResponse } from 'next/server';
import { prometheusMetrics } from '@/lib/prometheus';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'prometheus';
    
    // Basic security check for production
    if (process.env.NODE_ENV === 'production') {
      const authHeader = request.headers.get('authorization');
      const expectedAuth = `Bearer ${process.env.METRICS_SECRET_KEY || 'default-metrics-key'}`;
      
      if (authHeader !== expectedAuth) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    // Update Redis connection status
    try {
      const { redisClient } = await import('@/lib/redis');
      const isConnected = redisClient && redisClient.isOpen;
      prometheusMetrics.updateRedisConnections(isConnected ? 1 : 0);
    } catch (error) {
      prometheusMetrics.updateRedisConnections(0);
    }

    // Update cache size
    try {
      const { redisClient } = await import('@/lib/redis');
      if (redisClient && redisClient.isOpen) {
        const keys = await redisClient.keys('*');
        let totalSize = 0;
        
        for (const key of keys.slice(0, 10)) { // Sample first 10 keys
          try {
            const value = await redisClient.get(key);
            if (value) {
              totalSize += Buffer.byteLength(value, 'utf8');
            }
          } catch (error) {
            // Ignore individual key errors
          }
        }
        
        // Estimate total size based on sample
        const estimatedSize = keys.length > 0 ? (totalSize / 10) * keys.length : 0;
        prometheusMetrics.updateCacheSize(estimatedSize);
      }
    } catch (error) {
      prometheusMetrics.updateCacheSize(0);
    }

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        data: prometheusMetrics.getMetricsJson(),
        timestamp: new Date().toISOString()
      });
    }

    // Default Prometheus format
    const metrics = prometheusMetrics.getMetrics();
    
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('❌ Error in /api/metrics:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Metrics collection failed', 
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