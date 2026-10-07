import { NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { prisma } from '@/lib/db/prisma';
import { TICKER_RENAMES, foreignCutoffMs, spliceContinuous } from '@/lib/tickerRenames';

export const revalidate = 3600;

const CANDLES_CACHE_TTL = 3600; // 1 hour
const MS_DAY = 24 * 60 * 60 * 1000;

interface PolygonAgg {
  t: number; // timestamp (ms)
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

async function fetchDailyAggs(symbol: string, fromStr: string, toStr: string, apiKey: string): Promise<PolygonAgg[]> {
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Polygon ${symbol} ${res.status}: ${res.statusText}`);
  return (await res.json()).results ?? [];
}

/**
 * Daily aggs with ticker-reuse contamination removed: bars that belong to a
 * different instrument (the symbol's previous holder) are dropped, and for
 * renamed companies the old ticker's real history is spliced back in so the
 * chart keeps its full depth (META = FB pre-2022-06-09 + META after).
 */
async function fetchSanitizedDailyAggs(symbol: string, fromStr: string, toStr: string, apiKey: string): Promise<PolygonAgg[]> {
  const aggs = await fetchDailyAggs(symbol, fromStr, toStr, apiKey);
  const cutoffMs = foreignCutoffMs(symbol, aggs);
  if (cutoffMs == null) return aggs;

  const kept = aggs.filter((a) => a.t >= cutoffMs && a.c > 0);
  const rename = TICKER_RENAMES[symbol];
  if (!rename?.source || !kept.length) return kept;

  try {
    const toBefore = new Date(kept[0]!.t - MS_DAY).toISOString().slice(0, 10);
    if (toBefore < fromStr) return kept;
    const src = await fetchDailyAggs(rename.source, fromStr, toBefore, apiKey);
    const usable = src.filter((a) => a.t < kept[0]!.t && a.c > 0 && a.o > 0);
    const last = usable[usable.length - 1];
    if (last && spliceContinuous(last.c, kept[0]!.c)) {
      return [...usable, ...kept];
    }
  } catch { /* splice is best-effort — truncate-only is still correct */ }
  return kept;
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
  /** TTM P/S */
  ps?: number | null;
  /** price ÷ book value per share */
  pb?: number | null;
  /** EV ÷ TTM EBIT (D&A unavailable → EBIT basis, not EBITDA) */
  evEbit?: number | null;
  /** TTM FCF ÷ market cap — decimal, may be negative (cash burn) */
  fcfYield?: number | null;
  /** market cap at this close (USD) */
  mcap?: number | null;
}

export interface MetricStats {
  median: number;
  p25: number;
  p75: number;
  n: number;
}

export type ValuationMetricKey = 'pe' | 'ps' | 'pb' | 'evEbit' | 'fcfYield';

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

  // Fetch daily data (works for recent data unlike weekly DELAYED).
  // Sanitizes foreign-instrument prefixes left over from ticker reuse and
  // splices the renamed company's real history back in from its old ticker.
  try {
    const aggs = await fetchSanitizedDailyAggs(symbol, fromStr, toStr, apiKey);

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

    // Attach per-candle valuation multiples — the client draws the metric
    // chart (P/E · P/S · P/B · EV/EBIT · FCF yield) plus median/quartile band
    // from this without a second request. Rows are daily; each candle takes
    // the values of its close day (last row ≤ t).
    let valuationStats: Partial<Record<ValuationMetricKey, MetricStats>> | null = null;
    // Latest-statement net debt — lets the client scale today's EV/EBIT from
    // the live quote (EV = mcap + netDebt) without another request.
    let evNetDebt: number | null = null;
    try {
      const valRows = await prisma.dailyValuationHistory.findMany({
        where: { symbol, date: { gte: fromDate } },
        orderBy: { date: 'asc' },
        select: {
          date: true, peRatio: true, psRatio: true, pbRatio: true,
          evEbitda: true, fcfYield: true, marketCap: true,
        },
      });
      if (valRows.length) {
        const times = valRows.map(r => r.date.getTime());
        let vi = 0;
        for (const c of candles) {
          // candle t = first trading day; close happens at end of week —
          // a valuation row up to 4 days after t still belongs to this week.
          const end = c.t + 4 * 24 * 60 * 60 * 1000;
          while (vi < times.length - 1 && times[vi + 1]! <= end) vi++;
          if (times[vi]! <= end) {
            const r = valRows[vi]!;
            c.pe = r.peRatio; c.ps = r.psRatio; c.pb = r.pbRatio;
            c.evEbit = r.evEbitda; c.fcfYield = r.fcfYield; c.mcap = r.marketCap;
          }
        }

        // Distribution stats over the FULL available series per metric — the
        // timeframe toggle changes what is displayed, never the valuation
        // methodology (a 1Y view must not quietly recompute the median from
        // 1Y data). Ratios are stored null when the denominator ≤ 0, so only
        // fcfYield legitimately carries negative values (cash burn).
        const statsOf = (
          pick: (r: (typeof valRows)[number]) => number | null,
          allowNegative = false,
        ): MetricStats | null => {
          const vals = valRows
            .map(pick)
            .filter((v): v is number => v != null && Number.isFinite(v) && (allowNegative || v > 0))
            .sort((a, b) => a - b);
          if (vals.length < 10) return null;
          const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))]!;
          return { median: q(0.5), p25: q(0.25), p75: q(0.75), n: vals.length };
        };
        valuationStats = {};
        const entries: [ValuationMetricKey, MetricStats | null][] = [
          ['pe', statsOf(r => r.peRatio)],
          ['ps', statsOf(r => r.psRatio)],
          ['pb', statsOf(r => r.pbRatio)],
          ['evEbit', statsOf(r => r.evEbitda)],
          ['fcfYield', statsOf(r => r.fcfYield, true)],
        ];
        for (const [k, s] of entries) if (s) valuationStats[k] = s;

        const bs = await prisma.financialStatement.findFirst({
          where: { symbol, totalDebt: { not: null }, cashAndEquivalents: { not: null } },
          orderBy: { endDate: 'desc' },
          select: { totalDebt: true, cashAndEquivalents: true },
        });
        if (bs) evNetDebt = bs.totalDebt! - bs.cashAndEquivalents!;
      }
    } catch { /* valuation overlay is optional — candles still render */ }

    // Benchmark overlay metadata — the chart offers a "vs sector" chip whose
    // ETF proxy is resolved here from the ticker's stored sector (Finviz
    // naming). The series itself is fetched lazily from /api/indices/weekly.
    const SECTOR_ETF: Record<string, string> = {
      'Financial Services': 'XLF',
      'Technology': 'XLK',
      'Healthcare': 'XLV',
      'Industrials': 'XLI',
      'Consumer Cyclical': 'XLY',
      'Consumer Defensive': 'XLP',
      'Energy': 'XLE',
      'Basic Materials': 'XLB',
      'Real Estate': 'XLRE',
      'Utilities': 'XLU',
      'Communication Services': 'XLC',
    };
    let sector: string | null = null;
    let sectorEtf: string | null = null;
    try {
      const t = await prisma.ticker.findUnique({
        where: { symbol },
        select: { sector: true },
      });
      sector = t?.sector ?? null;
      sectorEtf = (sector && SECTOR_ETF[sector]) || null;
    } catch { /* sector chip is optional */ }

    const responseBody = {
      symbol,
      candles,
      // Back-compat alias — the deployed P/E view reads peStats; the new
      // multi-metric view reads valuationStats.
      peStats: valuationStats?.pe ?? null,
      valuationStats,
      evNetDebt,
      sector,
      sectorEtf,
    };

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
