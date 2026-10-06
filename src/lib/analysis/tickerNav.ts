/**
 * Ticker Navigator — deterministic prev/next neighbors for /analysis/[ticker].
 *
 * Not a recommendation engine: an ordered list + position lookup. Ordering is
 * `lastMarketCap DESC, symbol ASC` (symbol breaks cap ties deterministically),
 * computed inside the three universes:
 *   market_cap — every eligible ticker (has AnalysisCache) with a valid cap
 *   sector     — same canonical Ticker.sector
 *   industry   — same canonical Ticker.industry
 *
 * Each direction is a single LIMIT-1 query against the tuple order — O(log n)
 * index scan, no universe materialization, identical result per dataset.
 */
import { prisma } from '@/lib/db/prisma';

export type NavDimension = 'market_cap' | 'sector' | 'industry';

export interface NavNeighbor {
    symbol: string;
    name: string | null;
}

export interface NavModeResult {
    available: boolean;
    /** Dimension label for UI, e.g. 'Technology' / 'Software—Infrastructure'. */
    label: string | null;
    prev: NavNeighbor | null;
    next: NavNeighbor | null;
}

export interface TickerNav {
    market_cap: NavModeResult;
    sector: NavModeResult;
    industry: NavModeResult;
}

const EMPTY: NavModeResult = { available: false, label: null, prev: null, next: null };

const ELIGIBLE = { analysisCache: { isNot: null }, lastMarketCap: { gt: 0 } } as const;

/** The row immediately before `symbol` in (mcap DESC, symbol ASC) order. */
function prevNeighbor(symbol: string, mcap: number, extraWhere: object) {
    return prisma.ticker.findFirst({
        where: {
            AND: [
                ELIGIBLE,
                extraWhere,
                {
                    OR: [
                        { lastMarketCap: { gt: mcap } },
                        { lastMarketCap: mcap, symbol: { lt: symbol } },
                    ],
                },
            ],
        },
        orderBy: [{ lastMarketCap: 'asc' }, { symbol: 'desc' }],
        select: { symbol: true, name: true },
    });
}

/** The row immediately after `symbol` in (mcap DESC, symbol ASC) order. */
function nextNeighbor(symbol: string, mcap: number, extraWhere: object) {
    return prisma.ticker.findFirst({
        where: {
            AND: [
                ELIGIBLE,
                extraWhere,
                {
                    OR: [
                        { lastMarketCap: { lt: mcap } },
                        { lastMarketCap: mcap, symbol: { gt: symbol } },
                    ],
                },
            ],
        },
        orderBy: [{ lastMarketCap: 'desc' }, { symbol: 'asc' }],
        select: { symbol: true, name: true },
    });
}

async function mode(symbol: string, mcap: number, extraWhere: object, label: string | null): Promise<NavModeResult> {
    const [prev, next] = await Promise.all([
        prevNeighbor(symbol, mcap, extraWhere),
        nextNeighbor(symbol, mcap, extraWhere),
    ]);
    return { available: true, label, prev, next };
}

export async function getTickerNav(symbol: string): Promise<TickerNav | null> {
    const t = await prisma.ticker.findUnique({
        where: { symbol },
        select: { lastMarketCap: true, sector: true, industry: true, analysisCache: { select: { symbol: true } } },
    });
    // Ticker not in the eligible universe or no market cap → no navigator.
    // (AnalysisCache is our "real fundamental data" proxy — ETFs like SPY
    // have a Ticker row but no statements, so they drop out here.)
    if (!t?.analysisCache || !t.lastMarketCap || t.lastMarketCap <= 0) return null;

    const mcap = t.lastMarketCap;
    const [mc, sec, ind] = await Promise.all([
        mode(symbol, mcap, {}, 'Market cap'),
        t.sector ? mode(symbol, mcap, { sector: t.sector }, t.sector) : Promise.resolve(EMPTY),
        t.industry ? mode(symbol, mcap, { industry: t.industry }, t.industry) : Promise.resolve(EMPTY),
    ]);
    if (!mc.prev && !mc.next) return null; // single-row universe edge
    return { market_cap: mc, sector: sec, industry: ind };
}
