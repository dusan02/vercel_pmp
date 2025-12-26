import { NextRequest, NextResponse } from 'next/server';
import { getFreshnessMetrics } from '@/lib/utils/freshnessMetrics';
import { getUniverse } from '@/lib/redis/operations';

/**
 * Freshness metrics API endpoint
 * Returns data freshness metrics for all tracked tickers
 * 
 * GET /api/metrics/freshness
 */
export async function GET(request: NextRequest) {
  try {
    // Get universe to determine total size
    const universe = await getUniverse('sp500');
    const universeSize = universe.length;

    // Get freshness metrics
    const metrics = await getFreshnessMetrics();

    // Calculate additional stats
    const totalWithData = metrics.fresh + metrics.recent + metrics.stale + metrics.veryStale;
    const missingData = universeSize - totalWithData;

    return NextResponse.json({
      success: true,
      metrics: {
        fresh: metrics.fresh,
        recent: metrics.recent,
        stale: metrics.stale,
        veryStale: metrics.veryStale,
        total: metrics.total,
        missing: missingData,
        percentage: metrics.percentage,
        agePercentiles: metrics.agePercentiles
      },
      thresholds: {
        freshMax: 2,      // < 2 minutes
        recentMax: 5,    // 2-5 minutes
        staleMax: 15,    // 5-15 minutes
        // veryStale is implicitly > staleMax (15 minutes)
      },
      universe: {
        name: 'sp500',
        size: universeSize
      },
      generatedAt: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60'
      }
    });
  } catch (error) {
    console.error('Error getting freshness metrics:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

