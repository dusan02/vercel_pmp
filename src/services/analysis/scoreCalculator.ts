import { prisma } from '@/lib/db/prisma';
import { aiService } from '../aiService';
import { NotificationService } from '../notificationService';
import { computeTTM } from '@/lib/utils/ttm';
import { computePillars } from './pillars';
import { isSuspiciousShareCount } from '@/lib/utils/shareCount';

export interface CalculateScoresOptions {
    /** Skip the AI verdict call (backfills/bulk jobs — keeps stored verdictText). */
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
    if (!latestStmt) return;
    const annualStmts = stmts.filter(s => s.fiscalPeriod === 'FY');
    
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
    let verdictText = 'Neutral';

    const tickerData = await prisma.ticker.findUnique({
        where: { symbol },
        select: { lastPrice: true, lastMarketCap: true, sharesOutstanding: true }
    });

    // Fetch Finnhub pre-computed metrics for scoring
    const finnhubMetrics = await prisma.finnhubMetrics.findUnique({ where: { symbol } });

    // latestValuation is also needed when Ticker lacks lastMarketCap —
    // otherwise marketCap collapses to 0 and every valuation leg scores its
    // missing-data points instead of the real ratio.
    const latestValuation = (!tickerData?.lastPrice || !tickerData?.lastMarketCap) ? await prisma.dailyValuationHistory.findFirst({
        where: { symbol },
        orderBy: { date: 'desc' }
    }) : null;

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
    if (latestStmt.totalAssets && latestStmt.totalAssets > 0) {
        const sharesOutstanding = latestStmt.sharesOutstanding || tickerData?.sharesOutstanding;
        const marketValueOfEquity = sharesOutstanding && sharesOutstanding > 0 && currentPrice > 0
            ? sharesOutstanding * currentPrice
            : marketCap;
        
        const A = ((latestStmt.currentAssets || 0) - (latestStmt.currentLiabilities || 0)) / latestStmt.totalAssets;
        const B = (latestStmt.retainedEarnings || 0) / latestStmt.totalAssets;
        const C = (latestStmt.ebit || 0) / latestStmt.totalAssets;
        const D = latestStmt.totalLiabilities && latestStmt.totalLiabilities > 0 && marketValueOfEquity > 0 
            ? marketValueOfEquity / latestStmt.totalLiabilities 
            : 0;
        const E = (latestStmt.revenue || 0) / latestStmt.totalAssets;
        altmanZ = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
    }

    // --- FCF & Debt Repayment ---
    let fcf: number | null = null;
    let debtRepaymentYears: number | null = null;
    let humanDebtInfo: string | null = null;

    if (ttmOcf !== null && ttmCapex !== null) {
        fcf = ttmOcf - Math.abs(ttmCapex);
        const netDebt = (latestStmt.totalDebt || 0) - (latestStmt.cashAndEquivalents || 0);

        if (netDebt <= 0) {
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
    if (fcf !== null && latestStmt.revenue && latestStmt.revenue > 0) {
        // Clamp to ±200% — beyond that the tiny-revenue denominator makes
        // the ratio meaningless (observed artifacts like -31,000%).
        fcfMargin = Math.max(-2, Math.min(2, fcf / (ttmRevenue ?? latestStmt.revenue)));
    }

    let fcfConversion: number | null = null;
    if (fcf !== null && latestStmt.netIncome && latestStmt.netIncome > 0) {
        fcfConversion = fcf / (ttmNetIncome ?? latestStmt.netIncome);
    }

    // --- Quality Stats ---
    let negativeNiYears = 0;
    const margins: number[] = [];
    const yearlyNi: Record<number, number> = {};
    stmts.forEach(s => {
        if (s.netIncome !== null) {
            yearlyNi[s.fiscalYear] = (yearlyNi[s.fiscalYear] || 0) + s.netIncome;
        }
        if (s.revenue && s.revenue > 0 && s.ebit !== null) {
            margins.push(s.ebit / s.revenue);
        }
    });
    Object.values(yearlyNi).forEach(ni => { if (ni < 0) negativeNiYears++; });

    let marginStability: number | null = null;
    if (margins.length > 2) {
        const mean = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / margins.length;
        marginStability = Math.sqrt(variance);
    }

    // --- Interest Coverage ---
    let interestCoverage: number | null = null;
    if (latestStmt.ebit !== null && latestStmt.interestExpense !== null && latestStmt.interestExpense !== 0) {
        interestCoverage = latestStmt.ebit / Math.abs(latestStmt.interestExpense);
    }

    // ─── PILLAR INPUTS: Health ────────────────────────────────────────────
    // Legs live in services/analysis/pillars.ts (shared with the read path).
    const currentRatio = (latestStmt.currentAssets && latestStmt.currentLiabilities && latestStmt.currentLiabilities > 0)
        ? latestStmt.currentAssets / latestStmt.currentLiabilities
        : null;
    const hasBalanceData = latestStmt.totalDebt !== null || latestStmt.cashAndEquivalents !== null;
    const currentNetDebt = (latestStmt.totalDebt || 0) - (latestStmt.cashAndEquivalents || 0);
    const netCash = hasBalanceData ? currentNetDebt <= 0 : null;
    const netDebtRatio = (hasBalanceData && currentNetDebt > 0 && latestStmt.totalAssets && latestStmt.totalAssets > 0)
        ? currentNetDebt / latestStmt.totalAssets
        : null;

    // ─── PILLAR INPUTS: Profitability (own TTM basis, Finnhub fallback) ───
    // Revenue growth deliberately removed — it now lives in the Growth pillar.
    const fhNetMargin = finnhubMetrics?.netMargin != null ? finnhubMetrics.netMargin / 100 : null;
    const fhRoe = finnhubMetrics?.roe != null ? finnhubMetrics.roe / 100 : null;
    const fhOpMargin = finnhubMetrics?.operatingMargin != null ? finnhubMetrics.operatingMargin / 100 : null;

    const pillarNetMargin = (ttmNetIncome !== null && ttmRevenue !== null && ttmRevenue > 0)
        ? ttmNetIncome / ttmRevenue
        : (fhNetMargin ?? ((latestStmt.revenue && latestStmt.revenue > 0) ? (latestStmt.netIncome || 0) / latestStmt.revenue : null));
    const pillarOpMargin = (ttmEbit !== null && ttmRevenue !== null && ttmRevenue > 0)
        ? ttmEbit / ttmRevenue
        : (fhOpMargin ?? ((latestStmt.revenue && latestStmt.revenue > 0 && latestStmt.ebit !== null) ? latestStmt.ebit / latestStmt.revenue : null));
    const investedCapital = (latestStmt.totalEquity || 0) + (latestStmt.totalDebt || 0) - (latestStmt.cashAndEquivalents || 0);
    const pillarRoic = (ttmEbit !== null && investedCapital > 0)
        ? (ttmEbit * 0.79) / investedCapital  // NOPAT ≈ EBIT × (1 − 21% tax)
        : null;
    const pillarRoe = (latestStmt.totalEquity && latestStmt.totalEquity > 0)
        ? (ttmNetIncome !== null ? ttmNetIncome / latestStmt.totalEquity : (fhRoe ?? ((latestStmt.netIncome || 0) / latestStmt.totalEquity)))
        : null;

    // ─── PILLAR INPUTS: Valuation ────────────────────────────────────────
    let humanPeInfo: string | null = null;

    const allValuations = await prisma.dailyValuationHistory.findMany({
        where: { symbol, peRatio: { not: null } },
        select: { peRatio: true },
        orderBy: { peRatio: 'asc' }
    });

    const effectiveNetIncome = ttmNetIncome ?? latestStmt.netIncome;
    // Corrupt-statement guard: EPS-derived share counts (ni/round-EPS) must
    // not feed P/E — the read path uses the same isSuspiciousShareCount rule.
    const stmtShares = (latestStmt.sharesOutstanding && latestStmt.sharesOutstanding > 0
        && !isSuspiciousShareCount(latestStmt.sharesOutstanding, latestStmt.netIncome, tickerData?.sharesOutstanding))
        ? latestStmt.sharesOutstanding
        : (tickerData?.sharesOutstanding && tickerData.sharesOutstanding > 0 ? tickerData.sharesOutstanding : null);
    // P/E source must match the UI (price / own TTM EPS). Finnhub's peRatio can
    // sit on a stale EPS basis — using it here once produced percentile=100 and
    // a "top 0%" label while our own valuation history showed ~21x.
    const currentPE = (currentPrice > 0 && stmtShares && effectiveNetIncome && effectiveNetIncome > 0)
        ? (currentPrice * stmtShares) / effectiveNetIncome
        : (latestValuation?.peRatio || null);

    let pePercentile: number | null = null;
    if (allValuations.length > 0 && currentPE !== null && currentPE > 0) {
        const index = allValuations.findIndex(v => v.peRatio !== null && v.peRatio >= currentPE);
        pePercentile = index === -1 ? 100 : (index / allValuations.length) * 100;
        humanPeInfo = formatPePercentile(currentPE, pePercentile);
    }

    const pillarFcfYield = (fcf !== null && marketCap > 0) ? fcf / marketCap : null;

    const effectiveRevenue = ttmRevenue ?? latestStmt.revenue;
    // Own TTM P/S first (matches the unified-source rule), Finnhub as fallback.
    const pillarPs = ((effectiveRevenue && effectiveRevenue > 0 && marketCap > 0) ? marketCap / effectiveRevenue : null)
        ?? finnhubMetrics?.psRatio ?? null;

    const effectiveEbit = ttmEbit ?? latestStmt.ebit;
    const pillarEvEbit = (effectiveEbit && effectiveEbit > 0 && marketCap > 0)
        ? (marketCap + (latestStmt.totalDebt || 0) - (latestStmt.cashAndEquivalents || 0)) / effectiveEbit
        : null;

    // ─── CAGR, Piotroski, Beneish ──────────────────────────────────
    let revenueCagr: number | null = null;
    let netIncomeCagr: number | null = null;
    const latestAnnual = annualStmts[0] || null;
    const stmt5yAgoAnnual = annualStmts[4] || annualStmts[annualStmts.length - 1] || null;
    const yearsBack = annualStmts.length >= 5 ? 4 : (annualStmts.length - 1);
    
    if (latestAnnual && stmt5yAgoAnnual && yearsBack > 0) {
        if (latestAnnual.revenue && stmt5yAgoAnnual.revenue && stmt5yAgoAnnual.revenue > 0) {
            revenueCagr = (Math.pow(latestAnnual.revenue / stmt5yAgoAnnual.revenue, 1 / yearsBack) - 1) * 100;
        }
        if (latestAnnual.netIncome && stmt5yAgoAnnual.netIncome && stmt5yAgoAnnual.netIncome > 0 && latestAnnual.netIncome > 0) {
            netIncomeCagr = (Math.pow(latestAnnual.netIncome / stmt5yAgoAnnual.netIncome, 1 / yearsBack) - 1) * 100;
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
    let epsCagr5y: number | null = null;
    if (latestAnnual && stmt5yAgoAnnual && yearsBack > 0) {
        const sharesNow = latestAnnual.sharesOutstanding;
        const sharesThen = stmt5yAgoAnnual.sharesOutstanding;
        if (latestAnnual.netIncome && latestAnnual.netIncome > 0 && sharesNow && sharesNow > 0
            && stmt5yAgoAnnual.netIncome && stmt5yAgoAnnual.netIncome > 0 && sharesThen && sharesThen > 0) {
            const epsNow = latestAnnual.netIncome / sharesNow;
            const epsThen = stmt5yAgoAnnual.netIncome / sharesThen;
            if (epsNow > 0 && epsThen > 0) {
                epsCagr5y = (Math.pow(epsNow / epsThen, 1 / yearsBack) - 1) * 100;
            }
        }
    }
    const fhForwardPe = finnhubMetrics?.forwardPe ?? null;
    const ttmEps = (latestStmt.sharesOutstanding && latestStmt.sharesOutstanding > 0 && effectiveNetIncome && effectiveNetIncome > 0)
        ? effectiveNetIncome / latestStmt.sharesOutstanding
        : null;
    const forwardImpliedGrowth = (fhForwardPe !== null && fhForwardPe >= 1 && currentPrice > 0 && ttmEps && ttmEps > 0)
        ? ((currentPrice / fhForwardPe) / ttmEps - 1) * 100
        : null;

    const pillars = computePillars({
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
    });
    healthScore = pillars.health.score;
    profitabilityScore = pillars.profitability.score;
    valuationScore = pillars.valuation.score;
    const growthScore = pillars.growth.score;
    const qualityScore = pillars.quality.score;
    // Composite = plain mean of the five 0–100 pillar scores. Distinct from
    // the Early Winners EW score (quant engine, different scale/coverage).
    const overallScore = (healthScore + profitabilityScore + valuationScore + growthScore + qualityScore) / 5;

    // ─── AI Verdict ────────────────────────────────────────────────
    if (!opts.skipVerdict) try {
        const aiVerdict = await aiService.generateInvestmentVerdict({
            ticker: symbol,
            scores: { H: healthScore, P: profitabilityScore, V: valuationScore },
            context: `Altman Z: ${altmanZ?.toFixed(2)}, Repayment: ${debtRepaymentYears?.toFixed(1)}y, FCF Yield: ${fcf && marketCap ? (fcf / marketCap * 100).toFixed(1) : 'N/A'}%`
        });
        if (aiVerdict) verdictText = aiVerdict;
    } catch (e) { }

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
            ...(opts.skipVerdict ? {} : { verdictText }),
            growthScore, qualityScore, overallScore,
            piotroskiScore, beneishScore, interestCoverage, revenueCagr, netIncomeCagr,
            altmanZ, debtRepaymentYears, fcfMargin, fcfConversion,
            humanDebtInfo, humanPeInfo, marginStability, negativeNiYears,
            ...(lastQualitySignalAt ? { lastQualitySignalAt } : {})
        },
        create: {
            symbol, healthScore, profitabilityScore, valuationScore, verdictText,
            growthScore, qualityScore, overallScore,
            piotroskiScore, beneishScore, interestCoverage, revenueCagr, netIncomeCagr,
            altmanZ, debtRepaymentYears, fcfMargin, fcfConversion,
            humanDebtInfo, humanPeInfo, marginStability, negativeNiYears,
            lastQualitySignalAt
        }
    });
}
