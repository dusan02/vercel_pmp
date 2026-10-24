import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { getSessionIntraday } from '@/lib/market/intradayPoints';
import { prisma } from '@/lib/db/prisma';
import { createETDate, getDateET } from '@/lib/utils/dateET';
import { downsampleSeries } from '@/lib/utils/screener';

// Session-aware like the intraday route — never prerender at build time.
export const dynamic = 'force-dynamic';

const MS_DAY = 24 * 60 * 60 * 1000;
const MAX_POINTS = 60;

type SparkRange = '1d' | '1w' | '1m' | '3m' | '6m' | 'ytd' | '1y';
const RANGES = new Set<SparkRange>(['1d', '1w', '1m', '3m', '6m', 'ytd', '1y']);

/**
 * Lightweight close-price series for the heatmap tooltip sparkline.
 * Ranges mirror the heatmap performance metrics (heatmapService perf refs):
 * - 1d  → Polygon 5-min bars for the current/last session (shared logic)
 * - 1w  → DailyValuationHistory closes, ~last 5 sessions
 * - 1m  → closes since ~30d back (same ref target as the month metric)
 * - 3m  → closes since ~91d back (same ref as the quarter metric)
 * - 6m  → closes since ~182d back (same ref as the halfyear metric)
 * - ytd → closes since Jan 1 ET (same ref as the ytd metric)
 * - 1y  → closes since ~365d back
 * The live Ticker.lastPrice is appended as the final point so the spark
 * ends at "now", matching the tile's live coloring.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();
    const rangeParam = new URL(request.url).searchParams.get('range') ?? '1d';
    const range: SparkRange = (RANGES.has(rangeParam as SparkRange) ? rangeParam : '1d') as SparkRange;

    const cacheKey = `sparkline:${symbol}:${range}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch {}

    let prices: number[] = [];
    let ttl = 900;

    if (range === '1d') {
        const apiKey = process.env.POLYGON_API_KEY;
        if (apiKey && !apiKey.startsWith('dummy')) {
            const { points, session } = await getSessionIntraday(symbol, apiKey);
            prices = downsampleSeries(points.map((p) => p.price), MAX_POINTS);
            ttl = points.length > 0 ? (session === 'closed' ? 900 : 300) : 60;
        }
    } else {
        const now = new Date();
        const from: Record<Exclude<SparkRange, '1d'>, Date> = {
            '1w': new Date(now.getTime() - 10 * MS_DAY),
            '1m': new Date(now.getTime() - 32 * MS_DAY),
            '3m': new Date(now.getTime() - 95 * MS_DAY),
            '6m': new Date(now.getTime() - 185 * MS_DAY),
            'ytd': createETDate(`${getDateET(now).slice(0, 4)}-01-01`),
            '1y': new Date(now.getTime() - 370 * MS_DAY),
        };
        try {
            const [rows, live] = await Promise.all([
                prisma.dailyValuationHistory.findMany({
                    where: { symbol, date: { gte: from[range] }, closePrice: { not: null, gt: 0 } },
                    select: { closePrice: true },
                    orderBy: { date: 'asc' },
                }),
                prisma.ticker.findUnique({ where: { symbol }, select: { lastPrice: true } }),
            ]);
            prices = downsampleSeries(
                rows.map((r) => r.closePrice!).filter((c) => Number.isFinite(c)),
                MAX_POINTS,
            );
            // Append the live price as the spark tip when it differs from the
            // last stored close — keeps the chart consistent with tile %.
            const last = prices[prices.length - 1];
            if (live?.lastPrice != null && live.lastPrice > 0 && live.lastPrice !== last) {
                prices.push(live.lastPrice);
            }
        } catch {
            // DB miss → empty series, short cache below
            ttl = 60;
        }
    }

    const response = { symbol, range, prices };
    try {
        await setCachedData(cacheKey, response, prices.length > 0 ? ttl : 60);
    } catch {}

    return NextResponse.json(response);
}
