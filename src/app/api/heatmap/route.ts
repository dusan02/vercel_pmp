import { NextRequest, NextResponse } from 'next/server';
import { getHeatmapData } from '@/lib/heatmap/heatmapService';

const ETAG_BUCKET_SIZE = 5000;
// With the Yahoo real-time overlay, DB prices update every ~60s during
// active sessions — a 5-min cache age cap would double the visible lag.
const MAX_DATA_AGE_FOR_ETAG = 60 * 1000;

/**
 * Heatmap endpoint - HTTP layer over getHeatmapData (src/lib/heatmap/heatmapService.ts).
 * Handles request params, ETag/304, cache headers, and error responses;
 * the data pipeline (Redis cache → DB → transform) lives in the service so
 * homepage SSR can call it directly instead of self-fetching this route.
 */
export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get('limit');
    const parsedLimit = limitParam ? Number(limitParam) : NaN;
    // NaN (non-numeric ?limit=) must not reach prisma.take — it 500s.
    const requestedLimit = isFinite(parsedLimit) ? Math.max(1, Math.min(3000, parsedLimit)) : null;
    const timeframe = request.nextUrl.searchParams.get('timeframe') || 'day';
    const forceRefresh = request.nextUrl.searchParams.get('force') === 'true';
    const debug = request.nextUrl.searchParams.get('debug') === 'true';
    const ifNoneMatch = request.headers.get('if-none-match');

    const timeBucket = Math.floor(Date.now() / ETAG_BUCKET_SIZE);
    const etag = `"heatmap-${timeBucket}"`;

    const result = await getHeatmapData({ limit: requestedLimit, timeframe, forceRefresh, debug });

    if (result.ok) {
      // ETag 304 only applies to cache hits — fresh DB results are new data.
      if (result.fromCache && ifNoneMatch === etag) {
        if (result.dataAgeMs < MAX_DATA_AGE_FOR_ETAG) {
          console.log(`✅ Heatmap ETag match - returning 304 (data age: ${Math.floor(result.dataAgeMs / 1000)}s)`);
          return new NextResponse(null, {
            status: 304,
            headers: {
              'ETag': etag,
              'Cache-Control': 'public, max-age=10, stale-while-revalidate=30'
            }
          });
        }
        console.log(`⚠️ Heatmap ETag match but data is stale (${Math.floor(result.dataAgeMs / 1000)}s old) - forcing refresh`);
      }

      return NextResponse.json({
        success: true,
        data: result.payload,
        rows: result.rows,
        cached: result.fromCache,
        count: result.count,
        timestamp: new Date().toISOString(),
        lastUpdatedAt: result.lastUpdatedAt,
        ...(debug && result.debugStats ? { debug: result.debugStats } : {}),
      }, {
        headers: {
          'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
          'ETag': etag,
        },
      });
    }

    // Error paths — 'db_error' is a real 500; 'empty'/'no_results' are
    // valid "no data" states and stay 200 (same contract as before).
    const status = result.kind === 'db_error' ? 500 : 200;
    return NextResponse.json({
      success: false,
      error: result.error,
      data: [],
      count: 0,
      timestamp: new Date().toISOString(),
      ...(debug && result.debug ? result.debug : {}),
    }, { status });
  } catch (error) {
    console.error('❌ Error in /api/heatmap:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: [],
        count: 0,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
