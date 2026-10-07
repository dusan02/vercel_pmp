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
 * - laddered thresholds reach a real 0 — no "else 5" floor that makes
 *   20/100 the practical minimum
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
    marginStability: number | null;// decimal stddev
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

const fmtPct = (v: number | null, d = 1) => v == null ? 'n/a' : `${(v * 100).toFixed(d)}%`;
const fmtX = (v: number | null) => v == null ? 'n/a' : `${v.toFixed(1)}x`;
const fmtNum = (v: number | null, d = 2) => v == null ? 'n/a' : v.toFixed(d);

function leg(key: string, label: string, value: number | null, points: number, display: string): PillarLeg {
    return { key, label, value, points, max: LEG_MAX, display };
}

// ── Leg scorers (higher input = better unless noted) ─────────────────────────

function pePercentilePoints(p: number | null): number {
    if (p == null) return V_MISSING;
    if (p < 20) return 25;
    if (p < 40) return 20;
    if (p < 60) return 12;
    if (p < 80) return 5;
    return 0;
}
function fcfYieldPoints(v: number | null): number {
    if (v == null) return V_MISSING;
    if (v > 0.08) return 25;
    if (v > 0.05) return 20;
    if (v > 0.03) return 12;
    if (v > 0) return 5;
    return 0;
}
function psPoints(v: number | null): number {
    if (v == null) return V_MISSING;
    if (v < 2) return 25;
    if (v < 5) return 20;
    if (v < 10) return 12;
    if (v < 20) return 5;
    return 0;
}
function evEbitPoints(v: number | null): number {
    if (v == null) return V_MISSING;
    if (v < 10) return 25;
    if (v < 15) return 20;
    if (v < 25) return 12;
    if (v < 40) return 5;
    return 0;
}

function cagrPoints(v: number | null): number {
    if (v == null) return 0;
    if (v > 20) return 25;
    if (v > 10) return 20;
    if (v > 5) return 12;
    if (v > 0) return 6;
    return 0;
}
function fwdGrowthPoints(v: number | null): number {
    if (v == null) return 0;
    if (v > 30) return 25;
    if (v > 15) return 20;
    if (v > 5) return 12;
    if (v > 0) return 5;
    return 0;
}

function roicPoints(v: number | null): number {
    if (v == null) return 0;
    if (v > 0.25) return 25;
    if (v > 0.15) return 20;
    if (v > 0.08) return 12;
    if (v > 0) return 5;
    return 0;
}
function roePoints(v: number | null): number {
    if (v == null) return 0;
    if (v > 0.25) return 25;
    if (v > 0.15) return 20;
    if (v > 0.08) return 12;
    if (v > 0) return 5;
    return 0;
}
function netMarginPoints(v: number | null): number {
    if (v == null) return 0;
    if (v > 0.20) return 25;
    if (v > 0.10) return 20;
    if (v > 0.05) return 13;
    if (v > 0) return 6;
    return 0;
}
function opMarginPoints(v: number | null): number {
    if (v == null) return 0;
    if (v > 0.25) return 25;
    if (v > 0.15) return 20;
    if (v > 0.08) return 12;
    if (v > 0) return 5;
    return 0;
}

function altmanPoints(z: number | null): number {
    if (z == null) return 0;
    if (z > 3.0) return 25;
    if (z >= 2.0) return 18;
    if (z >= 1.5) return 10;
    return 3;
}
function currentRatioPoints(cr: number | null): number {
    if (cr == null) return 0;
    if (cr >= 2.0) return 25;
    if (cr >= 1.5) return 18;
    if (cr >= 1.0) return 12;
    if (cr >= 0.7) return 6;
    return 0;
}
function interestCoveragePoints(ic: number | null): number {
    // null = no interest expense reported → no interest burden → full points
    // (preserves the legacy scoreCalculator convention).
    if (ic == null) return 25;
    if (ic > 10) return 25;
    if (ic > 5) return 18;
    if (ic > 2) return 10;
    if (ic > 0) return 3;
    return 0;
}
function balanceSheetPoints(netCash: boolean | null, debtRatio: number | null): number {
    if (netCash === true) return 25;
    if (debtRatio == null) return 0;
    if (debtRatio < 0.10) return 20;
    if (debtRatio < 0.30) return 12;
    if (debtRatio < 0.50) return 5;
    return 0;
}

function piotroskiPoints(v: number | null): number {
    if (v == null) return 0;
    if (v >= 8) return 25;
    if (v >= 7) return 22;
    if (v >= 5) return 15;
    if (v >= 4) return 10;
    if (v >= 2) return 5;
    return 0;
}
function beneishPoints(v: number | null): number {
    if (v == null) return 0;
    if (v <= -2.5) return 25;
    if (v <= -2.22) return 20;
    if (v <= -1.78) return 12;
    if (v < 0) return 6;
    return 0;
}
function fcfConversionPoints(v: number | null): number {
    if (v == null) return 0;
    if (v > 1.0) return 25;
    if (v > 0.8) return 22;
    if (v > 0.5) return 15;
    if (v > 0.2) return 8;
    if (v > 0) return 3;
    return 0;
}
function marginStabilityPoints(v: number | null): number {
    if (v == null) return 0;
    if (v < 0.05) return 25;
    if (v < 0.08) return 20;
    if (v < 0.15) return 12;
    if (v < 0.25) return 6;
    return 0;
}

// ── Moat legs ────────────────────────────────────────────────────────────────
// Every leg is a *history* statistic — a company needs several years of
// financial statements before any of these can score. Thresholds calibrated so
// MSFT/KO ≈ 90–100 (wide), WMT ≈ 50–65 (narrow), airlines/cyclicals < 30.

/** Share of years with ROIC > 12% — sustained returns above a typical WACC. */
function roicDurabilityPoints(s: MoatShare | null): number {
    if (s == null || s.total < 3) return 0;
    const f = s.good / s.total;
    if (f >= 0.9) return 25;
    if (f >= 0.7) return 20;
    if (f >= 0.5) return 13;
    if (f >= 0.3) return 6;
    return 0;
}
/** Median annual gross margin — pricing power (deliberately level, not σ:
    Quality already owns margin stability). */
function moatGmPoints(v: number | null): number {
    if (v == null) return 0;
    if (v > 0.55) return 25;
    if (v > 0.42) return 20;
    if (v > 0.30) return 13;
    if (v > 0.18) return 6;
    return 0;
}
/** Share of years with FCF > 0 — the business never needed external funding. */
function fcfDurabilityPoints(s: MoatShare | null): number {
    if (s == null || s.total < 3) return 0;
    const f = s.good / s.total;
    if (f >= 1.0) return 25;
    if (f >= 0.8) return 18;
    if (f >= 0.6) return 10;
    if (f >= 0.4) return 5;
    return 0;
}
/** Weakest annual net margin — stayed profitable even in the bad year. */
function marginFloorPoints(v: number | null): number {
    if (v == null) return 0;
    if (v > 0.10) return 25;
    if (v > 0.05) return 18;
    if (v > 0) return 12;
    if (v > -0.05) return 5;
    return 0;
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

export function computePillars(i: PillarInputs): PillarScores {
    return {
        valuation: assemble('valuation', 'Valuation', [
            leg('pePercentile', 'P/E vs own history', i.pePercentile, pePercentilePoints(i.pePercentile),
                i.pePercentile == null ? 'n/a' : `${Math.round(i.pePercentile)}th pct`),
            leg('fcfYield', 'FCF yield', i.fcfYield, fcfYieldPoints(i.fcfYield), fmtPct(i.fcfYield)),
            leg('psRatio', 'P/S', i.psRatio, psPoints(i.psRatio), fmtX(i.psRatio)),
            leg('evEbit', 'EV/EBIT', i.evEbit, evEbitPoints(i.evEbit), fmtX(i.evEbit)),
        ]),
        growth: assemble('growth', 'Growth', [
            leg('revenueCagr', 'Revenue CAGR', i.revenueCagr, cagrPoints(i.revenueCagr), i.revenueCagr == null ? 'n/a' : `${i.revenueCagr.toFixed(1)}%`),
            leg('netIncomeCagr', 'Net income CAGR', i.netIncomeCagr, cagrPoints(i.netIncomeCagr), i.netIncomeCagr == null ? 'n/a' : `${i.netIncomeCagr.toFixed(1)}%`),
            leg('epsCagr5y', 'EPS CAGR 5Y', i.epsCagr5y, cagrPoints(i.epsCagr5y), i.epsCagr5y == null ? 'n/a' : `${i.epsCagr5y.toFixed(1)}%`),
            leg('forwardImpliedGrowth', 'Fwd implied growth', i.forwardImpliedGrowth, fwdGrowthPoints(i.forwardImpliedGrowth), i.forwardImpliedGrowth == null ? 'n/a' : `${i.forwardImpliedGrowth.toFixed(1)}%`),
        ]),
        profitability: assemble('profitability', 'Profitability', [
            leg('roic', 'ROIC', i.roic, roicPoints(i.roic), fmtPct(i.roic)),
            leg('roe', 'ROE', i.roe, roePoints(i.roe), fmtPct(i.roe)),
            leg('netMargin', 'Net margin', i.netMargin, netMarginPoints(i.netMargin), fmtPct(i.netMargin)),
            leg('operatingMargin', 'Operating margin', i.operatingMargin, opMarginPoints(i.operatingMargin), fmtPct(i.operatingMargin)),
        ]),
        health: assemble('health', 'Financial Health', [
            leg('altmanZ', 'Altman Z', i.altmanZ, altmanPoints(i.altmanZ), fmtNum(i.altmanZ)),
            leg('currentRatio', 'Current ratio', i.currentRatio, currentRatioPoints(i.currentRatio), fmtNum(i.currentRatio)),
            leg('interestCoverage', 'Interest coverage', i.interestCoverage, interestCoveragePoints(i.interestCoverage), i.interestCoverage == null ? 'no interest expense' : `${i.interestCoverage.toFixed(1)}x`),
            leg('balance', 'Net cash / debt', i.debtRatio, balanceSheetPoints(i.netCash, i.debtRatio),
                i.netCash === true ? 'Net cash' : i.debtRatio == null ? 'n/a' : `D/A ${(i.debtRatio * 100).toFixed(0)}%`),
        ]),
        quality: assemble('quality', 'Quality', [
            leg('piotroski', 'Piotroski F', i.piotroski, piotroskiPoints(i.piotroski), i.piotroski == null ? 'n/a' : `${i.piotroski}/9`),
            leg('beneish', 'Beneish M', i.beneish, beneishPoints(i.beneish), fmtNum(i.beneish)),
            leg('fcfConversion', 'FCF conversion', i.fcfConversion, fcfConversionPoints(i.fcfConversion), fmtPct(i.fcfConversion, 0)),
            leg('marginStability', 'Margin stability', i.marginStability, marginStabilityPoints(i.marginStability), i.marginStability == null ? 'n/a' : `σ ${(i.marginStability * 100).toFixed(1)}%`),
        ]),
        moat: assemble('moat', 'Moat', [
            leg('roicDurability', 'ROIC >12% years', shareValue(i.moatRoicDurability), roicDurabilityPoints(i.moatRoicDurability), shareDisplay(i.moatRoicDurability)),
            leg('gmMedian', 'Median gross margin', i.moatGmMedian, moatGmPoints(i.moatGmMedian), fmtPct(i.moatGmMedian)),
            leg('fcfDurability', 'FCF-positive years', shareValue(i.moatFcfDurability), fcfDurabilityPoints(i.moatFcfDurability), shareDisplay(i.moatFcfDurability)),
            leg('marginFloor', 'Worst-year net margin', i.moatMarginFloor, marginFloorPoints(i.moatMarginFloor), i.moatMarginFloor == null ? 'n/a' : `worst ${fmtPct(i.moatMarginFloor)}`),
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
