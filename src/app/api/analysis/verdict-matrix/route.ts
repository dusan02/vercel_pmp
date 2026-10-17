import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

const TTL = 600; // 10 min — same cadence as the screener result cache

/**
 * Live ticker counts per persisted PMP verdict cell (fundLevel × valLevel),
 * powering the screener's VerdictMatrix — one grouped query instead of 16
 * filter requests. Universe matches the screener base (tickers with a price).
 */
export async function GET() {
    const cacheKey = 'screener:verdict-matrix:v1';
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch {}
    try {
        const rows = await prisma.analysisCache.groupBy({
            by: ['verdictKey'],
            where: { ticker: { lastPrice: { gt: 0 } } },
            _count: { _all: true },
        });
        const counts: Record<string, number> = {};
        for (const r of rows) if (r.verdictKey) counts[r.verdictKey] = r._count._all;
        const body = { counts };
        try { await setCachedData(cacheKey, body, TTL); } catch {}
        return NextResponse.json(body);
    } catch {
        return NextResponse.json({ error: 'Failed to load verdict matrix' }, { status: 500 });
    }
}
