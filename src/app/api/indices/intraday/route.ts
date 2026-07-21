import { NextRequest, NextResponse } from 'next/server';
import { withRetry } from '@/lib/api/rateLimiter';

const INDICES = ['SPY', 'QQQ'];

export const revalidate = 300; // 5 min

export async function GET(_req: NextRequest) {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Polygon API key missing' }, { status: 500 });
  }

  try {
    // Polygon aggregates: 5-min bars for today
    const now = new Date();
    const todayIso = now.toISOString().split('T')[0];

    const results = await Promise.all(
      INDICES.map(async (ticker) => {
        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${todayIso}/${todayIso}?adjusted=true&sort=asc&limit=500&apiKey=${apiKey}`;
        const res = await withRetry(async () => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) }));
        if (!res.ok) return [ticker, []] as const;
        const json = await res.json();
        const points = Array.isArray(json.results)
          ? json.results
              .filter((p: any) => p.c)
              .map((p: any) => ({ ts: new Date(p.t).toISOString(), price: p.c }))
          : [];
        return [ticker, points] as const;
      })
    );

    const map: Record<string, { ts: string; price: number }[]> = {};
    results.forEach(([ticker, pts]) => {
      map[ticker] = pts;
    });

    return NextResponse.json({ data: map }, { status: 200, headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=300' } });
  } catch (error) {
    console.error('Error fetching index intraday:', error);
    return NextResponse.json({ error: 'Failed to fetch intraday data' }, { status: 500 });
  }
}
