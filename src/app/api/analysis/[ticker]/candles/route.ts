import { NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { prisma } from '@/lib/db/prisma';

export const revalidate = 3600;

const CANDLES_CACHE_TTL = 3600; // 1 hour

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
  /** TTM P/E on the candle's close day (DailyValuationHistory) — null outside coverage */
  pe?: number | null;
}

/**
 * Returns ~10 years of weekly OHLC candles for the given ticker.
 * Sources daily aggregates from Polygon (to avoid DELAYED status on weekly),
 * then downsamples to weekly in code. Cached aggressively at the edge.
 * Each candle carries the TTM P/E known that week so the client can draw a
 * "price at median P/E" overlay without a second request.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  // Check Redis cache first
  const cacheKey = `candles:${symbol}`;
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
      const emptyResponse = { symbol, candles: [] };
      try { await setCachedData(cacheKey, emptyResponse, CANDLES_CACHE_TTL); } catch {}
      return NextResponse.json(emptyResponse, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
      });
    }

    // Downsample daily → weekly: proper OHLC aggregation
    // open = first trading day's open, high = week max, low = week min,
    // close = last trading day's close, volume = sum, t = first day's timestamp.
    // Epoch weeks are Thursday-anchored — shift by 4d so buckets are
    // Monday–Sunday calendar weeks instead.
    const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
    const MS_MONDAY_OFFSET = 4 * 24 * 60 * 60 * 1000;
    type WeekBucket = { t: number; o: number; h: number; l: number; c: number; v: number };
    const weekMap = new Map<number, WeekBucket>();
    for (const agg of aggs) {
      if (!agg || agg.o <= 0) continue;
      const weekKey = Math.floor((agg.t - MS_MONDAY_OFFSET) / MS_WEEK);
      const existing = weekMap.get(weekKey);
      if (!existing) {
        weekMap.set(weekKey, { t: agg.t, o: agg.o, h: agg.h, l: agg.l, c: agg.c, v: agg.v });
      } else {
        existing.h = Math.max(existing.h, agg.h);
        existing.l = Math.min(existing.l, agg.l);
        existing.c = agg.c;   // last trading day's close
        existing.v += agg.v;  // cumulative volume
      }
    }
    const weekly = Array.from(weekMap.values()).sort((a, b) => a.t - b.t);

    const candles: Candle[] = weekly
      .filter((a) => a.o > 0 && a.h > 0 && a.l > 0 && a.c > 0)
      .map((a) => ({
        t: a.t,
        o: parseFloat(a.o.toFixed(2)),
        h: parseFloat(a.h.toFixed(2)),
        l: parseFloat(a.l.toFixed(2)),
        c: parseFloat(a.c.toFixed(2)),
        v: Math.round(a.v),
      }));

    // Attach TTM P/E per candle — the client draws a "price at historical
    // median P/E" line from this without a second request. peRatio rows are
    // daily; each candle takes the value of its close day (last row ≤ t).
    let peStats: { median: number; p25: number; p75: number; n: number } | null = null;
    try {
      const valRows = await prisma.dailyValuationHistory.findMany({
        where: { symbol, date: { gte: fromDate }, peRatio: { not: null } },
        orderBy: { date: 'asc' },
        select: { date: true, peRatio: true },
      });
      if (valRows.length) {
        const times = valRows.map(r => r.date.getTime());
        const pes = valRows.map(r => r.peRatio!);
        let vi = 0;
        for (const c of candles) {
          // candle t = first trading day; close happens at end of week —
          // a P/E row up to 4 days after t still belongs to this week.
          const end = c.t + 4 * 24 * 60 * 60 * 1000;
          while (vi < times.length - 1 && times[vi + 1]! <= end) vi++;
          c.pe = times[vi]! <= end ? pes[vi]! : c.pe ?? null;
        }

        // Distribution stats over the FULL available series — the timeframe
        // toggle changes what is displayed, never the valuation methodology
        // (a 1Y view must not quietly recompute the median from 1Y data).
        const sorted = [...pes].filter(v => v > 0 && Number.isFinite(v)).sort((a, b) => a - b);
        if (sorted.length >= 10) {
          const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
          peStats = { median: q(0.5), p25: q(0.25), p75: q(0.75), n: sorted.length };
        }
      }
    } catch { /* valuation overlay is optional — candles still render */ }

    const responseBody = { symbol, candles, peStats };

    // Cache in Redis (1 hour TTL)
    try { await setCachedData(cacheKey, responseBody, CANDLES_CACHE_TTL); } catch {}

    return NextResponse.json(
      responseBody,
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
