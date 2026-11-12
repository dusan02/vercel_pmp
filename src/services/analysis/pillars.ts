/**
 * Pillar scores — the six independent dimensions behind the radar chart:
 *   Valuation · Growth · Profitability · Health · Quality · Moat
 *
 * Single source of truth shared by:
 * - scoreCalculator (writes health/profitability/valuation into AnalysisCache)
 * - computeMetrics (read-time `pillars` payload for the page)
 *
 * Design rules:
 * - each pillar = 4 legs × 25 pts; legs must not overlap conceptually
 *   (revenue growth lives ONLY in Growth — it once sat inside Profitability)
 * - Moat measures DURABILITY of economics over FY history — never the same
 *   number as Profitability's current-period level (ROIC share-of-years vs
 *   TTM ROIC, margin floor vs margin σ, FCF-positive years vs FCF conversion)
 * - continuous (piecewise-linear) leg scoring that reaches a real 0 — no
 *   step cliffs, no "else 5" floor, ceilings set above "merely good"
 * - Valuation is growth-aware: PEG replaces P/S for profitable companies
 * - missing leg data: +10 neutral inside Valuation (legacy convention),
 *   0 pts elsewhere — a data gap is not a good score. For Moat a short FY
 *   history (<3 computable years) scores 0 = "unproven", which is honest:
 *   durability cannot be evidenced on two filings.
 */

export type PillarKey = 'valuation' | 'growth' | 'profitability' | 'health' | 'quality' | 'moat';

export interface PillarLeg {
    key: string;
    label: string;
    /** Raw input value (null = no data). */
    value: number | null;
    /** Formatted display for the "Why?" breakdown. */
    display: string;
    points: number;
    max: number;
    /** Optional plain-English caveat (e.g. "not meaningful at +65% growth"). */
    note?: string;
}

export interface Pillar {
    key: PillarKey;
    label: string;
    score: number;
    legs: PillarLeg[];
}

export interface PillarInputs {
    // Valuation (vs own history + absolute levels)
    pePercentile: number | null;   // 0–100, share of history below current
    fcfYield: number | null;       // decimal
    psRatio: number | null;
    evEbit: number | null;
    /** TTM P/E (live). Positive ⇒ profitable ⇒ PEG leg; null/≤0 ⇒ P/S leg. */
    currentPe?: number | null;
    /** Consensus forward P/E (Finnhub). Preferred PEG numerator. */
    forwardPe?: number | null;
    // Growth
    revenueCagr: number | null;    // percent
    netIncomeCagr: number | null;  // percent
    epsCagr5y: number | null;      // percent
    forwardImpliedGrowth: number | null; // percent
    // Profitability
    roic: number | null;           // decimal
    roe: number | null;            // decimal
    netMargin: number | null;      // decimal
    operatingMargin: number | null;// decimal
    // Health
    altmanZ: number | null;
    currentRatio: number | null;
    /** EBIT / |interest expense|. null = no interest expense reported → treated
     *  as fully covered (legacy convention: +25). */
    interestCoverage: number | null;
    netCash: boolean | null;       // netDebt <= 0
    debtRatio: number | null;      // netDebt / totalAssets (only when netDebt > 0)
    // Quality
    piotroski: number | null;      // 0–9
    beneish: number | null;        // lower = safer
    fcfConversion: number | null;  // decimal
    marginStability: number | null;// decimal stddev of FY operating margins (display/persisted)
    /** RMS of year-over-year operating-margin DECLINES (decimal). Margin
     *  expansion is not instability — only drops count. Preferred leg input. */
    marginDownside?: number | null;
    /** Latest FY revenue growth vs prior FY, percent — Beneish growth guard. */
    revenueGrowthYoY?: number | null;
    // Moat — multi-year durability stats from deriveMoatInputs(FY rows).
    // Share-legs carry {good, total} so the breakdown can display "8/10 yrs".
    moatRoicDurability: MoatShare | null;   // FYs with ROIC > 12%
    moatGmMedian: number | null;            // median annual gross margin
    moatFcfDurability: MoatShare | null;    // FYs with FCF > 0
    moatMarginFloor: number | null;         // weakest annual net margin
}

/** good/total year counts behind a share-based moat leg (e.g. "8/10 yrs"). */
export interface MoatShare { good: number; total: number }

const LEG_MAX = 25;
/** Neutral points for a missing valuation leg (matches legacy scoreCalculator). */
const V_MISSING = 10;
/** Beneish is unreliable above this YoY revenue growth (SGI dominates). */
export const BENEISH_GROWTH_GUARD_PCT = 40;
/** Neutral points for a Beneish reading the growth guard declares not meaningful. */
const BENEISH_NEUTRAL = 13;
/** Max growth credited inside PEG — caps one-off rebounds. */
const PEG_GROWTH_CAP = 40;

const fmtPct = (v: number | null, d = 1) => v == null ? 'n/a' : `${(v * 100).toFixed(d)}%`;
const fmtX = (v: number | null) => v == null ? 'n/a' : `${v.toFixed(1)}x`;
const fmtNum = (v: number | null, d = 2) => v == null ? 'n/a' : v.toFixed(d);
function fmtOrdPct(v: number | null): string {
    if (v == null) return 'n/a';
    const n = Math.round(v);
    if (n <= 0) return 'lowest in history';
    if (n >= 100) return 'highest in history';
    const s = ['th', 'st', 'nd', 'rd'];
    const mod100 = n % 100;
    return `${n}${s[(mod100 - 20) % 10] ?? s[mod100] ?? s[0] ?? 'th'} pct`;
}

function leg(key: string, label: string, value: number | null, points: number, display: string, note?: string): PillarLeg {
    return { key, label, value, points, max: LEG_MAX, display, ...(note ? { note } : {}) };
}

/**
 * Continuous leg scoring — piecewise-linear interpolation between anchor
 * points (x, pts), clamped at both ends. Replaces the old step bands, whose
 * cliffs made scores sticky (a 20% price drop moved P/S 12.7→10.2 and the
 * leg stayed at 5) and saturated megacaps at 100. Anchors may be given in
 * either x order; "lower is better" legs simply have descending points.
 * Result is rounded to an integer for display.
 */
export function interpolate(v: number, anchors: readonly (readonly [number, number])[]): number {
    const a = [...anchors].sort((p, q) => p[0] - q[0]);
    if (v <= a[0]![0]) return Math.round(a[0]![1]);
    const last = a[a.length - 1]!;
    if (v >= last[0]) return Math.round(last[1]);
    for (let i = 1; i < a.length; i++) {
        const [x1, y1] = a[i]!;
        if (v <= x1) {
            const [x0, y0] = a[i - 1]!;
            return Math.round(y0 + ((v - x0) / (x1 - x0)) * (y1 - y0));
        }
    }
    return Math.round(last[1]);
}

const score = (v: number | null, anchors: readonly (readonly [number, number])[], missing = 0): number =>
    v == null || !Number.isFinite(v) ? missing : interpolate(v, anchors);

// ── Anchor tables (x → points). Old step thresholds sit on ~their old values
// with the 25-point ceiling pushed higher so strong-but-not-exceptional
// companies stop tying at 100. ─────────────────────────────────────────────

// Valuation
const PE_PCT = [[0, 25], [20, 22], [40, 17], [60, 10], [80, 4], [100, 0]] as const;            // lower = cheaper
const FCF_YIELD = [[0, 0], [0.03, 10], [0.05, 17], [0.08, 22], [0.12, 25]] as const;
const PEG = [[0.5, 25], [1.0, 20], [1.5, 14], [2.0, 9], [3.0, 4], [5.0, 0]] as const;          // lower = cheaper
const PS = [[1, 25], [2, 22], [5, 15], [10, 8], [20, 3], [30, 0]] as const;                   // loss-makers only
const EV_EBIT = [[8, 25], [12, 21], [18, 15], [25, 10], [40, 3], [60, 0]] as const;
// Growth (percent)
const CAGR = [[0, 0], [5, 10], [10, 16], [20, 21], [35, 25]] as const;
const FWD_GROWTH = [[0, 0], [5, 10], [15, 17], [30, 22], [50, 25]] as const;
// Profitability (decimal)
const ROIC = [[0, 0], [0.08, 11], [0.15, 18], [0.25, 22], [0.40, 25]] as const;
const ROE = [[0, 0], [0.08, 11], [0.15, 18], [0.25, 22], [0.40, 25]] as const;
const NET_MARGIN = [[0, 0], [0.05, 11], [0.10, 17], [0.20, 22], [0.30, 25]] as const;
const OP_MARGIN = [[0, 0], [0.08, 11], [0.15, 17], [0.25, 22], [0.35, 25]] as const;
// Health
const ALTMAN = [[1.0, 0], [1.5, 8], [2.0, 15], [3.0, 22], [5.0, 25]] as const;
const CURRENT_RATIO = [[0.5, 0], [0.7, 5], [1.0, 11], [1.5, 17], [2.0, 22], [3.0, 25]] as const;
const INTEREST_COV = [[0, 0], [2, 8], [5, 15], [10, 21], [20, 25]] as const;
const DEBT_RATIO = [[0, 24], [0.10, 19], [0.30, 11], [0.50, 4], [0.70, 0]] as const;        // net debt / assets
// Quality
const PIOTROSKI = [[0, 0], [2, 4], [4, 10], [5, 14], [6, 17], [7, 21], [8, 24], [9, 25]] as const;
const BENEISH = [[-3.0, 25], [-2.5, 23], [-2.22, 19], [-1.78, 12], [-1.0, 5], [0, 0]] as const; // lower = safer
const FCF_CONV = [[0, 0], [0.2, 6], [0.5, 13], [0.8, 20], [1.0, 23], [1.2, 25]] as const;
const MARGIN_DOWNSIDE = [[0.01, 25], [0.03, 22], [0.06, 17], [0.10, 12], [0.18, 5], [0.30, 0]] as const;
const MARGIN_SIGMA = [[0.02, 25], [0.05, 21], [0.08, 16], [0.15, 9], [0.25, 3], [0.35, 0]] as const; // fallback
// Moat
const ROIC_DUR = [[0, 0], [0.3, 6], [0.5, 13], [0.7, 19], [0.9, 24], [1.0, 25]] as const;
const GM_MEDIAN = [[0.10, 0], [0.18, 5], [0.30, 12], [0.42, 18], [0.55, 22], [0.70, 25]] as const;
const FCF_DUR = [[0, 0], [0.4, 5], [0.6, 10], [0.8, 17], [1.0, 25]] as const;
const MARGIN_FLOOR = [[-0.10, 0], [-0.05, 3], [0, 10], [0.05, 16], [0.10, 21], [0.20, 25]] as const;

function interestCoveragePoints(ic: number | null): number {
    // null = no interest expense reported → no interest burden → full points
    // (preserves the legacy scoreCalculator convention).
    if (ic == null) return 25;
    return interpolate(ic, INTEREST_COV);
}
function balanceSheetPoints(netCash: boolean | null, debtRatio: number | null): number {
    if (netCash === true) return 25;
    return score(debtRatio, DEBT_RATIO);
}

/**
 * Growth credited inside PEG — the MEDIAN of the three growth reads we have
 * (market-implied 1Y EPS growth, realized 5Y EPS CAGR, 5Y revenue CAGR),
 * capped at PEG_GROWTH_CAP. The median survives one distorted read: a TTM
 * EPS inflated by one-off gains (GOOGL fwd-implied −44%) or a cyclical
 * rebound (MU fwd +292%) no longer decides the leg on its own.
 */
export function pegGrowth(i: Pick<PillarInputs, 'forwardImpliedGrowth' | 'epsCagr5y' | 'revenueCagr'>): number | null {
    const g = [i.forwardImpliedGrowth, i.epsCagr5y, i.revenueCagr]
        .filter((v): v is number => v != null && Number.isFinite(v))
        .sort((a, b) => a - b);
    if (g.length === 0) return null;
    const m = g.length % 2 ? g[g.length >> 1]! : (g[g.length / 2 - 1]! + g[g.length / 2]!) / 2;
    return Math.min(PEG_GROWTH_CAP, m);
}

/** Growth floor inside the PEG divisor — a flat/shrinking business is valued
 *  as P/E ÷ 5 (P/E 6 → PEG 1.2 still reads cheap; P/E 25 → 5 reads rich)
 *  instead of exploding or hard-zeroing deep-value names. */
const PEG_GROWTH_FLOOR = 5;

/**
 * Third valuation leg. Profitable companies: PEG = P/E ÷ growth (forward
 * consensus P/E when available) — the growth-aware multiple the old model
 * lacked. P/S for a profitable company is just P/E × net margin, so it
 * double-counted price while penalizing high margins (NVDA 64% NM → P/S 12.7
 * scored 5/25 at a 20× P/E). P/S remains the yardstick only when there are no
 * earnings to divide by.
 */
function valuationThirdLeg(i: PillarInputs): PillarLeg {
    const profitable = i.currentPe != null && i.currentPe > 0;
    if (!profitable) {
        return leg('psRatio', 'P/S (no earnings)', i.psRatio, score(i.psRatio, PS, V_MISSING), fmtX(i.psRatio));
    }
    const pe = i.forwardPe != null && i.forwardPe > 0 ? i.forwardPe : i.currentPe!;
    const g = pegGrowth(i);
    if (g == null) {
        return leg('peg', 'PEG (P/E ÷ growth)', null, V_MISSING, 'n/a');
    }
    const div = Math.max(g, PEG_GROWTH_FLOOR);
    const peg = pe / div;
    return leg('peg', 'PEG (P/E ÷ growth)', peg, interpolate(peg, PEG),
        `${peg.toFixed(2)} · ${pe.toFixed(1)}× ÷ ${g < PEG_GROWTH_FLOOR ? `${PEG_GROWTH_FLOOR}% floor` : `${g.toFixed(0)}%`}`);
}

/** Beneish leg with the hyper-growth guard (see BENEISH_GROWTH_GUARD_PCT). */
export function beneishGrowthDistorted(i: Pick<PillarInputs, 'beneish' | 'revenueGrowthYoY'>): boolean {
    return i.beneish != null && i.revenueGrowthYoY != null && i.revenueGrowthYoY > BENEISH_GROWTH_GUARD_PCT;
}

function beneishLeg(i: PillarInputs): PillarLeg {
    if (beneishGrowthDistorted(i)) {
        return leg('beneish', 'Beneish M', i.beneish, BENEISH_NEUTRAL, `${fmtNum(i.beneish)} · n/m`,
            `Not meaningful at +${i.revenueGrowthYoY!.toFixed(0)}% revenue growth — the model reads fast growth itself as a manipulation signal; scored neutral.`);
    }
    return leg('beneish', 'Beneish M', i.beneish, score(i.beneish, BENEISH), fmtNum(i.beneish));
}

function marginLeg(i: PillarInputs): PillarLeg {
    if (i.marginDownside != null) {
        return leg('marginStability', 'Margin stability (drops)', i.marginDownside,
            interpolate(i.marginDownside, MARGIN_DOWNSIDE),
            i.marginDownside < 0.005 ? 'no drops' : `drops σ ${(i.marginDownside * 100).toFixed(1)}%`);
    }
    return leg('marginStability', 'Margin stability', i.marginStability, score(i.marginStability, MARGIN_SIGMA),
        i.marginStability == null ? 'n/a' : `σ ${(i.marginStability * 100).toFixed(1)}%`);
}

// ── Pillar assembly ──────────────────────────────────────────────────────────

function assemble(key: PillarKey, label: string, legs: PillarLeg[]): Pillar {
    const score = Math.max(0, Math.min(100, Math.round(legs.reduce((s, l) => s + l.points, 0))));
    return { key, label, score, legs };
}

export interface PillarScores {
    valuation: Pillar;
    growth: Pillar;
    profitability: Pillar;
    health: Pillar;
    quality: Pillar;
    moat: Pillar;
}

const shareValue = (s: MoatShare | null): number | null => (s == null || s.total < 3 ? null : s.good / s.total);
const shareDisplay = (s: MoatShare | null): string => (s == null ? 'n/a' : `${s.good}/${s.total} yrs`);
const pctDisplay = (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(1)}%`);

export function computePillars(i: PillarInputs): PillarScores {
    return {
        valuation: assemble('valuation', 'Valuation', [
            leg('pePercentile', 'P/E vs own history', i.pePercentile, score(i.pePercentile, PE_PCT, V_MISSING),
                fmtOrdPct(i.pePercentile)),
            leg('fcfYield', 'FCF yield', i.fcfYield, score(i.fcfYield, FCF_YIELD, V_MISSING), fmtPct(i.fcfYield)),
            valuationThirdLeg(i),
            leg('evEbit', 'EV/EBIT', i.evEbit, score(i.evEbit, EV_EBIT, V_MISSING), fmtX(i.evEbit)),
        ]),
        growth: assemble('growth', 'Growth', [
            leg('revenueCagr', 'Revenue CAGR', i.revenueCagr, score(i.revenueCagr, CAGR), pctDisplay(i.revenueCagr)),
            leg('netIncomeCagr', 'Net income CAGR', i.netIncomeCagr, score(i.netIncomeCagr, CAGR), pctDisplay(i.netIncomeCagr)),
            leg('epsCagr5y', 'EPS CAGR 5Y', i.epsCagr5y, score(i.epsCagr5y, CAGR), pctDisplay(i.epsCagr5y)),
            leg('forwardImpliedGrowth', 'Fwd implied growth', i.forwardImpliedGrowth, score(i.forwardImpliedGrowth, FWD_GROWTH), pctDisplay(i.forwardImpliedGrowth)),
        ]),
        profitability: assemble('profitability', 'Profitability', [
            leg('roic', 'ROIC', i.roic, score(i.roic, ROIC), fmtPct(i.roic)),
            leg('roe', 'ROE', i.roe, score(i.roe, ROE), fmtPct(i.roe)),
            leg('netMargin', 'Net margin', i.netMargin, score(i.netMargin, NET_MARGIN), fmtPct(i.netMargin)),
            leg('operatingMargin', 'Operating margin', i.operatingMargin, score(i.operatingMargin, OP_MARGIN), fmtPct(i.operatingMargin)),
        ]),
        health: assemble('health', 'Financial Health', [
            leg('altmanZ', 'Altman Z', i.altmanZ, score(i.altmanZ, ALTMAN), fmtNum(i.altmanZ)),
            leg('currentRatio', 'Current ratio', i.currentRatio, score(i.currentRatio, CURRENT_RATIO), fmtNum(i.currentRatio)),
            leg('interestCoverage', 'Interest coverage', i.interestCoverage, interestCoveragePoints(i.interestCoverage), i.interestCoverage == null ? 'no interest expense' : `${i.interestCoverage.toFixed(1)}x`),
            leg('balance', 'Net cash / debt', i.debtRatio, balanceSheetPoints(i.netCash, i.debtRatio),
                i.netCash === true ? 'Net cash' : i.debtRatio == null ? 'n/a' : `D/A ${(i.debtRatio * 100).toFixed(0)}%`),
        ]),
        quality: assemble('quality', 'Quality', [
            leg('piotroski', 'Piotroski F', i.piotroski, score(i.piotroski, PIOTROSKI), i.piotroski == null ? 'n/a' : `${i.piotroski}/9`),
            beneishLeg(i),
            leg('fcfConversion', 'FCF conversion', i.fcfConversion, score(i.fcfConversion, FCF_CONV), fmtPct(i.fcfConversion, 0)),
            marginLeg(i),
        ]),
        moat: assemble('moat', 'Moat', [
            leg('roicDurability', 'ROIC >12% years', shareValue(i.moatRoicDurability), score(shareValue(i.moatRoicDurability), ROIC_DUR), shareDisplay(i.moatRoicDurability)),
            leg('gmMedian', 'Median gross margin', i.moatGmMedian, score(i.moatGmMedian, GM_MEDIAN), fmtPct(i.moatGmMedian)),
            leg('fcfDurability', 'FCF-positive years', shareValue(i.moatFcfDurability), score(shareValue(i.moatFcfDurability), FCF_DUR), shareDisplay(i.moatFcfDurability)),
            leg('marginFloor', 'Worst-year net margin', i.moatMarginFloor, score(i.moatMarginFloor, MARGIN_FLOOR), i.moatMarginFloor == null ? 'n/a' : `worst ${fmtPct(i.moatMarginFloor)}`),
        ]),
    };
}

/**
 * One-line plain-English read of the profile — shown under the radar.
 * Names only the extremes (≥75 strong / <50 weak); a fully moderate
 * profile gets a balanced sentence instead of five band words.
 */
export function pillarSummary(p: PillarScores): string {
    const order: PillarKey[] = ['valuation', 'growth', 'profitability', 'health', 'quality', 'moat'];
    const name: Record<PillarKey, string> = {
        valuation: 'valuation',
        growth: 'growth',
        profitability: 'profitability',
        health: 'financial health',
        quality: 'earnings quality',
        moat: 'moat',
    };
    const all = order.map(k => p[k]).filter((x): x is Pillar => x != null);
    const strong = all.filter(x => x.score >= 75).sort((a, b) => b.score - a.score);
    const weak = all.filter(x => x.score < 50).sort((a, b) => a.score - b.score);
    if (strong.length === 0 && weak.length === 0) {
        return 'Balanced profile — no dimension clearly leads or lags.';
    }
    const join = (xs: string[]) =>
        xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
    const parts: string[] = [];
    if (strong.length > 0) parts.push(`Strong ${join(strong.map(x => name[x.key]))}`);
    if (weak.length > 0) parts.push(`${join(weak.map(x => name[x.key]))} lag${weak.length > 1 ? '' : 's'} behind`);
    return parts.join('; ') + '.';
}

// ── Moat input derivation ────────────────────────────────────────────────────

/** Minimal FY statement slice the moat stats need — Prisma rows satisfy it. */
export interface MoatStatement {
    revenue: number | null;
    netIncome: number | null;
    ebit: number | null;
    grossProfit: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
    totalEquity: number | null;
    totalDebt: number | null;
    cashAndEquivalents: number | null;
}

export interface MoatDerived {
    roicDurability: MoatShare | null;   // FYs with ROIC > 12% (≈ above WACC)
    gmMedian: number | null;            // median annual gross margin
    fcfDurability: MoatShare | null;    // FYs with OCF − |capex| > 0
    marginFloor: number | null;         // weakest annual net margin
}

const ROIC_WACC = 0.12;
/** After-tax factor on EBIT — same convention as the pillar ROIC leg. */
const TAX_FACTOR = 0.79;
const MIN_MOAT_YEARS = 3;

function median(xs: number[]): number {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Reduce FY statement history (callers pass `fiscalPeriod === 'FY'` rows;
 * order irrelevant) into the four durability statistics behind the Moat axis.
 * A year is counted in a metric's denominator only when that metric is
 * computable for it; metrics with <3 computable years return null → 0 pts.
 */
export function deriveMoatInputs(annual: MoatStatement[]): MoatDerived {
    let roicGood = 0, roicTotal = 0, fcfGood = 0, fcfTotal = 0;
    const gms: number[] = [], nms: number[] = [];
    for (const s of annual) {
        const ic = (s.totalEquity ?? 0) + (s.totalDebt ?? 0) - (s.cashAndEquivalents ?? 0);
        if (s.ebit != null && ic > 0) {
            roicTotal++;
            if ((s.ebit * TAX_FACTOR) / ic > ROIC_WACC) roicGood++;
        }
        if (s.revenue != null && s.revenue > 0) {
            if (s.grossProfit != null) gms.push(s.grossProfit / s.revenue);
            if (s.netIncome != null) nms.push(s.netIncome / s.revenue);
        }
        if (s.operatingCashFlow != null && s.capex != null) {
            fcfTotal++;
            if (s.operatingCashFlow - Math.abs(s.capex) > 0) fcfGood++;
        }
    }
    return {
        roicDurability: roicTotal >= MIN_MOAT_YEARS ? { good: roicGood, total: roicTotal } : null,
        gmMedian: gms.length >= MIN_MOAT_YEARS ? median(gms) : null,
        fcfDurability: fcfTotal >= MIN_MOAT_YEARS ? { good: fcfGood, total: fcfTotal } : null,
        marginFloor: nms.length >= MIN_MOAT_YEARS ? Math.min(...nms) : null,
    };
}
