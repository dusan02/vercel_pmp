/**
 * Shared stock split adjustment utilities.
 * Used by both /api/analysis/[ticker]/route.ts and /api/analysis/[ticker]/history/route.ts
 * to avoid code duplication.
 */
import { getCachedData, setCachedData } from '@/lib/redis/operations';

const SPLITS_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days (splits change rarely)

export interface SplitEvent {
    execution_date: string;
    split_to: number;
    split_from: number;
}

/**
 * Fetch stock splits from Polygon API with Redis caching (7-day TTL).
 * Splits change rarely so we cache aggressively.
 * Includes a 3s timeout to avoid blocking the request if Polygon is slow.
 */
export async function getCachedSplits(symbol: string, tenYearsAgo: Date): Promise<SplitEvent[]> {
    const cacheKey = `analysis:splits:${symbol}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached && Array.isArray(cached)) return cached;
    } catch {}

    const polygonApiKey = process.env.POLYGON_API_KEY;
    if (!polygonApiKey) return [];

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const splitsResp = await fetch(
            `https://api.polygon.io/v3/reference/splits?ticker=${symbol}&apiKey=${polygonApiKey}`,
            { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (splitsResp.ok) {
            const splitsData = await splitsResp.json();
            const results: SplitEvent[] = (splitsData.results || []).filter((sp: any) => {
                const splitDate = new Date(sp.execution_date + 'T00:00:00Z');
                return splitDate.getTime() >= tenYearsAgo.getTime();
            });
            try { await setCachedData(cacheKey, results, SPLITS_CACHE_TTL); } catch {}
            return results;
        }
    } catch {}
    return [];
}

/**
 * Common split ratios for detection heuristics.
 */
export const COMMON_SPLIT_RATIOS = [2, 3, 4, 5, 7, 8, 10, 15, 20, 25];

/**
 * Find the nearest common split ratio to a given ratio.
 */
export function findNearestSplit(ratio: number): number {
    return COMMON_SPLIT_RATIOS.reduce((best, r) =>
        Math.abs(ratio - r) < Math.abs(ratio - best) ? r : best
    );
}

/**
 * Adjust sharesOutstanding in financial statements for stock splits.
 * Multiplies shares for statements before each split date by the split ratio.
 *
 * @param stmts Financial statements (will be mutated in-place)
 * @param tenYearsAgo Cutoff date — only splits after this are applied
 * @returns The split events that were applied (empty if none)
 */
export async function applySplitAdjustments(
    stmts: { endDate: Date; sharesOutstanding: number | null }[],
    symbol: string,
    tenYearsAgo: Date
): Promise<{ date: Date; ratio: number }[]> {
    const splitEvents: { date: Date; ratio: number }[] = [];

    if (stmts.length === 0) return splitEvents;

    try {
        const splits = await getCachedSplits(symbol, tenYearsAgo);
        for (const sp of splits) {
            const splitDate = new Date(sp.execution_date + 'T00:00:00Z');
            const splitRatio = sp.split_to / sp.split_from;
            if (splitDate.getTime() >= tenYearsAgo.getTime()) {
                splitEvents.push({ date: splitDate, ratio: splitRatio });
            }
        }
    } catch {
        // Fall through to statement-based detection
    }

    if (splitEvents.length > 0) {
        // Use Polygon split dates: multiply shares for statements before each split date
        for (const split of splitEvents) {
            for (const s of stmts) {
                if (s.endDate.getTime() < split.date.getTime() &&
                    s.sharesOutstanding && s.sharesOutstanding > 0) {
                    s.sharesOutstanding = s.sharesOutstanding * split.ratio;
                }
            }
        }
    }

    return splitEvents;
}

/**
 * Post-split shares adjustment for Finnhub statements not updated after a recent split.
 * If Ticker.sharesOutstanding is much larger than latest statement shares,
 * and ratio matches a split ratio, multiply only statements that are still pre-split.
 *
 * @param stmts Financial statements (will be mutated in-place)
 * @param tickerSharesOutstanding Current shares outstanding from Ticker table
 */
export function applyPostSplitAdjustment(
    stmts: { endDate: Date; sharesOutstanding: number | null }[],
    tickerSharesOutstanding: number | null
): void {
    if (!tickerSharesOutstanding || tickerSharesOutstanding <= 0 || stmts.length === 0) return;

    // Find the latest statement (most recent endDate)
    let latestStmt: { endDate: Date; sharesOutstanding: number | null } | null = null;
    for (const s of stmts) {
        if (!latestStmt || s.endDate.getTime() > latestStmt.endDate.getTime()) {
            latestStmt = s;
        }
    }
    if (!latestStmt?.sharesOutstanding || latestStmt.sharesOutstanding <= 0) return;

    const ratio = tickerSharesOutstanding / latestStmt.sharesOutstanding;
    if (ratio <= 1.5) return;

    const nearestSplit = findNearestSplit(ratio);
    if (Math.abs(ratio - nearestSplit) / nearestSplit > 0.15) return;

    // Only multiply statements that are clearly still pre-split
    const threshold = tickerSharesOutstanding / 2;
    for (const s of stmts) {
        if (s.sharesOutstanding && s.sharesOutstanding > 0 &&
            s.sharesOutstanding < threshold) {
            s.sharesOutstanding = s.sharesOutstanding * nearestSplit;
        }
    }
}
