import { NextResponse } from 'next/server';

export const revalidate = 3600;

interface PolygonAgg {
  t: number; // timestamp (ms)
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

export interface Candle {
  t: number; // timestamp (ms, start of week)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * Returns ~5 years of weekly OHLC candles for the given ticker.
 * Sources daily aggregates from Polygon (to avoid DELAYED status on weekly),
 * then downsamples to weekly in code. Cached aggressively at the edge.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing Polygon API key' }, { status: 500 });
  }

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(toDate.getFullYear() - 5);

  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  // Fetch daily data (works for recent data unlike weekly DELAYED)
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Polygon API error: ${res.statusText}` },
        { status: res.status }
      );
    }

    const json = await res.json();
    const aggs: PolygonAgg[] = json.results ?? [];

    if (!aggs.length) {
      return NextResponse.json({ symbol, candles: [] }, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
      });
    }

    // Downsample daily to weekly: keep last row of each ISO-week bucket
    const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
    const weekMap = new Map<number, PolygonAgg>();
    for (const agg of aggs) {
      const weekKey = Math.floor(agg.t / MS_WEEK);
      weekMap.set(weekKey, agg);
    }
    const weekly = Array.from(weekMap.values()).sort((a, b) => a.t - b.t);

    const candles: Candle[] = weekly
      .filter((a) => a && a.o > 0 && a.h > 0 && a.l > 0 && a.c > 0)
      .map((a) => ({
        t: a.t,
        o: parseFloat(a.o.toFixed(2)),
        h: parseFloat(a.h.toFixed(2)),
        l: parseFloat(a.l.toFixed(2)),
        c: parseFloat(a.c.toFixed(2)),
        v: Math.round(a.v),
      }));

    return NextResponse.json(
      { symbol, candles },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error) {
    console.error(`Error fetching candles for ${symbol}:`, error);
    return NextResponse.json({ error: 'Failed to fetch candles' }, { status: 500 });
  }
}
