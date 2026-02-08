import { NextRequest, NextResponse } from 'next/server';

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  userAgent: string;
  url: string;
  id?: string;
  label?: string;
  rating?: string;
  startTime?: number;
  delta?: number;
  path?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { metrics, sessionId } = body;

    if (!metrics || !Array.isArray(metrics)) {
      return NextResponse.json(
        { error: 'Invalid metrics data' },
        { status: 400 }
      );
    }

    // Log performance metrics (in production, send to analytics service)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Performance metrics received:', {
        sessionId,
        metricsCount: metrics.length,
        timestamp: new Date().toISOString(),
      });
    }

    // Process and store metrics
    const processedMetrics = metrics.map((metric: PerformanceMetric) => ({
      ...metric,
      timestamp: Date.now(),
      userAgent: request.headers.get('user-agent') || 'unknown',
      url: request.headers.get('referer') || 'unknown',
    }));

    // In a real application, you would:
    // 1. Store metrics in a database
    // 2. Send to analytics service (Google Analytics, Vercel Analytics, etc.)
    // 3. Trigger alerts for poor performance
    // 4. Generate performance reports

    // Example: Store in database
    // await prisma.performanceMetric.createMany({
    //   data: processedMetrics,
    // });

    // Example: Send to external analytics
    // await fetch('https://analytics.example.com/metrics', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(processedMetrics),
    // });

    return NextResponse.json({
      success: true,
      message: 'Performance metrics recorded',
      count: processedMetrics.length,
    });
  } catch (error) {
    console.error('Error processing performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to process metrics' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || '24h';
    const metric = searchParams.get('metric') || 'all';

    // In a real application, you would fetch metrics from database
    // const metrics = await prisma.performanceMetric.findMany({
    //   where: {
    //     timestamp: {
    //       gte: new Date(Date.now() - getTimeRangeInMs(timeRange)),
    //     },
    //     ...(metric !== 'all' && { name: metric }),
    //   },
    //   orderBy: { timestamp: 'desc' },
    //   take: 1000,
    // });

    // Mock data for demonstration
    const mockMetrics = {
      fcp: { avg: 1200, p95: 1800, p99: 2200 },
      lcp: { avg: 2500, p95: 3500, p99: 4500 },
      fid: { avg: 50, p95: 100, p99: 150 },
      cls: { avg: 0.05, p95: 0.1, p99: 0.15 },
      ttfb: { avg: 300, p95: 500, p99: 800 },
    };

    return NextResponse.json({
      success: true,
      data: {
        timeRange,
        metric,
        metrics: mockMetrics,
        summary: {
          totalRequests: 15420,
          averageLoadTime: 1200,
          performanceScore: 85,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

function getTimeRangeInMs(timeRange: string): number {
  const now = Date.now();
  switch (timeRange) {
    case '1h':
      return now - 60 * 60 * 1000;
    case '24h':
      return now - 24 * 60 * 60 * 1000;
    case '7d':
      return now - 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return now - 30 * 24 * 60 * 60 * 1000;
    default:
      return now - 24 * 60 * 60 * 1000; // Default to 24h
  }
} 