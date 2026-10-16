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
 * Rescale Finnhub ×1000 / ÷1000 unit glitches on statement `sharesOutstanding`
 * (e.g. WAT Q1–Q2'26 reported 82B/90B instead of 82M/90M; DLR, FRPT, SWBI,
 * BBCP, TER, RGEN, COP, CYTK, NTNX, TEM reported some periods in thousands).
 *
 * Only rescales when `raw * 1000` or `raw / 1000` lands within ±25% of the
 * ticker's normal in-scale share range (or a common split multiple of it).
 * Non-1000× outliers (ERIE 2.54B vs 52M, BRK.B 1.44M Class-A vs 2.16B Class-B,
 * SN 50k placeholder, VG 520k) do not match and stay untouched so
 * `makeShareNormalizer` rejects them as corrupt (`null`).
 */
export function rescaleShareUnitGlitches<T extends { endDate: Date; sharesOutstanding: number | null }>(
    stmts: T[],
    trustedShares: number | null = null,
): T[] {
    const pos = stmts
        .map((s) => s.sharesOutstanding)
        .filter((v): v is number => v != null && v > 0);
    if (pos.length === 0) return stmts;

    let anchor: number;
    if (trustedShares != null && trustedShares > 0) {
        anchor = trustedShares;
    } else {
        const millions = pos.filter((v) => v >= 1e6).sort((a, b) => a - b);
        const sorted = millions.length > 0 ? millions : [...pos].sort((a, b) => a - b);
        anchor = sorted[Math.floor(sorted.length / 2)]!;
    }

    const inScale = pos.filter((v) => v >= anchor / 30 && v <= anchor * 30);
    if (trustedShares != null && trustedShares > 0) inScale.push(trustedShares);
    if (inScale.length === 0) inScale.push(anchor);
    const minRef = Math.min(...inScale);
    const maxRef = Math.max(...inScale);

    const matchesBand = (cand: number): boolean =>
        cand >= minRef * 0.75 && cand <= maxRef * 1.25;

    return stmts.map((s) => {
        const raw = s.sharesOutstanding;
        if (raw == null || raw <= 0) return s;
        if (raw >= anchor / 30 && raw <= anchor * 30) return s;
        for (const cand of [raw * 1000, raw / 1000]) {
            if (matchesBand(cand)) return { ...s, sharesOutstanding: cand };
        }
        return s;
    });
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
    const rows = rescaleShareUnitGlitches(quarterlyAsc, trustedShares);
    const boundaries: ShareBoundary[] = [];
    for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1]!.sharesOutstanding;
        const curr = rows[i]!.sharesOutstanding;
        if (prev != null && prev > 0 && curr != null && curr > 0) {
            const jump = curr / prev;
            if (jump > 1.5) {
                // Persistence guard — a one-period spike that reverts next
                // quarter is a data glitch, not a split (Finnhub posts a
                // split-adjusted count a year early: NVDA Q1'24 showed 24.7B
                // between 2.51B and 2.49B). Real splits hold their level.
                const next = rows[i + 1]?.sharesOutstanding;
                if (next != null && next > 0 && next / prev < 1.5) continue;
                const nearest = findNearestSplit(jump);
                if (Math.abs(jump - nearest) / nearest <= 0.15) {
                    boundaries.push({ after: rows[i - 1]!.endDate.getTime(), ratio: nearest });
                }
            }
        }
    }
    const latestQ = rows[rows.length - 1];
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
    trustedShares: number | null = null,
): (endMs: number, rawShares: number) => number | null {
    const rows = rescaleShareUnitGlitches(quarterlyAsc, trustedShares);
    const withShares = rows.filter((q) => q.sharesOutstanding != null && q.sharesOutstanding > 0);

    // Persistent ADR / dual-class bundle ratio (BP 6:1, HSBC 5:1, DEO 4:1):
    // statements report ordinary shares while Ticker.sharesOutstanding and
    // closePrice are in ADR units. Confirmed when the latest statement and at
    // least one earlier statement both sit at the same (1.5×..20×) multiple.
    let bundleRatio = 1;
    if (trustedShares != null && trustedShares > 0 && withShares.length >= 2) {
        const latestVal = withShares[withShares.length - 1]!.sharesOutstanding!;
        const r = latestVal / trustedShares;
        if (r > 1.5 && r <= 20) {
            const peersMatch = withShares
                .slice(0, -1)
                .some((q) => Math.abs(q.sharesOutstanding! - latestVal) / latestVal <= 0.25);
            if (peersMatch) bundleRatio = r;
        }
    }

    const corrupt = findCorruptShareRows(rows);
    const rawClean = withShares
        .filter((q) => !corrupt.has(q.endDate.getTime()))
        .map((q) => (q.sharesOutstanding! / bundleRatio) * shareFactorAt(boundaries, q.endDate.getTime()));

    let postAnchor: number | null = null;
    if (trustedShares != null && trustedShares > 0) {
        postAnchor = trustedShares;
    } else if (rawClean.length > 0) {
        const millions = rawClean.filter((v) => v >= 1e6).sort((a, b) => a - b);
        const sorted = millions.length > 0 ? millions : [...rawClean].sort((a, b) => a - b);
        postAnchor = sorted[Math.floor(sorted.length / 2)]!;
    }

    // Exclude multi-quarter non-split outliers (SN 50k placeholder, RKT 138M
    // Class-A-only filings vs 2.83B total, MDLN 17.5B pre-IPO units vs 842M)
    // that evade the 1-period V-dip detector in findCorruptShareRows.
    const cleanLevels = postAnchor != null
        ? rawClean.filter((v) => v >= postAnchor! / 4 && v <= postAnchor! * 4)
        : rawClean;
    if (cleanLevels.length === 0 && postAnchor != null) {
        cleanLevels.push(postAnchor);
    }

    const minClean = cleanLevels.length > 0 ? Math.min(...cleanLevels) : null;
    const maxClean = cleanLevels.length > 0 ? Math.max(...cleanLevels) : null;
    const totalFactor = boundaries.reduce((a, b) => a * b.ratio, 1);
    const nearest = (v: number): number | null => {
        let best: number | null = null;
        for (const c of cleanLevels) {
            if (best == null || Math.abs(c - v) < Math.abs(best - v)) best = c;
        }
        return best;
    };
    return (endMs, rawInput) => {
        if (rawInput <= 0) return null;
        let raw = rawInput / bundleRatio;
        const factor = shareFactorAt(boundaries, endMs);
        // Rescue ×1000 / ÷1000 unit glitches on FY statements not in quarterlyAsc
        // (e.g. SWBI FY25/FY26 44.9k, DLR FY22 297.9k, FRPT FY21 42.9k, WAT Q1-Q2'26).
        if (postAnchor != null && minClean != null && maxClean != null
            && (raw < postAnchor / 30 || raw > postAnchor * 30)) {
            for (const scale of [1000, 0.001]) {
                const cand = raw * scale;
                const candDated = cand * factor;
                if ((candDated >= minClean * 0.75 && candDated <= maxClean * 1.25)
                    || (cand >= minClean * 0.75 && cand <= maxClean * 1.25)) {
                    raw = cand;
                    break;
                }
            }
        }
        const dated = raw * factor;
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
 * Multiply pre-split-date statement share counts by each split ratio.
 *
 * A statement whose period END precedes the split execution but was filed
 * afterwards already reports post-split shares (LRCX Q1'25: period ended
 * 2024-09-28, 10:1 split executed 2024-10-02, filing shows 1.30B post-split
 * shares — blindly multiplying gives 13B and a ~10× market-cap artifact for
 * the whole quarter the row is the latest statement). For each split we take
 * the earliest post-split statement as the reference level and multiply a
 * statement only when the multiplied count lands nearer that level than the
 * raw count does. With no post-split reference (fresh split, no filing yet)
 * all pre-date statements are multiplied as before.
 */
export function applySplitEventsToStatements(
    stmts: { endDate: Date; sharesOutstanding: number | null }[],
    splitEvents: { date: Date; ratio: number }[],
): void {
    for (const split of splitEvents) {
        let postLevel: number | null = null;
        let postLevelMs = Infinity;
        for (const s of stmts) {
            const ms = s.endDate.getTime();
            if (ms >= split.date.getTime() && s.sharesOutstanding && s.sharesOutstanding > 0 && ms < postLevelMs) {
                postLevel = s.sharesOutstanding;
                postLevelMs = ms;
            }
        }
        for (const s of stmts) {
            if (s.endDate.getTime() >= split.date.getTime() ||
                !s.sharesOutstanding || s.sharesOutstanding <= 0) continue;
            if (postLevel != null) {
                const rawDist = Math.abs(s.sharesOutstanding - postLevel) / postLevel;
                const adjDist = Math.abs(s.sharesOutstanding * split.ratio - postLevel) / postLevel;
                if (rawDist <= adjDist) continue; // already reports post-split count
            }
            s.sharesOutstanding = s.sharesOutstanding * split.ratio;
        }
    }
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

    applySplitEventsToStatements(stmts, splitEvents);
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
    if (stmts.length === 0) return;

    const rescaled = rescaleShareUnitGlitches(stmts, tickerSharesOutstanding);
    for (let i = 0; i < stmts.length; i++) {
        stmts[i]!.sharesOutstanding = rescaled[i]!.sharesOutstanding;
    }

    if (!tickerSharesOutstanding || tickerSharesOutstanding <= 0) return;

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
