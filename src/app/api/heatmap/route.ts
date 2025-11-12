export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getHeatmap, getManyLast } from '@/lib/redisHelpers';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const session = (searchParams.get('session') ?? 'live') as 'pre' | 'live' | 'after';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);

    // Get top movers from heatmap (sorted set)
    const symbols = await getHeatmap(session, limit, true);

    if (!symbols.length) {
      return NextResponse.json(
        { success: true, data: [] },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Get price data for all symbols
    const map = await getManyLast(session, symbols);

    // Map symbols to price data, maintaining sort order from heatmap
    const items = symbols
      .map(sym => {
        const v = map.get(sym);
        if (!v) return null;

        return {
          ticker: sym,
          currentPrice: v.p,
          percentChange: v.change,
          as_of: new Date(v.ts).toISOString(),
          source: v.source,
          quality: v.quality
        };
      })
      .filter(Boolean)
      // Ensure sorted by percentChange descending (heatmap should already be sorted, but double-check)
      .sort((a: any, b: any) => (b.percentChange || 0) - (a.percentChange || 0));

    const cacheHdr = session === 'live'
      ? 'no-store'
      : 'public, s-maxage=15, stale-while-revalidate=30';

    return NextResponse.json(
      { success: true, data: items },
      { headers: { 'Cache-Control': cacheHdr } }
    );
  } catch (error) {
    console.error('Error in /api/heatmap:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

