import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

export const revalidate = 3600;

const CACHE_TTL = 3600; // 1 hour — the in-progress week keeps updating

/**
 * ~10 years of weekly closes for a benchmark symbol (SPY, QQQ, XLF…), used
 * by the analysis price chart to overlay "JPM vs S&P 500 / sector" lines.
 *
 * The series is ticker-independent → one global Redis cache key per symbol
 * means the whole site costs ~1 Polygon call/hour per benchmark, not one
 * per page view. Polygon index tickers aren't in our tier, so benchmarks
 * are ETF proxies — the same trade-off the header strip already makes.
 */
export async function GET(req: NextRequest) {
  const symbol = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!/^[A-Z][A-Z.]{0,6}$/.test(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  const cacheKey = `idxweekly:${symbol}`;
  try {
    const cached = await getCachedData(cacheKey);
    if (cached) return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch {}

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing Polygon API key' }, { status: 500 });
  }

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(toDate.getFullYear() - 10);
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/` +
    `${fromDate.toISOString().slice(0, 10)}/${toDate.toISOString().slice(0, 10)}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json({ error: `Polygon API error: ${res.statusText}` }, { status: res.status });
    }
    const json = await res.json();
    const aggs: { t: number; c: number }[] = json.results ?? [];
    if (!aggs.length) {
      return NextResponse.json({ error: 'No data' }, { status: 404 });
    }

    // Same Monday-anchored week bucketing as the ticker candles route so
    // client-side joins on week keys align exactly.
    const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
    const MS_MONDAY_OFFSET = 4 * 24 * 60 * 60 * 1000;
    const weekMap = new Map<number, { t: number; c: number }>();
    for (const a of aggs) {
      if (!a || a.c <= 0) continue;
      const wk = Math.floor((a.t - MS_MONDAY_OFFSET) / MS_WEEK);
      const cur = weekMap.get(wk);
      if (!cur) weekMap.set(wk, { t: a.t, c: a.c });
      else cur.c = a.c; // last trading day's close
    }
    const points = Array.from(weekMap.values()).sort((a, b) => a.t - b.t);

    const body = { symbol, points };
    try { await setCachedData(cacheKey, body, CACHE_TTL); } catch {}
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error(`Error fetching weekly benchmark ${symbol}:`, err);
    return NextResponse.json({ error: 'Failed to fetch benchmark data' }, { status: 500 });
  }
}
