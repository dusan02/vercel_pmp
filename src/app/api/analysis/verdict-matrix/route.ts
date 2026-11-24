import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { readVerdictMatrixSqlite } from '@/lib/db/readonlySqlite';

const TTL = 600; // 10 min — same cadence as the screener result cache
const L1_TTL_MS = 600 * 1000;

let l1Cache: { fetchedAt: number; body: { counts: Record<string, number> } } | null = null;
let inflight: Promise<{ counts: Record<string, number> }> | null = null;

async function computeMatrix(): Promise<{ counts: Record<string, number> }> {
    const sqliteRes = readVerdictMatrixSqlite();
    let counts: Record<string, number>;
    if (sqliteRes.ok) {
        counts = sqliteRes.data;
    } else {
        const rows = await prisma.analysisCache.groupBy({
            by: ['verdictKey'],
            where: { ticker: { lastPrice: { gt: 0 }, lastMarketCap: { gt: 0 } } },
            _count: { _all: true },
        });
        counts = {};
        for (const r of rows) if (r.verdictKey) counts[r.verdictKey] = r._count._all;
    }
    const body = { counts };
    l1Cache = { fetchedAt: Date.now(), body };
    try { await setCachedData('screener:verdict-matrix:v1', body, TTL); } catch {}
    return body;
}

/**
 * Live ticker counts per persisted PMP verdict cell (fundLevel × valLevel),
 * powering the screener's VerdictMatrix — one grouped query instead of 16
 * filter requests. Universe matches the screener base (tickers with a price).
 */
export async function GET() {
    if (l1Cache && Date.now() - l1Cache.fetchedAt < L1_TTL_MS) {
        return NextResponse.json(l1Cache.body);
    }

    const cacheKey = 'screener:verdict-matrix:v1';
    try {
        const cached = await getCachedData(cacheKey) as { counts: Record<string, number> } | null;
        if (cached?.counts) {
            l1Cache = { fetchedAt: Date.now(), body: cached };
            return NextResponse.json(cached);
        }
    } catch {}

    try {
        if (!inflight) {
            inflight = computeMatrix().finally(() => { inflight = null; });
        }
        const body = await inflight;
        return NextResponse.json(body);
    } catch {
        if (l1Cache) return NextResponse.json(l1Cache.body);
        return NextResponse.json({ error: 'Failed to load verdict matrix' }, { status: 500 });
    }
}
