import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/** Linear interpolation percentile on a sorted array */
function pct(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0]!;
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(Math.ceil(idx), sorted.length - 1);
    return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (idx - lo);
}

/** Build percentile stats object from a raw (unsorted) value array */
function buildStats(values: number[]) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return {
        avg: parseFloat(avg.toFixed(2)),
        p10: parseFloat(pct(sorted, 10).toFixed(2)),
        p25: parseFloat(pct(sorted, 25).toFixed(2)),
        median: parseFloat(pct(sorted, 50).toFixed(2)),
        p75: parseFloat(pct(sorted, 75).toFixed(2)),
        p90: parseFloat(pct(sorted, 90).toFixed(2)),
        min: parseFloat((sorted[0] ?? 0).toFixed(2)),
        max: parseFloat((sorted[sorted.length - 1] ?? 0).toFixed(2)),
        count: sorted.length,
    };
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();

    try {
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

        // Fetch 10Y daily valuation history
        const rows = await prisma.dailyValuationHistory.findMany({
            where: { symbol, date: { gte: tenYearsAgo } },
            select: { date: true, peRatio: true, psRatio: true },
            orderBy: { date: 'asc' },
        });

        // Weekly downsample: keep last row of each ISO-week bucket
        // bucket key = floor(ms / 7days) to avoid date-fns dependency
        const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
        const weekMap = new Map<number, typeof rows[0]>();
        for (const r of rows) {
            weekMap.set(Math.floor(r.date.getTime() / MS_WEEK), r);
        }
        const weekly = Array.from(weekMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

        // Filter valid (positive, non-extreme) values for percentile calculation
        const VALID_PE = (v: number | null): v is number => v !== null && v > 0 && v < 500;
        const VALID_PS = (v: number | null): v is number => v !== null && v > 0 && v < 200;

        const peAllValues = rows.map(r => r.peRatio).filter(VALID_PE);
        const psAllValues = rows.map(r => r.psRatio).filter(VALID_PS);

        // Build time-series arrays (weekly, all 10Y — client filters by period)
        const peHistory = weekly
            .filter(r => VALID_PE(r.peRatio))
            .map(r => ({ date: r.date.toISOString().split('T')[0], value: parseFloat((r.peRatio as number).toFixed(2)) }));

        const psHistory = weekly
            .filter(r => VALID_PS(r.psRatio))
            .map(r => ({ date: r.date.toISOString().split('T')[0], value: parseFloat((r.psRatio as number).toFixed(2)) }));

        // Current values (most recent row with valid data)
        const latestPE = [...rows].reverse().find(r => VALID_PE(r.peRatio))?.peRatio ?? null;
        const latestPS = [...rows].reverse().find(r => VALID_PS(r.psRatio))?.psRatio ?? null;

        const peStats = buildStats(peAllValues);
        const psStats = buildStats(psAllValues);

        return NextResponse.json({
            peHistory,
            psHistory,
            current: {
                pe: latestPE !== null ? parseFloat((latestPE as number).toFixed(2)) : null,
                ps: latestPS !== null ? parseFloat((latestPS as number).toFixed(2)) : null,
            },
            stats: { pe: peStats, ps: psStats },
        }, {
            headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
        });
    } catch (error) {
        console.error(`Error fetching history for ${symbol}:`, error);
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}
