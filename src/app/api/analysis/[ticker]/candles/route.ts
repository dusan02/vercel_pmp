import { NextResponse } from 'next/server';
import {
  getCandlesPayload,
  MissingPolygonKeyError,
  type Candle,
  type MetricStats,
  type ValuationMetricKey,
} from '@/lib/analysis/candlesData';

export type { Candle, MetricStats, ValuationMetricKey };

export const revalidate = 3600;

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

/**
 * Returns ~10 years of weekly OHLC candles + valuation multiples/fair value
 * for the given ticker. Backed by Stale-While-Revalidate cache + parallel
 * Polygon/SQLite loading in `src/lib/analysis/candlesData.ts`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  try {
    const payload = await getCandlesPayload(ticker);
    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    if (error instanceof MissingPolygonKeyError) {
      return NextResponse.json({ error: 'Missing Polygon API key' }, { status: 500 });
    }
    console.error(`Error fetching candles for ${ticker.toUpperCase()}:`, error);
    return NextResponse.json({ error: 'Failed to fetch candles' }, { status: 500 });
  }
}
