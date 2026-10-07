/**
 * Realized next-twelve-months (NTM) EPS — the forward-looking leg behind
 * the chart's "P/E NTM" metric.
 *
 * Finnhub financials arrive cumulative-YTD (Q1=3M, Q2=6M, Q3=9M, FY=12M),
 * so per-quarter net income is the YTD difference within a fiscal year and
 * Q4 = FY − Q3. Share counts are split-normalized via the same boundary
 * heuristic computeDayRatios uses, so EPS is expressed in today's units.
 *
 * NTM EPS at date t = sum of the first 4 quarter-ends strictly after t.
 * All four must be reported — a partial window would silently understate,
 * so the series honestly ends ~3–4 quarters before the present.
 */
import { buildShareBoundaries, shareFactorAt, findCorruptShareRows } from './splitAdjustment';

/** Minimal statement shape the NTM math needs — a Prisma `select` subset
 *  satisfies it without a cast. */
export interface StmtSlice {
    endDate: Date;
    fiscalPeriod: string;
    fiscalYear: number;
    netIncome: number | null;
    sharesOutstanding: number | null;
}

export interface QuarterEps {
    /** fiscal period end (ms epoch) */
    endMs: number;
    /** per-quarter EPS in split-adjusted units — null when uncomputable */
    eps: number | null;
}

const Q_ORDER: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, FY: 4 };

/**
 * Build the per-quarter EPS series, ascending by period end.
 * Entries with missing net income or shares stay in the grid with eps=null
 * so a gap inside a 4-quarter window correctly yields NTM=null rather than
 * summing a stretched window.
 */
export function quarterlyEpsSeries(statements: StmtSlice[]): QuarterEps[] {
    const asc = [...statements].sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
    const quarterlyAsc = asc.filter((s) => s.fiscalPeriod !== 'FY');
    const boundaries = buildShareBoundaries(quarterlyAsc);
    const corrupt = findCorruptShareRows(quarterlyAsc);
    // Normalized share level of every clean quarter — reference for deciding
    // whether a corrupt row's raw count is already in today's units.
    const cleanNormShares = quarterlyAsc
        .filter((q) => !corrupt.has(q.endDate.getTime())
            && q.sharesOutstanding != null && q.sharesOutstanding > 0)
        .map((q) => q.sharesOutstanding! * shareFactorAt(boundaries, q.endDate.getTime()));

    // Per-quarter net income via YTD diffs inside each fiscal year.
    const byYear = new Map<number, StmtSlice[]>();
    for (const s of asc) {
        const list = byYear.get(s.fiscalYear);
        if (list) list.push(s); else byYear.set(s.fiscalYear, [s]);
    }
    const niByEnd = new Map<number, number | null>();
    for (const rows of byYear.values()) {
        rows.sort((a, b) => (Q_ORDER[a.fiscalPeriod] ?? 9) - (Q_ORDER[b.fiscalPeriod] ?? 9));
        let prevYtd = 0;
        let gap = false;
        for (const r of rows) {
            if (r.netIncome == null) {
                niByEnd.set(r.endDate.getTime(), null);
                if (r.fiscalPeriod !== 'FY') gap = true; // a hole poisons later YTD diffs (they'd span 2 quarters); the FY level itself stays usable for Q4
                continue;
            }
            if (gap && r.fiscalPeriod !== 'FY') {
                niByEnd.set(r.endDate.getTime(), null);
                continue;
            }
            niByEnd.set(r.endDate.getTime(), r.netIncome - prevYtd);
            prevYtd = r.netIncome;
        }
    }

    const totalFactor = boundaries.reduce((a, b) => a * b.ratio, 1);
    const nearestLevel = (v: number): number | null => {
        let best: number | null = null;
        for (const c of cleanNormShares) {
            if (best == null || Math.abs(c - v) < Math.abs(best - v)) best = c;
        }
        return best;
    };
    // A row's as-reported shares convert to today's units via the date-driven
    // boundary factor — UNLESS its units disagree with its own endDate:
    // a post-split count filed before the split (factor double-applies), a
    // pre-split count on a statement ending in the last-pre/first-post gap,
    // or a one-period V-glitch. Then pick whichever basis (dated factor,
    // as-reported, fully normalized) lands within ~35% of the clean level;
    // off-level rows with no plausible basis → eps null, never a wrong one.
    const normShares = (s: StmtSlice): number | null => {
        const raw = s.sharesOutstanding;
        if (raw == null || raw <= 0 || !cleanNormShares.length) return null;
        const dated = raw * shareFactorAt(boundaries, s.endDate.getTime());
        const nearD = nearestLevel(dated);
        if (nearD != null && Math.abs(dated - nearD) / nearD <= 0.35) return dated;
        let best: number | null = null;
        for (const cand of [raw, raw * totalFactor]) {
            const n = nearestLevel(cand);
            if (n != null && Math.abs(cand - n) / n <= 0.35
                && (best == null || Math.abs(cand - n) < Math.abs(best - n))) {
                best = cand;
            }
        }
        return best;
    };

    // Quarter grid: quarterly rows plus implied Q4 (FY − last YTD). A Q4
    // end-date that also has an explicit row is de-duped by endMs.
    const out: QuarterEps[] = [];
    const seen = new Set<number>();
    const pushQ = (s: StmtSlice, ni: number | null) => {
        const endMs = s.endDate.getTime();
        if (seen.has(endMs)) return;
        seen.add(endMs);
        const shares = normShares(s);
        out.push({
            endMs,
            eps: ni != null && shares ? ni / shares : null,
        });
    };

    for (const rows of byYear.values()) {
        const quarters = rows.filter((r) => r.fiscalPeriod !== 'FY');
        const fy = rows.find((r) => r.fiscalPeriod === 'FY');
        for (const q of quarters) {
            pushQ(q, niByEnd.get(q.endDate.getTime()) ?? null);
        }
        if (fy) {
            const lastQ = quarters[quarters.length - 1];
            // Q4 = FY − Q3YTD — requires the Q3 row specifically: subtracting
            // an earlier quarter's YTD would emit a 6M/9M chunk as one quarter.
            const q4Ni = fy.netIncome != null
                && lastQ?.fiscalPeriod === 'Q3' && lastQ.netIncome != null
                ? fy.netIncome - lastQ.netIncome
                : null;
            // A Q4 row (some feeds store one) takes precedence — same endMs
            // would already be in `seen`.
            pushQ(fy, q4Ni);
        }
    }

    return out.sort((a, b) => a.endMs - b.endMs);
}

/**
 * NTM EPS at `asOfMs`: sum of the first 4 quarter EPS strictly after it.
 * Null when the next 4 grid cells aren't fully reported — never a partial
 * (seasonality-skewed) window.
 */
export function ntmEpsAt(quarters: QuarterEps[], asOfMs: number): number | null {
    const idx = quarters.findIndex((q) => q.endMs > asOfMs);
    if (idx < 0 || idx + 4 > quarters.length) return null;
    let sum = 0;
    for (let i = idx; i < idx + 4; i++) {
        const eps = quarters[i]!.eps;
        if (eps == null) return null;
        sum += eps;
    }
    return sum;
}
