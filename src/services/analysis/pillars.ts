/**
 * Pillar scores — the five independent dimensions behind the radar chart:
 *   Valuation · Growth · Profitability · Health · Quality
 *
 * Single source of truth shared by:
 * - scoreCalculator (writes health/profitability/valuation into AnalysisCache)
 * - computeMetrics (read-time `pillars` payload for the page)
 *
 * Design rules:
 * - each pillar = 4 legs × 25 pts; legs must not overlap conceptually
 *   (revenue growth lives ONLY in Growth — it once sat inside Profitability)
 * - laddered thresholds reach a real 0 — no "else 5" floor that makes
 *   20/100 the practical minimum
 * - missing leg data: +10 neutral inside Valuation (legacy convention),
 *   0 pts elsewhere — a data gap is not a good score
 */

export type PillarKey = 'valuation' | 'growth' | 'profitability' | 'health' | 'quality';

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
}

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
}

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
    };
}
