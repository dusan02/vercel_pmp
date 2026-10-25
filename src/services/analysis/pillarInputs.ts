/**
 * Shared pillar-input derivation — the single computation consumed by both:
 * - scoreCalculator (write path → AnalysisCache materialized view)
 * - computeMetrics (read path → /analysis page + API)
 *
 * Before this module the two paths derived the same metrics independently and
 * the read path mixed live values with stale AnalysisCache fields (KKR:
 * health 23 stored vs 26 live). Now one function produces one internally
 * consistent snapshot; AnalysisCache is a materialized view of it, never a
 * second source of truth.
 *
 * Intentional fixes vs the original pair (documented in the dry-run report):
 * - interestStmt prefers the latest ANNUAL row with both fields, then any
 *   period, then the Finnhub metric (the old newest-first scan could land on
 *   a stale quarterly row or drift to Finnhub's odd basis — KKR −0.0142).
 * - statement window unified to endDate >= 10y (read-path semantics; the
 *   write path previously used an unbounded take:120 set).
 * - bsStmt falls back to latestStmt (read semantics) — equivalent because an
 *   income-only row contributes null balance fields either way.
 *
 * The function is pure (no DB) so tests can drive it with fixtures.
 */

import { computeTTM, isAnnualPeriod, type TTMResult } from '@/lib/utils/ttm';
import { summarizeLossYears } from '@/lib/utils/analysisMath';
import { isSuspiciousShareCount } from '@/lib/utils/shareCount';
import {
    medianOf, percentileBelow, buildValuationHistory,
    type ValuationHistoryStats,
} from './valuationHistory';
import { isPeDistorted } from '@/lib/analysis/peDistortion';
import {
    computePillars, deriveMoatInputs,
    type MoatDerived, type PillarInputs, type PillarScores,
} from './pillars';

/** Structural subset of FinancialStatement rows the derivation needs. */
export interface PillarStmt {
    fiscalPeriod: string | null;
    fiscalYear: number | null;
    endDate: Date;
    revenue: number | null;
    netIncome: number | null;
    ebit: number | null;
    grossProfit: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
    sbc: number | null;
    totalAssets: number | null;
    totalLiabilities: number | null;
    currentAssets: number | null;
    currentLiabilities: number | null;
    retainedEarnings: number | null;
    totalEquity: number | null;
    sharesOutstanding: number | null;
    interestExpense: number | null;
    totalDebt: number | null;
    cashAndEquivalents: number | null;
    netPPE: number | null;
}

export interface PillarTickerData {
    lastPrice: number | null;
    /** Stored in BILLIONS — multiply by 1e9 before use. */
    lastMarketCap: number | null;
    sharesOutstanding: number | null;
}

export interface PillarFinnhubMetrics {
    interestCoverage: number | null;
    currentRatio: number | null;
    netMargin: number | null;        // percent
    roe: number | null;              // percent
    operatingMargin: number | null;  // percent
    netIncomePerShare: number | null;
    forwardPe: number | null;
    psRatio: number | null;
    priceFreeCashFlow: number | null;
    cashPerShare: number | null;
}

export interface PillarValuationRow {
    date: Date;
    closePrice: number | null;
    marketCap: number | null;
    peRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
    fcfYield: number | null;
}

export interface DerivePillarInputsArgs {
    /** Statements newest-first, already split-adjusted by the caller. */
    stmts: PillarStmt[];
    tickerData: PillarTickerData | null;
    finnhubMetrics: PillarFinnhubMetrics | null;
    /** DailyValuationHistory ascending by date. */
    valuationRows: PillarValuationRow[];
}

export function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th');
}

/**
 * Human-readable P/E percentile vs the stock's own valuation history.
 * percentile = share of history strictly below the current P/E (0–100).
 * Exported for the consistency tests.
 */
export function formatPePercentile(currentPE: number, percentile: number): string {
    const pe = `${currentPE.toFixed(1)}x`;
    if (percentile >= 99) return `Current P/E of ${pe} is the highest in available history.`;
    if (percentile <= 1) return `Current P/E of ${pe} is the lowest in available history.`;
    return `Current P/E of ${pe} sits at the ${ordinal(Math.round(percentile))} percentile of its historical range.`;
}

/**
 * Pick the statement whose ebit + interestExpense define interest coverage.
 * Annual rows first — interest on the FY row is the same period as the FY
 * EBIT, and quarterly rows are cumulative-YTD (a partial-year numerator
 * against a partial-year denominator drifts seasonally). Only when no annual
 * row qualifies do we accept any other period. Finnhub's precomputed
 * interestCoverage is the last fallback.
 *
 * PROVISIONAL semantics (compatibility, not confirmed economics): the stored
 * `ebit` field is OperatingIncomeLoss where reported, but for financial
 * filers with no operating-income concept (KKR, BX, CG) it carries pretax
 * income — i.e. interest expense is already deducted from the numerator and
 * coverage is understated. A formula-basis cleanup is a separate methodology
 * change, deliberately out of this refactor's scope.
 */
/**
 * Recency bound on the annual preference: an FY row more than ~3 years older
 * than the newest statement is not a "valid matching period" — a stale
 * loss-year (HST FY2020 coverage −4.9 vs fresh Q2'24 6.01) would distort the
 * metric worse than a partial-year row does. 3y is loose enough to keep a
 * recent-but-not-latest fiscal year (KKR FY2023 at ~27m still wins over a
 * 3-month cumulative quarter) while rejecting decade-old stragglers.
 */
const INTEREST_ANNUAL_MAX_AGE_MS = 3 * 365.25 * 86_400_000;

export function selectInterestCoverage(
    stmts: PillarStmt[],
    annualStmts: PillarStmt[],
    finnhubInterestCoverage: number | null | undefined,
): { coverage: number | null; stmt: PillarStmt | null } {
    const hasBoth = (s: PillarStmt) => s.ebit != null && s.interestExpense != null && s.interestExpense !== 0;
    const newestEnd = stmts[0]?.endDate?.getTime() ?? null;
    const freshAnnual = newestEnd !== null
        ? annualStmts.filter(s => newestEnd - s.endDate.getTime() <= INTEREST_ANNUAL_MAX_AGE_MS)
        : annualStmts;
    const stmt = freshAnnual.find(hasBoth) ?? stmts.find(hasBoth) ?? null;
    return {
        coverage: stmt ? stmt.ebit! / Math.abs(stmt.interestExpense!) : (finnhubInterestCoverage ?? null),
        stmt,
    };
}

export interface PillarDerivation {
    // Core scoring outputs
    pillarsInput: PillarInputs;
    pillars: PillarScores;
    // Persisted metric fields (AnalysisCache)
    altmanZ: number | null;
    piotroskiScore: number;
    beneishScore: number | null;
    revenueCagr: number | null;
    netIncomeCagr: number | null;
    epsCagr5y: number | null;
    interestCoverage: number | null;
    debtRepaymentYears: number | null;
    fcf: number | null;
    fcfMargin: number | null;
    fcfConversion: number | null;
    marginStability: number | null;
    negativeNiYears: number;
    humanDebtInfo: string | null;
    humanPeInfo: string | null;
    pePercentile: number | null;
    peMedian: number | null;
    peForPct: number | null;
    peDistortedNow: boolean;
    psPercentile: number | null;
    peVsMedian3yPct: number | null;
    priceToCash: number | null;
    roic: number | null;             // persisted basis (decimal → %×100 at write)
    insufficientData: boolean;
    // Derived internals callers still need for display/verdict assembly
    latestStmt: PillarStmt | null;
    bsStmt: PillarStmt | null;
    annualStmts: PillarStmt[];
    ttm: TTMResult;
    moatDerived: MoatDerived;
    currentPrice: number;
    marketCap: number | null;
    mcapNow: number | null;
    currentShareCount: number | null;
    currentPe: number | null;
    currentEps: number | null;
    currentPs: number | null;
    currentEvEbit: number | null;
    currentFcfYield: number | null;
    evNow: number | null;
    netDebt: number | null;
    forwardPe: number | null;
    forwardImpliedGrowth: number | null;
    investedCapital: number | null;
    latestValuation: PillarValuationRow | null;
    valuationHistoryStats: ValuationHistoryStats | null;
}

export function derivePillarInputs(args: DerivePillarInputsArgs): PillarDerivation {
    const { stmts, tickerData, finnhubMetrics, valuationRows } = args;

    const latestStmt = stmts[0] ?? null;
    // Balance-sheet reads come from the newest statement that reports them —
    // Finnhub ships income-only quarterly rows (DELL Q1/Q2-FY27: EBIT+NI but
    // null debt/cash/equity); stmts[0] reads then collapse to fake zeroes.
    const bsStmt = stmts.find(s =>
        s.totalAssets != null || s.totalDebt != null || s.totalEquity != null ||
        s.cashAndEquivalents != null || s.totalLiabilities != null) ?? latestStmt ?? null;

    const annualStmts = stmts.filter(s => isAnnualPeriod(s.fiscalPeriod));
    const moatDerived = deriveMoatInputs(annualStmts);

    const ttm = computeTTM(stmts as never);
    const ttmNetIncome = ttm.netIncome;
    const ttmRevenue = ttm.revenue;
    const ttmEbit = ttm.ebit;
    const ttmOcf = ttm.operatingCashFlow;
    const ttmCapex = ttm.capex;
    const ttmSbc = ttm.sbc;

    const latestValuation = valuationRows.length > 0 ? valuationRows[valuationRows.length - 1]! : null;
    const currentPrice = tickerData?.lastPrice || latestValuation?.closePrice || 0;

    // Corrupted-shares guard — identical convention in both paths: suspicious
    // counts are replaced by the trusted Ticker count, a missing count stays
    // missing (never substituted).
    const trustedShares = tickerData?.sharesOutstanding ?? null;
    const rawStmtShares = latestStmt?.sharesOutstanding ?? null;
    const stmtShares = isSuspiciousShareCount(rawStmtShares, latestStmt?.netIncome ?? null, trustedShares)
        ? (trustedShares ?? null)
        : rawStmtShares;
    const currentShareCount = (trustedShares && trustedShares > 0) ? trustedShares : stmtShares;

    // Ticker.lastMarketCap is stored in BILLIONS — DailyValuationHistory and
    // shares×price are absolute dollars.
    const marketCap = (tickerData?.lastMarketCap && tickerData.lastMarketCap > 0
        ? tickerData.lastMarketCap * 1e9
        : null)
        ?? latestValuation?.marketCap
        ?? (tickerData?.sharesOutstanding && currentPrice ? tickerData.sharesOutstanding * currentPrice : null);
    const mcapNow = (tickerData?.lastMarketCap && tickerData.lastMarketCap > 0)
        ? tickerData.lastMarketCap * 1e9
        : (currentPrice > 0 && currentShareCount && currentShareCount > 0 ? currentPrice * currentShareCount : null);

    // --- Altman Z-Score ---
    let altmanZ: number | null = null;
    if (bsStmt && bsStmt.totalAssets && bsStmt.totalAssets > 0) {
        const sharesOutstanding = isSuspiciousShareCount(bsStmt.sharesOutstanding, bsStmt.netIncome, tickerData?.sharesOutstanding)
            ? tickerData?.sharesOutstanding
            : (bsStmt.sharesOutstanding || tickerData?.sharesOutstanding);
        const marketValueOfEquity = sharesOutstanding && sharesOutstanding > 0 && currentPrice > 0
            ? sharesOutstanding * currentPrice
            : marketCap;
        const A = ((bsStmt.currentAssets || 0) - (bsStmt.currentLiabilities || 0)) / bsStmt.totalAssets;
        const B = (bsStmt.retainedEarnings || 0) / bsStmt.totalAssets;
        // Altman Z requires annualized (TTM) EBIT and Sales over Total Assets —
        // a partial-year row would understate both. Sub-TTM fallback is
        // annual-only for the same reason.
        const annualEbit = ttmEbit ?? annualStmts.find(s => s.ebit != null)?.ebit ?? 0;
        const annualRev = ttmRevenue ?? annualStmts.find(s => s.revenue != null)?.revenue ?? 0;
        const C = annualEbit / bsStmt.totalAssets;
        const D = bsStmt.totalLiabilities && bsStmt.totalLiabilities > 0 && marketValueOfEquity && marketValueOfEquity > 0
            ? marketValueOfEquity / bsStmt.totalLiabilities
            : 0;
        const E = annualRev / bsStmt.totalAssets;
        altmanZ = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
    }

    // --- FCF & Debt Repayment ---
    const ttmFcf = (ttmOcf !== null && ttmCapex !== null)
        ? ttmOcf - Math.abs(ttmCapex)
        : null;
    const fcf = ttmFcf;
    let debtRepaymentYears: number | null = null;
    let humanDebtInfo: string | null = null;

    const netDebt = (bsStmt && bsStmt.totalDebt !== null && bsStmt.cashAndEquivalents !== null)
        ? bsStmt.totalDebt - bsStmt.cashAndEquivalents
        : null;

    if (fcf !== null) {
        // No balance-sheet row at all → claim nothing about debt rather than
        // treating missing values as zeros (the old `|| 0` on a null row
        // printed "effectively debt-free" for any income-only latest row).
        if (netDebt === null) {
            debtRepaymentYears = null;
            humanDebtInfo = null;
        } else if (netDebt <= 0) {
            debtRepaymentYears = 0;
            humanDebtInfo = "Company is effectively debt-free after netting cash.";
        } else if (fcf > 0) {
            debtRepaymentYears = netDebt / fcf;
            humanDebtInfo = `Takes ~${debtRepaymentYears.toFixed(1)} years to repay net debt from free cash flow.`;
        } else {
            humanDebtInfo = "Company has negative FCF, making debt repayment from operations difficult.";
        }
    }

    let fcfMargin: number | null = null;
    const fcfDenomRev = ttmRevenue ?? annualStmts.find(s => s.revenue != null && s.revenue > 0)?.revenue ?? null;
    if (fcf !== null && fcfDenomRev !== null && fcfDenomRev > 0) {
        // Clamp to ±200% — beyond that the tiny-revenue denominator makes
        // the ratio meaningless (observed artifacts like -31,000%).
        fcfMargin = Math.max(-2, Math.min(2, fcf / fcfDenomRev));
    }

    let fcfConversion: number | null = null;
    const fcfDenomNi = ttmNetIncome ?? annualStmts.find(s => s.netIncome != null)?.netIncome ?? null;
    if (fcf !== null && fcfDenomNi && fcfDenomNi > 0) {
        fcfConversion = fcf / fcfDenomNi;
    }

    // --- Quality Stats ---
    const negativeNiYears = summarizeLossYears(stmts).lossYears;
    // Margin stability over recent annual (FY) operating margins (up to 5
    // years, matching the CAGR window); clamp each period's margin to [-2, 2]
    // so a pre-revenue year can't produce a meaningless σ.
    const clampMargin = (m: number) => Math.max(-2, Math.min(2, m));
    const fyMargins = annualStmts
        .slice(0, 5)
        .filter(s => s.revenue && s.revenue > 0 && s.ebit !== null)
        .map(s => clampMargin(s.ebit! / s.revenue!));
    const margins: number[] = fyMargins.length >= 3
        ? fyMargins
        : stmts
            .filter(s => s.revenue && s.revenue > 0 && s.ebit !== null)
            .map(s => clampMargin(s.ebit! / s.revenue!));

    let marginStability: number | null = null;
    if (margins.length > 2) {
        const mean = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / margins.length;
        marginStability = Math.sqrt(variance);
    }

    // --- Interest Coverage (annual-first selection; see selectInterestCoverage) ---
    const { coverage: interestCoverage } = selectInterestCoverage(stmts, annualStmts, finnhubMetrics?.interestCoverage);

    // ─── PILLAR INPUTS: Health ────────────────────────────────────────────
    const currentRatio = ((bsStmt?.currentAssets && bsStmt.currentLiabilities && bsStmt.currentLiabilities > 0)
        ? bsStmt.currentAssets / bsStmt.currentLiabilities
        : null) ?? finnhubMetrics?.currentRatio ?? null;
    const netCash = netDebt !== null ? netDebt <= 0 : null;
    const netDebtRatio = (netCash === false && netDebt !== null && bsStmt?.totalAssets && bsStmt.totalAssets > 0)
        ? netDebt / bsStmt.totalAssets
        : null;

    // ─── PILLAR INPUTS: Profitability (own TTM basis, Finnhub fallback) ───
    const fhNetMargin = finnhubMetrics?.netMargin != null ? finnhubMetrics.netMargin / 100 : null;
    const fhRoe = finnhubMetrics?.roe != null ? finnhubMetrics.roe / 100 : null;
    const fhOpMargin = finnhubMetrics?.operatingMargin != null ? finnhubMetrics.operatingMargin / 100 : null;

    const pillarNetMargin = (ttmNetIncome !== null && ttmRevenue !== null && ttmRevenue > 0)
        ? ttmNetIncome / ttmRevenue
        : fhNetMargin;
    const pillarOpMargin = (ttmEbit !== null && ttmRevenue !== null && ttmRevenue > 0)
        ? ttmEbit / ttmRevenue
        : fhOpMargin;
    const investedCapital = bsStmt
        ? (bsStmt.totalEquity || 0) + (bsStmt.totalDebt || 0) - (bsStmt.cashAndEquivalents || 0)
        : null;
    const pillarRoic = (ttmEbit !== null && investedCapital !== null && investedCapital > 0)
        ? (ttmEbit * 0.79) / investedCapital  // NOPAT ≈ EBIT × (1 − 21% tax)
        : null;
    const pillarRoe = (bsStmt?.totalEquity && bsStmt.totalEquity > 0)
        ? (ttmNetIncome !== null ? ttmNetIncome / bsStmt.totalEquity : fhRoe)
        : null;

    // ─── PILLAR INPUTS: Valuation ────────────────────────────────────────
    const effectiveNetIncome = ttmNetIncome ?? annualStmts.find(s => s.netIncome != null)?.netIncome ?? null;
    // EPS on the same NI/share basis as P/E; Finnhub EPS is the fallback when
    // own shares are unusable.
    const currentEps = (effectiveNetIncome !== null && effectiveNetIncome > 0 && currentShareCount !== null && currentShareCount > 0)
        ? effectiveNetIncome / currentShareCount
        : (finnhubMetrics?.netIncomePerShare ?? null);
    // P/E source must match the UI (price / own TTM EPS). Finnhub's peRatio can
    // sit on a stale EPS basis.
    let currentPe = (currentPrice > 0 && currentShareCount && currentShareCount > 0 && effectiveNetIncome && effectiveNetIncome > 0)
        ? (currentPrice * currentShareCount) / effectiveNetIncome
        : (latestValuation?.peRatio || null);
    // Same loss-maker guard: no positive P/E next to a negative TTM EPS.
    if (currentPe !== null && currentEps !== null && currentEps <= 0) currentPe = null;

    const currentPs = (mcapNow !== null && mcapNow > 0 && ttmRevenue !== null && ttmRevenue > 0)
        ? mcapNow / ttmRevenue : null;
    // netDebt is only non-null when both fields exist on bsStmt, so it is
    // also the EV feasibility guard.
    const evNow = (mcapNow !== null && netDebt !== null)
        ? mcapNow + netDebt
        : null;
    const currentEvEbit = (evNow !== null && evNow > 0 && ttmEbit !== null && ttmEbit > 0)
        ? evNow / ttmEbit : null;
    const currentFcfYield = (ttmFcf !== null && mcapNow !== null && mcapNow > 0)
        ? ttmFcf / mcapNow : null;

    // Canonical basis for the percentile claim: the latest stored DVH row
    // carrying a P/E (close basis) — the same snapshot the analysis/valuation
    // pages rank and display.
    let latestPeRow: PillarValuationRow | null = null;
    for (let i = valuationRows.length - 1; i >= 0; i--) {
        if (valuationRows[i]!.peRatio != null) { latestPeRow = valuationRows[i]!; break; }
    }
    const peValues = valuationRows.map(r => r.peRatio).filter((v): v is number => v != null).sort((a, b) => a - b);
    const peForPct = latestPeRow?.peRatio ?? currentPe;
    const peMedian = peValues.length > 0 ? medianOf(peValues) : null;
    const peDistortedNow = isPeDistorted(peForPct, peMedian);
    let pePercentile: number | null = null;
    let humanPeInfo: string | null = null;
    if (peValues.length > 0 && peForPct !== null && peForPct > 0 && !peDistortedNow) {
        pePercentile = percentileBelow(peValues, peForPct);
        humanPeInfo = formatPePercentile(peForPct, pePercentile);
    }

    // P/S percentile on the same close basis — the verdict's valuation
    // fallback when P/E is distorted/missing.
    const psValues = valuationRows.map(r => r.psRatio).filter((v): v is number => v != null && v > 0).sort((a, b) => a - b);
    let latestPsRatio: number | null = null;
    for (let i = valuationRows.length - 1; i >= 0; i--) {
        const v = valuationRows[i]!.psRatio;
        if (v != null && v > 0) { latestPsRatio = v; break; }
    }
    const psPercentile = (psValues.length > 0 && latestPsRatio != null)
        ? percentileBelow(psValues, latestPsRatio)
        : null;

    // 3Y-window median vs current — the screener "PE below its 3Y median"
    // signal. Window anchors at the latest DVH row (not wall-clock today) so
    // a lagging history doesn't silently shrink it. Distorted P/E days (>150x)
    // are excluded from both current and the window.
    let peVsMedian3yPct: number | null = null;
    if (latestPeRow?.date && peForPct !== null && peForPct > 0 && !peDistortedNow) {
        const cutoff3y = new Date(latestPeRow.date.getTime() - 3 * 365.25 * 86_400_000);
        const windowRows = valuationRows
            .filter(r => r.peRatio != null && r.peRatio > 0 && r.peRatio <= 150 && r.date >= cutoff3y)
            .map(r => r.peRatio!)
            .sort((a, b) => a - b);
        // ~120 trading days ≈ half a year — below that the median is noise.
        if (windowRows.length >= 120) {
            const median3y = medianOf(windowRows);
            if (median3y !== null && median3y > 0) peVsMedian3yPct = ((peForPct - median3y) / median3y) * 100;
        }
    }

    // Display stats block (read path renders it; identical series semantics).
    const valuationHistoryStats = valuationRows.length > 0
        ? buildValuationHistory(valuationRows, {
            pe: latestValuation?.peRatio ?? currentPe,
            ps: latestValuation?.psRatio ?? currentPs ?? null,
            evEbit: latestValuation?.evEbitda ?? currentEvEbit ?? null,
            fcfYield: latestValuation?.fcfYield ?? currentFcfYield ?? null,
        })
        : null;

    // fcfYield leg: own TTM basis, then the latest daily snapshot.
    // (The Finnhub priceFreeCashFlow inverse fallback is display-only in the
    // read path — deliberately NOT a pillar input; deferred change.)
    const pillarFcfYield = currentFcfYield ?? (latestValuation?.fcfYield ?? null);

    // Own TTM P/S first, Finnhub as fallback.
    const pillarPs = currentPs ?? (finnhubMetrics?.psRatio ?? null);
    const pillarEvEbit = currentEvEbit;

    // ─── CAGR, Piotroski, Beneish ──────────────────────────────────
    let revenueCagr: number | null = null;
    let netIncomeCagr: number | null = null;
    const latestAnnual = annualStmts[0] || null;
    const stmt5yAgoAnnual = (latestAnnual?.fiscalYear != null
        ? annualStmts.find(s => s.fiscalYear === latestAnnual.fiscalYear! - 4)
        : null) || annualStmts[4] || annualStmts[annualStmts.length - 1] || null;
    const fyDiff = (latestAnnual?.fiscalYear != null && stmt5yAgoAnnual?.fiscalYear != null)
        ? latestAnnual.fiscalYear - stmt5yAgoAnnual.fiscalYear
        : 0;
    const yearsBack = fyDiff > 0 ? fyDiff : (annualStmts.length >= 5 ? 4 : (annualStmts.length - 1));

    if (latestAnnual && stmt5yAgoAnnual && yearsBack > 0) {
        // Require meaningful base-year scale (>= $10M revenue, >= $1M net
        // income) so spin-off stub periods and pre-revenue rows don't produce
        // thousand-percent CAGR artifacts.
        if (latestAnnual.revenue && latestAnnual.revenue > 0 && stmt5yAgoAnnual.revenue && stmt5yAgoAnnual.revenue >= 10_000_000) {
            const rawRevCagr = (Math.pow(latestAnnual.revenue / stmt5yAgoAnnual.revenue, 1 / yearsBack) - 1) * 100;
            if (rawRevCagr <= 300) revenueCagr = rawRevCagr;
        }
        if (latestAnnual.netIncome && stmt5yAgoAnnual.netIncome && stmt5yAgoAnnual.netIncome >= 1_000_000 && latestAnnual.netIncome > 0) {
            const rawNiCagr = (Math.pow(latestAnnual.netIncome / stmt5yAgoAnnual.netIncome, 1 / yearsBack) - 1) * 100;
            if (rawNiCagr <= 300) netIncomeCagr = rawNiCagr;
        }
    }

    let piotroskiScore = 0;
    const prevAnnual = annualStmts[1] || null;
    if (latestAnnual && prevAnnual) {
        const lA = latestAnnual;
        const pA = prevAnnual;
        const totalAssets = lA.totalAssets || 1;
        const prevTotalAssets = pA.totalAssets || 1;
        const avgTotalAssets = (totalAssets + prevTotalAssets) / 2;
        const roa = (lA.netIncome || 0) / avgTotalAssets;
        const prevRoa = (pA.netIncome || 0) / prevTotalAssets;
        const cfo = (lA.operatingCashFlow || 0) / avgTotalAssets;
        if (roa > 0) piotroskiScore += 1;
        if (lA.operatingCashFlow && lA.operatingCashFlow > 0) piotroskiScore += 1;
        if (roa > prevRoa) piotroskiScore += 1;
        if (cfo > roa) piotroskiScore += 1;

        const leverage = lA.totalDebt && avgTotalAssets > 0 ? lA.totalDebt / avgTotalAssets : 0;
        const prevLeverage = pA.totalDebt && prevTotalAssets > 0 ? pA.totalDebt / prevTotalAssets : 0;
        const currRatio = lA.currentAssets && lA.currentLiabilities ? lA.currentAssets / lA.currentLiabilities : 0;
        const prevCurrRatio = pA.currentAssets && pA.currentLiabilities ? pA.currentAssets / pA.currentLiabilities : 0;
        if (leverage < prevLeverage) piotroskiScore += 1;
        if (currRatio > prevCurrRatio) piotroskiScore += 1;
        if ((lA.sharesOutstanding || 0) <= (pA.sharesOutstanding || 0)) piotroskiScore += 1;

        const gm = lA.revenue ? (lA.grossProfit || 0) / lA.revenue : 0;
        const prevGm = pA.revenue ? (pA.grossProfit || 0) / pA.revenue : 0;
        const at = lA.revenue ? lA.revenue / avgTotalAssets : 0;
        const prevAt = pA.revenue ? pA.revenue / prevTotalAssets : 0;
        if (gm > prevGm) piotroskiScore += 1;
        if (at > prevAt) piotroskiScore += 1;
    }

    let beneishScore: number | null = null;
    if (latestAnnual && prevAnnual && latestAnnual.revenue && prevAnnual.revenue && prevAnnual.revenue > 0) {
        const lA = latestAnnual;
        const pA = prevAnnual;
        const lTA = lA.totalAssets || 1;
        const pTA = pA.totalAssets || 1;
        const lRev = lA.revenue!;
        const pRev = pA.revenue!;

        // Indices clamped to [0, 10] — near-zero denominators otherwise produce
        // finite-but-huge values (observed M-scores in the millions). Missing
        // denominators → NaN → neutral 1.
        const idx = (num: number, den: number) => {
            if (den === 0) return 1;
            const v = num / den;
            return isFinite(v) ? Math.min(Math.max(v, 0), 10) : 1;
        };

        // Days Sales in Receivables Index (currentAssets proxy — no receivables field)
        const dsri = idx((lA.currentAssets || 0) / lRev, (pA.currentAssets || 0) / pRev);
        // Gross Margin Index (higher = worse, i.e. margins deteriorating)
        const gmIndex = idx((pA.grossProfit || 0) / pRev, (lA.grossProfit || 0) / lRev);
        // Asset Quality Index (non-current assets excluding PPE as proportion of total assets)
        const lNonCurrentNonPPE = Math.max(0, (lTA - (lA.currentAssets || 0)) - (lA.netPPE || 0));
        const pNonCurrentNonPPE = Math.max(0, (pTA - (pA.currentAssets || 0)) - (pA.netPPE || 0));
        const aqi = idx(lNonCurrentNonPPE / lTA, pNonCurrentNonPPE / pTA);
        // Sales Growth Index
        const sgi = idx(lRev, pRev);
        // Depreciation Index — no depreciation field in schema, neutral
        const depi = 1;
        // SG&A Expense Index — current/prev ratio of opex-to-sales (opex ≈ grossProfit − ebit)
        const sgai = idx(((lA.grossProfit || 0) - (lA.ebit || 0)) / lRev, ((pA.grossProfit || 0) - (pA.ebit || 0)) / pRev);
        // Leverage Index (debt-to-assets ratio current vs. previous)
        const lvgi = idx((lA.totalDebt || 0) / lTA, (pA.totalDebt || 0) / pTA);
        // Total Accruals to Total Assets — clamped; coefficient 4.679 dominates the model
        const tataRaw = ((lA.netIncome || 0) - (lA.operatingCashFlow || 0)) / lTA;
        const tata = isFinite(tataRaw) ? Math.min(Math.max(tataRaw, -1), 1) : 0;

        // Standard Beneish (1999) 8-variable model: -1.78 = manipulation threshold.
        beneishScore = -4.84
            + 0.92 * dsri
            + 0.528 * gmIndex
            + 0.404 * aqi
            + 0.892 * sgi
            + 0.115 * depi
            - 0.172 * sgai
            + 4.679 * tata
            - 0.327 * lvgi;
        beneishScore = Math.min(Math.max(beneishScore, -8), 8);
    }

    // ─── EPS CAGR 5Y + forward implied growth ─────────────────────
    const saneAnnualShares = (s: { sharesOutstanding: number | null; netIncome: number | null } | null | undefined) =>
        s && !isSuspiciousShareCount(s.sharesOutstanding, s.netIncome, trustedShares)
            ? s.sharesOutstanding : null;
    let epsCagr5y: number | null = null;
    if (latestAnnual) {
        const sharesNow = saneAnnualShares(latestAnnual);
        // Prefer the 5Y-ago FY row (fiscalYear - 4); if its shares are missing/corrupt,
        // fall back to the annual row (>=2Y back) closest to 4Y back with valid shares.
        const candidates = annualStmts.filter(s =>
            s !== latestAnnual
            && (s.netIncome ?? 0) > 0
            && (saneAnnualShares(s) ?? 0) > 0
            && (latestAnnual.fiscalYear != null && s.fiscalYear != null ? latestAnnual.fiscalYear - s.fiscalYear >= 2 : true)
        );
        const epsBaseAnnual = (saneAnnualShares(stmt5yAgoAnnual) && (stmt5yAgoAnnual?.netIncome ?? 0) > 0)
            ? stmt5yAgoAnnual
            : candidates.sort((a, b) =>
                Math.abs((latestAnnual.fiscalYear! - a.fiscalYear!) - 4) - Math.abs((latestAnnual.fiscalYear! - b.fiscalYear!) - 4)
            )[0] ?? null;
        const epsYearsBack = (latestAnnual.fiscalYear != null && epsBaseAnnual?.fiscalYear != null && latestAnnual.fiscalYear > epsBaseAnnual.fiscalYear)
            ? latestAnnual.fiscalYear - epsBaseAnnual.fiscalYear
            : yearsBack;
        const sharesThen = saneAnnualShares(epsBaseAnnual);
        if (epsBaseAnnual && epsYearsBack > 0
            && latestAnnual.netIncome && latestAnnual.netIncome > 0 && sharesNow && sharesNow > 0
            && epsBaseAnnual.netIncome && epsBaseAnnual.netIncome > 0 && sharesThen && sharesThen > 0) {
            const epsNow = latestAnnual.netIncome / sharesNow;
            const epsThen = epsBaseAnnual.netIncome / sharesThen;
            if (epsNow > 0 && epsThen > 0) {
                epsCagr5y = (Math.pow(epsNow / epsThen, 1 / epsYearsBack) - 1) * 100;
            }
        }
    }

    // Forward implied 1Y growth — same sanity rules in both paths: floor
    // forwardPe at 1 (garbage guard) and strip the non-operating EPS excess
    // above EBIT so a GAAP windfall can't invert the growth rate.
    const forwardPe = (finnhubMetrics?.forwardPe != null && finnhubMetrics.forwardPe >= 1)
        ? finnhubMetrics.forwardPe : null;
    const recurringEpsForFwd = (ttmEbit !== null && ttmEbit > 0 && effectiveNetIncome !== null && effectiveNetIncome > ttmEbit * 1.05 && currentShareCount !== null && currentShareCount > 0)
        ? ttmEbit / currentShareCount
        : currentEps;
    const forwardImpliedGrowth = (forwardPe !== null && forwardPe > 0 && currentPrice > 0 && recurringEpsForFwd !== null && recurringEpsForFwd > 0)
        ? ((currentPrice / forwardPe) / recurringEpsForFwd - 1) * 100
        : null;

    // 0 statements with fundamentals ≠ weak fundamentals — ADR/foreign names
    // Finnhub doesn't cover (TSM, NVO, BABA) render as "insufficient data".
    const insufficientData = !stmts.some(s => s.revenue != null || s.netIncome != null);

    // Finviz-style extra: marketCap / cashAndEquivalents (fallback price/cashPerShare).
    const rawPriceToCash = (mcapNow !== null && mcapNow > 0 && bsStmt?.cashAndEquivalents && bsStmt.cashAndEquivalents > 0)
        ? mcapNow / bsStmt.cashAndEquivalents
        : (currentPrice > 0 && finnhubMetrics?.cashPerShare && finnhubMetrics.cashPerShare > 0
            ? currentPrice / finnhubMetrics.cashPerShare
            : null);
    const priceToCash = rawPriceToCash !== null && isFinite(rawPriceToCash) && rawPriceToCash > 0 && rawPriceToCash <= 500
        ? rawPriceToCash
        : null;

    const pillarsInput: PillarInputs = {
        pePercentile,
        fcfYield: pillarFcfYield,
        psRatio: pillarPs,
        evEbit: pillarEvEbit,
        revenueCagr,
        netIncomeCagr,
        epsCagr5y,
        forwardImpliedGrowth,
        roic: pillarRoic,
        roe: pillarRoe,
        netMargin: pillarNetMargin,
        operatingMargin: pillarOpMargin,
        altmanZ,
        currentRatio,
        interestCoverage,
        netCash,
        debtRatio: netDebtRatio,
        piotroski: piotroskiScore,
        beneish: beneishScore,
        fcfConversion,
        marginStability,
        moatRoicDurability: moatDerived.roicDurability,
        moatGmMedian: moatDerived.gmMedian,
        moatFcfDurability: moatDerived.fcfDurability,
        moatMarginFloor: moatDerived.marginFloor,
    };
    if (process.env.DEBUG_PILLARS) console.log('[pillars-input]', JSON.stringify(pillarsInput));
    const pillars = computePillars(pillarsInput);

    return {
        pillarsInput, pillars,
        altmanZ, piotroskiScore, beneishScore, revenueCagr, netIncomeCagr,
        epsCagr5y, interestCoverage, debtRepaymentYears, fcf, fcfMargin,
        fcfConversion, marginStability, negativeNiYears,
        humanDebtInfo, humanPeInfo,
        pePercentile, peMedian, peForPct, peDistortedNow,
        psPercentile, peVsMedian3yPct, priceToCash,
        roic: pillarRoic, insufficientData,
        latestStmt, bsStmt, annualStmts, ttm, moatDerived,
        currentPrice, marketCap, mcapNow, currentShareCount,
        currentPe, currentEps, currentPs, currentEvEbit, currentFcfYield,
        evNow, netDebt, forwardPe, forwardImpliedGrowth, investedCapital,
        latestValuation, valuationHistoryStats,
    };
}
