import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { computeTrendSignal } from '@/lib/analysis/trendSignal';

const UNIVERSE_CACHE_KEY = 'trendSignal:universe:v1';
const UNIVERSE_CACHE_TTL = 3600; // 1h — DVH updates once a day anyway

/**
 * Symbols currently passing the "fundamentals confirm trend" combo signal,
 * computed over the full DVH universe (~900 tickers × ~410d). The heavy scan
 * runs at most once per TTL across all users — results are Redis-cached and
 * every consumer gets the same Set.
 */
export async function getTrendQualifiedSymbols(): Promise<Set<string>> {
    try {
        const cached = await getCachedData(UNIVERSE_CACHE_KEY);
        if (Array.isArray(cached)) return new Set(cached as string[]);
    } catch {}

    try {
        const from = new Date(Date.now() - 410 * 24 * 60 * 60 * 1000);
        const rows = await prisma.dailyValuationHistory.findMany({
            where: { date: { gte: from }, closePrice: { not: null, gt: 0 } },
            select: { symbol: true, date: true, closePrice: true, psRatio: true, peRatio: true, marketCap: true },
            orderBy: { date: 'asc' },
        });
        const bySymbol = new Map<string, typeof rows>();
        for (const r of rows) {
            const arr = bySymbol.get(r.symbol);
            if (arr) arr.push(r);
            else bySymbol.set(r.symbol, [r]);
        }
        const qualified: string[] = [];
        for (const [symbol, srows] of bySymbol) {
            if (computeTrendSignal(srows)?.qualified) qualified.push(symbol);
        }
        try { await setCachedData(UNIVERSE_CACHE_KEY, qualified, UNIVERSE_CACHE_TTL); } catch {}
        return new Set(qualified);
    } catch (e) {
        console.warn('⚠️ trend universe computation failed (non-fatal):', e);
        return new Set();
    }
}
