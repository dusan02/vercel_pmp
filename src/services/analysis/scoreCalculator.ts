import { prisma } from '@/lib/db/prisma';
import { NotificationService } from '../notificationService';
import { computeTTM } from '@/lib/utils/ttm';
import { summarizeLossYears } from '@/lib/utils/analysisMath';
import { computePillars, deriveMoatInputs } from './pillars';
import { isSuspiciousShareCount } from '@/lib/utils/shareCount';
import { applySplitAdjustments, applyPostSplitAdjustment } from '@/lib/utils/splitAdjustment';
import { medianOf, percentileBelow } from './valuationHistory';
import { classifyVerdict } from '@/lib/analysis/verdict';
import { isPeDistorted } from '@/lib/analysis/peDistortion';

export interface CalculateScoresOptions {
    /** No-op — AI verdict generation was removed (cost vs. value). */
    skipVerdict?: boolean;
    /** Skip quality-breakout notifications (backfills must not spam alerts). */
    skipNotify?: boolean;
}

function ordinal(n: number): string {
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
 * Calculate health, profitability, and valuation scores.
 * Computes Altman Z-Score, Piotroski F-Score, Beneish M-Score, FCF metrics,
 * and generates an AI investment verdict. Persists results to AnalysisCache.
 */
export async function calculateScores(symbol: string, opts: CalculateScoresOptions = {}): Promise<void> {
    const stmts = await prisma.financialStatement.findMany({
        where: { symbol },
        orderBy: { endDate: 'desc' },
        take: 120
    });

    const latestStmt = stmts[0];
    // Balance-sheet reads come from the newest statement that reports them —
    // Finnhub ships income-only quarterly rows (DELL Q1/Q2-FY27: EBIT+NI but
    // null debt/cash/equity); stmts[0] reads then collapse to fake zeroes
    // (0−0 net debt → "effectively debt-free" takeaway on a $20B-debt firm).
    const bsStmt = stmts.find(s =>
        s.totalAssets != null || s.totalDebt != null || s.totalEquity != null ||
        s.cashAndEquivalents != null || s.totalLiabilities != null) ?? null;
    if (!latestStmt) {
        // No financial statements (foreign ADRs Finnhub doesn't cover — TSM,
        // ASML, BABA...) — a silent return froze the last written score forever
        // (TSM kept healthScore=100 with zero statements). Write an explicit
        // insufficient-data row instead: null scores + fresh updatedAt.
        await prisma.analysisCache.upsert({
            where: { symbol },
            update: {
                healthScore: null, profitabilityScore: null, valuationScore: null,
                growthScore: null, qualityScore: null, moatScore: null, overallScore: null,
                verdictText: null, piotroskiScore: null, beneishScore: null,
                interestCoverage: null, revenueCagr: null, netIncomeCagr: null,
                altmanZ: null, debtRepaymentYears: null, fcfConversion: null,
                fcfMargin: null, humanDebtInfo: null, humanPeInfo: null,
                marginStability: null, negativeNiYears: null,
                pePercentile: null, peVsMedian3yPct: null,
                fundLevel: null, valLevel: null, verdictKey: 'insufficient',
            },
            create: { symbol },
        });
        return;
    }
    const annualStmts = stmts.filter(s => s.fiscalPeriod === 'FY');
    const moatDerived = deriveMoatInputs(annualStmts);
    
    // TTM via shared utility
    const ttm = computeTTM(stmts);
    const ttmNetIncome = ttm.netIncome;
    const ttmRevenue = ttm.revenue;
    const ttmEbit = ttm.ebit;
    const ttmOcf = ttm.operatingCashFlow;
    const ttmCapex = ttm.capex;

    let healthScore = 50;
    let valuationScore = 50;
    let profitabilityScore = 50;

    const tickerData = await prisma.ticker.findUnique({
        where: { symbol },
        select: { lastPrice: true, lastMarketCap: true, sharesOutstanding: true }
    });

    // Fetch Finnhub pre-computed metrics for scoring
    const finnhubMetrics = await prisma.finnhubMetrics.findUnique({ where: { symbol } });

    // Split-adjust statement share counts exactly like the read path —
    // unadjusted pre-split counts corrupt epsCagr5y (NVDA/GOOGL diverged).
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    try {
        await applySplitAdjustments(stmts, symbol, tenYearsAgo);
        applyPostSplitAdjustment(stmts, tickerData?.sharesOutstanding ?? null);
    } catch { /* non-critical — same as read path */ }

    // latestValuation feeds the pillar-leg fallbacks (P/E, FCF yield) — the
    // read path has the same rows via valuationRows, so fetch unconditionally.
    const latestValuation = await prisma.dailyValuationHistory.findFirst({
        where: { symbol },
        orderBy: { date: 'desc' }
    });

    const currentPrice = tickerData?.lastPrice || latestValuation?.closePrice || 0;
    // Ticker.lastMarketCap is stored in BILLIONS — DailyValuationHistory and
    // shares×price are absolute dollars. Mixing units inflated every
    // valuation leg (LLY stored 100 while the real profile is ~40).
    const marketCap = (tickerData?.lastMarketCap && tickerData.lastMarketCap > 0
        ? tickerData.lastMarketCap * 1e9
        : null)
        ?? latestValuation?.marketCap
        ?? (tickerData?.sharesOutstanding && currentPrice ? tickerData.sharesOutstanding * currentPrice : 0);

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
        // reading bsStmt.ebit/revenue directly plugged 3M/6M/9M partial-year
        // flows whenever the newest balance-sheet row was Q1/Q2/Q3.
        const annualEbit = ttmEbit ?? bsStmt.ebit ?? 0;
        const annualRev = ttmRevenue ?? bsStmt.revenue ?? 0;
        const C = annualEbit / bsStmt.totalAssets;
        const D = bsStmt.totalLiabilities && bsStmt.totalLiabilities > 0 && marketValueOfEquity > 0
            ? marketValueOfEquity / bsStmt.totalLiabilities
            : 0;
        const E = annualRev / bsStmt.totalAssets;
        altmanZ = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
    }

    // --- FCF & Debt Repayment ---
    let fcf: number | null = null;
    let debtRepaymentYears: number | null = null;
    let humanDebtInfo: string | null = null;

    if (ttmOcf !== null && ttmCapex !== null) {
        fcf = ttmOcf - Math.abs(ttmCapex);
        // No balance-sheet row at all → claim nothing about debt rather than
        // treating missing values as zeros (the old `|| 0` on a null row
        // printed "effectively debt-free" for any income-only latest row).
        const netDebtNow = (bsStmt && bsStmt.totalDebt !== null && bsStmt.cashAndEquivalents !== null)
            ? bsStmt.totalDebt - bsStmt.cashAndEquivalents
            : null;

        if (netDebtNow === null) {
            debtRepaymentYears = null;
            humanDebtInfo = null;
        } else if (netDebtNow <= 0) {
            debtRepaymentYears = 0;
            humanDebtInfo = "Company is effectively debt-free after netting cash.";
        } else if (fcf > 0) {
            debtRepaymentYears = netDebtNow / fcf;
            humanDebtInfo = `Takes ~${debtRepaymentYears.toFixed(1)} years to repay net debt from free cash flow.`;
        } else {
            humanDebtInfo = "Company has negative FCF, making debt repayment from operations difficult.";
        }
    }

    let fcfMargin: number | null = null;
    if (fcf !== null && latestStmt.revenue && latestStmt.revenue > 0) {
        // Clamp to ±200% — beyond that the tiny-revenue denominator makes
        // the ratio meaningless (observed artifacts like -31,000%).
        fcfMargin = Math.max(-2, Math.min(2, fcf / (ttmRevenue ?? latestStmt.revenue)));
    }

    let fcfConversion: number | null = null;
    const fcfDenomNi = ttmNetIncome ?? latestStmt.netIncome;
    if (fcf !== null && fcfDenomNi && fcfDenomNi > 0) {
        fcfConversion = fcf / fcfDenomNi;
    }

    // --- Quality Stats ---
    const negativeNiYears = summarizeLossYears(stmts).lossYears;
    // Compute margin stability over recent annual (FY) operating margins (up to
    // 5 years, matching the CAGR window) so quarterly seasonality and 10-year
    // secular margin expansion don't penalize stable compounders or diverge
    // between sibling classes with different quarterly history depth (GOOGL vs GOOG).
    // Clamp each period's margin to [-2, 2] (same ±200% guard as fcfMargin) so
    // a pre-revenue biotech year ($0.1M revenue, -$500M EBIT) doesn't produce
    // σ = 534.95.
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

    // --- Interest Coverage ---
    const interestStmt = stmts.find(s => s.ebit != null && s.interestExpense != null && s.interestExpense !== 0);
    const interestCoverage = interestStmt
        ? interestStmt.ebit! / Math.abs(interestStmt.interestExpense!)
        : (finnhubMetrics?.interestCoverage ?? null);

    // ─── PILLAR INPUTS: Health ────────────────────────────────────────────
    // Legs live in services/analysis/pillars.ts (shared with the read path).
    const currentRatio = ((bsStmt?.currentAssets && bsStmt.currentLiabilities && bsStmt.currentLiabilities > 0)
        ? bsStmt.currentAssets / bsStmt.currentLiabilities
        : null) ?? finnhubMetrics?.currentRatio ?? null;
    const hasBalanceData = bsStmt !== null && bsStmt.totalDebt !== null && bsStmt.cashAndEquivalents !== null;
    const currentNetDebt = hasBalanceData ? bsStmt.totalDebt! - bsStmt.cashAndEquivalents! : null;
    const netCash = currentNetDebt !== null ? currentNetDebt <= 0 : null;
    const netDebtRatio = (currentNetDebt !== null && currentNetDebt > 0 && bsStmt!.totalAssets && bsStmt!.totalAssets > 0)
        ? currentNetDebt / bsStmt!.totalAssets
        : null;

    // ─── PILLAR INPUTS: Profitability (own TTM basis, Finnhub fallback) ───
    // Revenue growth deliberately removed — it now lives in the Growth pillar.
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
    let humanPeInfo: string | null = null;

    const allValuations = await prisma.dailyValuationHistory.findMany({
        where: { symbol, peRatio: { not: null } },
        select: { peRatio: true },
        orderBy: { peRatio: 'asc' }
    });

    const effectiveNetIncome = ttmNetIncome ?? latestStmt.netIncome;
    // Corrupt-statement guard — identical to the read path's sharesOutstanding:
    // suspicious counts are replaced by the trusted Ticker count, but a
    // missing count stays missing (never substituted).
    const rawStmtShares = latestStmt.sharesOutstanding ?? null;
    const stmtShares = isSuspiciousShareCount(rawStmtShares, latestStmt.netIncome, tickerData?.sharesOutstanding)
        ? (tickerData?.sharesOutstanding ?? null)
        : rawStmtShares;
    const currentShareCount = (tickerData?.sharesOutstanding && tickerData.sharesOutstanding > 0)
        ? tickerData.sharesOutstanding
        : stmtShares;
    // mcapNow mirrors the read path exactly (lastMarketCap → price×guarded
    // shares) — pillar legs rank like-for-like with /analysis/[ticker].
    const mcapNow = (tickerData?.lastMarketCap && tickerData.lastMarketCap > 0)
        ? tickerData.lastMarketCap * 1e9
        : (currentPrice > 0 && currentShareCount && currentShareCount > 0 ? currentPrice * currentShareCount : null);
    // EPS on the same NI/share basis as P/E; Finnhub EPS is the read path's
    // fallback when own shares are unusable.
    const currentEps = (effectiveNetIncome !== null && effectiveNetIncome > 0 && currentShareCount !== null && currentShareCount > 0)
        ? effectiveNetIncome / currentShareCount
        : (finnhubMetrics?.netIncomePerShare ?? null);
    // P/E source must match the UI (price / own TTM EPS). Finnhub's peRatio can
    // sit on a stale EPS basis — using it here once produced percentile=100 and
    // a "top 0%" label while our own valuation history showed ~21x.
    let currentPE = (currentPrice > 0 && currentShareCount && currentShareCount > 0 && effectiveNetIncome && effectiveNetIncome > 0)
        ? (currentPrice * currentShareCount) / effectiveNetIncome
        : (latestValuation?.peRatio || null);
    // Same loss-maker guard as the read path: no positive P/E next to a
    // negative TTM EPS.
    if (currentPE !== null && currentEps !== null && currentEps <= 0) currentPE = null;

    // Canonical basis for the percentile claim: the latest stored DVH row
    // (close basis) — the same snapshot the analysis/valuation pages rank and
    // display. Ranking a live-price P/E against close-basis history produced
    // "8th" in the takeaway while the hero showed "12th" on the same page.
    const latestPeRow = await prisma.dailyValuationHistory.findFirst({
        where: { symbol, peRatio: { not: null } },
        orderBy: { date: 'desc' },
        select: { peRatio: true, date: true },
    });
    const peForPct = latestPeRow?.peRatio ?? currentPE;
    const peMedian = allValuations.length > 0 ? medianOf(allValuations.map(v => v.peRatio!)) : null;
    const peDistortedNow = isPeDistorted(peForPct, peMedian);
    let pePercentile: number | null = null;
    if (allValuations.length > 0 && peForPct !== null && peForPct > 0 && !peDistortedNow) {
        pePercentile = percentileBelow(allValuations.map(v => v.peRatio!), peForPct);
        humanPeInfo = formatPePercentile(peForPct, pePercentile);
    }

    // P/S percentile on the same close basis — the verdict's valuation
    // fallback when P/E is distorted/missing (earnings-distortion guard).
    const allPsValuations = await prisma.dailyValuationHistory.findMany({
        where: { symbol, psRatio: { not: null, gt: 0 } },
        select: { psRatio: true },
        orderBy: { psRatio: 'asc' },
    });
    const latestPsRow = await prisma.dailyValuationHistory.findFirst({
        where: { symbol, psRatio: { not: null, gt: 0 } },
        orderBy: { date: 'desc' },
        select: { psRatio: true },
    });
    const psPercentile = (allPsValuations.length > 0 && latestPsRow?.psRatio != null && latestPsRow.psRatio > 0)
        ? percentileBelow(allPsValuations.map(v => v.psRatio!), latestPsRow.psRatio)
        : null;

    // 3Y-window median vs current — the screener "PE below its 3Y median"
    // signal. Window anchors at the latest DVH row (not wall-clock today) so
    // a lagging history doesn't silently shrink it. Exclude distorted P/E
    // days (>150x, collapsed EPS) from both current and the 3Y window so
    //GPC (+2,676%) and RKT (-93.8% vs a ~1000x 3Y median) don't top the sort.
    let peVsMedian3yPct: number | null = null;
    if (latestPeRow?.date && peForPct !== null && peForPct > 0 && !peDistortedNow) {
        const cutoff3y = new Date(latestPeRow.date.getTime() - 3 * 365.25 * 86_400_000);
        const windowRows = await prisma.dailyValuationHistory.findMany({
            where: { symbol, peRatio: { not: null, gt: 0, lte: 150 }, date: { gte: cutoff3y } },
            select: { peRatio: true },
            orderBy: { peRatio: 'asc' },
        });
        // ~120 trading days ≈ half a year — below that the median is noise.
        if (windowRows.length >= 120) {
            const median3y = medianOf(windowRows.map(r => r.peRatio!));
            if (median3y !== null && median3y > 0) peVsMedian3yPct = ((peForPct - median3y) / median3y) * 100;
        }
    }

    // fcfYield leg: own TTM basis, then the latest daily snapshot (read path).
    const pillarFcfYield = (fcf !== null && mcapNow !== null && mcapNow > 0)
        ? fcf / mcapNow
        : (latestValuation?.fcfYield ?? null);

    // Own TTM P/S first (matches the unified-source rule), Finnhub as fallback.
    const pillarPs = (mcapNow !== null && mcapNow > 0 && ttmRevenue !== null && ttmRevenue > 0)
        ? mcapNow / ttmRevenue
        : (finnhubMetrics?.psRatio ?? null);

    const evNow = (mcapNow !== null && mcapNow > 0 && bsStmt?.totalDebt !== null && bsStmt?.totalDebt !== undefined && bsStmt.cashAndEquivalents !== null && bsStmt.cashAndEquivalents !== undefined)
        ? mcapNow + bsStmt.totalDebt - bsStmt.cashAndEquivalents
        : null;
    const pillarEvEbit = (evNow !== null && evNow > 0 && ttmEbit !== null && ttmEbit > 0)
        ? evNow / ttmEbit
        : null;

    // ─── CAGR, Piotroski, Beneish ──────────────────────────────────
    let revenueCagr: number | null = null;
    let netIncomeCagr: number | null = null;
    const latestAnnual = annualStmts[0] || null;
    const stmt5yAgoAnnual = (latestAnnual?.fiscalYear != null
        ? annualStmts.find(s => s.fiscalYear === latestAnnual.fiscalYear - 4)
        : null) || annualStmts[4] || annualStmts[annualStmts.length - 1] || null;
    const fyDiff = (latestAnnual?.fiscalYear != null && stmt5yAgoAnnual?.fiscalYear != null)
        ? latestAnnual.fiscalYear - stmt5yAgoAnnual.fiscalYear
        : 0;
    const yearsBack = fyDiff > 0 ? fyDiff : (annualStmts.length >= 5 ? 4 : (annualStmts.length - 1));
    
    if (latestAnnual && stmt5yAgoAnnual && yearsBack > 0) {
        // Require meaningful base-year scale (>= $10M revenue, >= $1M net income)
        // so spin-off stub periods (SOLS +1,108%) and pre-revenue biotech rows
        // (IBRX +232%) don't produce thousand-percent CAGR artifacts.
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
        // TATA and LVGI signs matter — both were inverted in a previous version.
        beneishScore = -4.84
            + 0.92 * dsri
            + 0.528 * gmIndex
            + 0.404 * aqi
            + 0.892 * sgi
            + 0.115 * depi
            - 0.172 * sgai
            + 4.679 * tata
            - 0.327 * lvgi;
        // Bound the final score to the plausible range
        beneishScore = Math.min(Math.max(beneishScore, -8), 8);
    }

    // ─── PILLAR SCORES (shared definitions — services/analysis/pillars.ts) ─
    // Growth inputs: EPS CAGR 5Y from annual statements + forward implied
    // growth from Finnhub forward P/E (same sanity rules as computeMetrics).
    const saneAnnualShares = (s: { sharesOutstanding: number | null; netIncome: number | null } | null | undefined) =>
        s && !isSuspiciousShareCount(s.sharesOutstanding, s.netIncome, tickerData?.sharesOutstanding)
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
    const fhForwardPe = finnhubMetrics?.forwardPe ?? null;
    // When GAAP TTM Net Income exceeds TTM Operating Income (EBIT) by >5%, a
    // non-operating windfall (e.g. GOOGL +$135.7B unrealized investment gain,
    // AMZN Rivian/Anthropic gains) is inflating GAAP currentEps, whereas
    // analyst consensus forwardPe models recurring operating earnings. Strip
    // the non-operating excess above EBIT so forwardImpliedGrowth doesn't
    // invert into a fake negative growth rate (-20.6%).
    const recurringEpsForFwd = (ttmEbit !== null && ttmEbit > 0 && effectiveNetIncome !== null && effectiveNetIncome > ttmEbit * 1.05 && currentShareCount && currentShareCount > 0)
        ? ttmEbit / currentShareCount
        : currentEps;
    const forwardImpliedGrowth = (fhForwardPe !== null && fhForwardPe >= 1 && currentPrice > 0 && recurringEpsForFwd !== null && recurringEpsForFwd > 0)
        ? ((currentPrice / fhForwardPe) / recurringEpsForFwd - 1) * 100
        : null;

    const pillarsInput = {
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
        // Moat: durability stats over the FY series — read-path parity with
        // computeMetrics (deriveMoatInputs is shared; persisted AnalysisCache
        // has no moat column, so only the five scores below are written).
        moatRoicDurability: moatDerived.roicDurability,
        moatGmMedian: moatDerived.gmMedian,
        moatFcfDurability: moatDerived.fcfDurability,
        moatMarginFloor: moatDerived.marginFloor,
    };
    if (process.env.DEBUG_PILLARS) console.log(`[pillars-input:${symbol}]`, JSON.stringify(pillarsInput));
    const pillars = computePillars(pillarsInput);
    healthScore = pillars.health.score;
    profitabilityScore = pillars.profitability.score;
    valuationScore = pillars.valuation.score;
    const growthScore = pillars.growth.score;
    const qualityScore = pillars.quality.score;
    const moatScore = pillars.moat.score;
    // Composite = plain mean of the five core 0–100 pillar scores. Distinct from
    // the Early Winners EW score (quant engine, different scale/coverage).
    const overallScore = (healthScore + profitabilityScore + valuationScore + growthScore + qualityScore) / 5;

    // Persisted verdict classification — same shared classifyVerdict the page
    // renders, so screener fund/val/verdict filters match the verdict card
    // exactly (no proxy approximation of the avg-of-4 rule or P/S fallback).
    const vc = classifyVerdict({
        pillars,
        // Read path (analysisCompute) marks tickers whose statements carry no
        // revenue/NI rows as insufficient — same condition so the persisted
        // key can't claim a verdict the page refuses to render.
        insufficientData: !stmts.some(s => s.revenue != null || s.netIncome != null),
        pePercentile,
        peCurrent: peForPct,
        peMedian,
        psPercentile,
        forwardPe: fhForwardPe !== null && fhForwardPe >= 1 ? fhForwardPe : null,
    });

    // ─── Signal Detection & Notification ───────────────────────────
    let lastQualitySignalAt: Date | undefined;
    if (!opts.skipNotify && altmanZ !== null && altmanZ > 3.0 && healthScore > 80) {
        const existingCache: any = await (prisma.analysisCache as any).findUnique({
            where: { symbol },
            select: { lastQualitySignalAt: true }
        });
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        if (!existingCache?.lastQualitySignalAt || existingCache.lastQualitySignalAt < sevenDaysAgo) {
            lastQualitySignalAt = new Date();
            NotificationService.notifyQualityBreakout(symbol, {
                health: healthScore,
                altmanZ: altmanZ
            }).catch(err => console.error(`[Alert] Notification failed for ${symbol}:`, err));
        }
    }

    await (prisma.analysisCache as any).upsert({
        where: { symbol },
        update: {
            healthScore, profitabilityScore, valuationScore,
            growthScore, qualityScore, moatScore, overallScore,
            piotroskiScore, beneishScore, interestCoverage, revenueCagr, netIncomeCagr,
            altmanZ, debtRepaymentYears, fcfMargin, fcfConversion,
            humanDebtInfo, humanPeInfo, marginStability, negativeNiYears, pePercentile,
            peVsMedian3yPct,
            fundLevel: vc.fundLevel, valLevel: vc.valLevel, verdictKey: vc.verdictKey,
            ...(lastQualitySignalAt ? { lastQualitySignalAt } : {})
        },
        create: {
            symbol, healthScore, profitabilityScore, valuationScore,
            growthScore, qualityScore, moatScore, overallScore,
            piotroskiScore, beneishScore, interestCoverage, revenueCagr, netIncomeCagr,
            altmanZ, debtRepaymentYears, fcfMargin, fcfConversion,
            humanDebtInfo, humanPeInfo, marginStability, negativeNiYears, pePercentile,
            peVsMedian3yPct, lastQualitySignalAt,
            fundLevel: vc.fundLevel, valLevel: vc.valLevel, verdictKey: vc.verdictKey,
        }
    });
}
