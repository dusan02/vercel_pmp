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

export interface ShareBoundary {
    /** period-end instant at/earlier than which the factor applies */
    after: number;
    /** cumulative multiplier for shares reported before the split */
    ratio: number;
}

/**
 * Split boundaries detected from consecutive quarterly share-count jumps
 * (>1.5×, snapped to common ratios). `trustedShares` anchors a split newer
 * than the latest statement (Ticker.sharesOutstanding vs latest quarter).
 * The single shared implementation — computeDayRatios (DVH multiples) and
 * the forward-EPS series (NTM P/E) must normalize shares identically.
 *
 * @param quarterlyAsc quarterly statements sorted endDate ASCENDING
 */
export function buildShareBoundaries(
    quarterlyAsc: { endDate: Date; sharesOutstanding: number | null }[],
    trustedShares: number | null = null,
): ShareBoundary[] {
    const boundaries: ShareBoundary[] = [];
    for (let i = 1; i < quarterlyAsc.length; i++) {
        const prev = quarterlyAsc[i - 1]!.sharesOutstanding;
        const curr = quarterlyAsc[i]!.sharesOutstanding;
        if (prev != null && prev > 0 && curr != null && curr > 0) {
            const jump = curr / prev;
            if (jump > 1.5) {
                // Persistence guard — a one-period spike that reverts next
                // quarter is a data glitch, not a split (Finnhub posts a
                // split-adjusted count a year early: NVDA Q1'24 showed 24.7B
                // between 2.51B and 2.49B). Real splits hold their level.
                const next = quarterlyAsc[i + 1]?.sharesOutstanding;
                if (next != null && next > 0 && next / prev < 1.5) continue;
                const nearest = findNearestSplit(jump);
                if (Math.abs(jump - nearest) / nearest <= 0.15) {
                    boundaries.push({ after: quarterlyAsc[i - 1]!.endDate.getTime(), ratio: nearest });
                }
            }
        }
    }
    const latestQ = quarterlyAsc[quarterlyAsc.length - 1];
    if (trustedShares != null && trustedShares > 0 && latestQ?.sharesOutstanding != null && latestQ.sharesOutstanding > 0) {
        const jump = trustedShares / latestQ.sharesOutstanding;
        if (jump > 1.5) {
            const nearest = findNearestSplit(jump);
            if (Math.abs(jump - nearest) / nearest <= 0.15) {
                boundaries.push({ after: latestQ.endDate.getTime(), ratio: nearest });
            }
        }
    }
    return boundaries;
}

/** Factor converting a share count as-reported at `endMs` into post-split
 *  (today's) units — product of every split that happened after it. */
export function shareFactorAt(boundaries: ShareBoundary[], endMs: number): number {
    let f = 1;
    for (const b of boundaries) {
        if (endMs <= b.after) f *= b.ratio;
    }
    return f;
}

/**
 * Rows whose share count sits in different units than both neighbours
 * (V-dips/spikes >1.5× up then <0.67× back, or the inverse). Finnhub
 * occasionally reports a split-adjusted count before the split lands or
 * regresses to a pre-split count for one filing. Such a row's shares must
 * not be multiplied by split boundaries — and when its raw value happens to
 * already equal the expected post-split level it is usable as-is.
 */
export function findCorruptShareRows(
    quarterlyAsc: { endDate: Date; sharesOutstanding: number | null }[],
): Set<number> {
    const bad = new Set<number>();
    for (let i = 1; i < quarterlyAsc.length - 1; i++) {
        const a = quarterlyAsc[i - 1]!.sharesOutstanding;
        const b = quarterlyAsc[i]!.sharesOutstanding;
        const c = quarterlyAsc[i + 1]!.sharesOutstanding;
        if (a != null && a > 0 && b != null && b > 0 && c != null && c > 0) {
            const up = b / a, down = c / b;
            if ((up > 1.5 && down < 0.67) || (up < 0.67 && down > 1.5)) {
                bad.add(quarterlyAsc[i]!.endDate.getTime());
            }
        }
    }
    return bad;
}

/**
 * Build a per-row share-count normalizer: converts an as-reported count at a
 * period end into today's (post-split) units. Clean rows take the date-driven
 * boundary factor; corrupt/ambiguous rows pick whichever basis (dated factor,
 * as-reported, fully normalized) lands within ~35% of the clean normalized
 * share level — a post-split count filed early already matches it raw, a
 * pre-split count filed late matches fully normalized. Returns null when no
 * basis is plausible — callers must emit null, never a wrong share count.
 */
export function makeShareNormalizer(
    quarterlyAsc: { endDate: Date; sharesOutstanding: number | null }[],
    boundaries: ShareBoundary[],
): (endMs: number, rawShares: number) => number | null {
    const corrupt = findCorruptShareRows(quarterlyAsc);
    const cleanLevels = quarterlyAsc
        .filter((q) => !corrupt.has(q.endDate.getTime())
            && q.sharesOutstanding != null && q.sharesOutstanding > 0)
        .map((q) => q.sharesOutstanding! * shareFactorAt(boundaries, q.endDate.getTime()));
    const totalFactor = boundaries.reduce((a, b) => a * b.ratio, 1);
    const nearest = (v: number): number | null => {
        let best: number | null = null;
        for (const c of cleanLevels) {
            if (best == null || Math.abs(c - v) < Math.abs(best - v)) best = c;
        }
        return best;
    };
    return (endMs, raw) => {
        if (raw <= 0) return null;
        const dated = raw * shareFactorAt(boundaries, endMs);
        if (!cleanLevels.length) return dated;
        const nd = nearest(dated);
        if (nd != null && Math.abs(dated - nd) / nd <= 0.35) return dated;
        let best: number | null = null;
        for (const cand of [raw, raw * totalFactor]) {
            const n = nearest(cand);
            if (n != null && Math.abs(cand - n) / n <= 0.35
                && (best == null || Math.abs(cand - n) < Math.abs(best - n))) {
                best = cand;
            }
        }
        return best;
    };
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
