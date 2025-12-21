import { NextRequest, NextResponse } from 'next/server';
import { prometheusMetrics } from '@/lib/api/prometheus';

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

    // Set Redis connection status to 0 for Edge Runtime (no Redis support)
    prometheusMetrics.updateRedisConnections(0);
    prometheusMetrics.updateCacheSize(0);

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

// Node.js runtime required for process.uptime()
export const runtime = 'nodejs';
export const preferredRegion = 'iad1'; // US East (N. Virginia) 