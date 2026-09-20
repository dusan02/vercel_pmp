import { prisma } from '@/lib/db/prisma';
import { computeTTM } from '@/lib/utils/ttm';
import { applySplitAdjustments, applyPostSplitAdjustment } from '@/lib/utils/splitAdjustment';
import { isSuspiciousShareCount } from '@/lib/utils/shareCount';
import { dedupeShareClasses } from '@/lib/companyNames';
import { buildValuationHistory } from '@/services/analysis/valuationHistory';
import { computePillars } from '@/services/analysis/pillars';

/**
 * Shared analysis computation used by both:
 * - GET/POST /api/analysis/[ticker] (client-side data source)
 * - /analysis/[ticker] SSR page (initial snapshot for sections)
 *
 * Extracted from the API route so the page and the API cannot drift apart.
 */

// Shared ticker select — includes all fields needed by computeMetrics + GET/POST handlers
export const TICKER_SELECT = {
    symbol: true,
    name: true,
    sector: true,
    industry: true,
    description: true,
    websiteUrl: true,
    logoUrl: true,
    employees: true,
    headquarters: true,
    sharesOutstanding: true,
    lastPrice: true,
    lastPriceUpdated: true,
    lastChangePct: true,
    lastMarketCap: true,
    lastMarketCapDiff: true,
    latestPrevClose: true,
    updatedAt: true,
} as const;

/**
 * Fetch sector peers for a given ticker.
 */
export async function fetchPeers(symbol: string, sector: string | null): Promise<string[]> {
    if (!sector) return [];
    // Over-fetch so share-class dedup (GOOG/GOOGL, BRK.A/BRK.B) still leaves 4
    const peerTickers = await prisma.ticker.findMany({
        where: { sector, symbol: { not: symbol } },
        select: { symbol: true, name: true },
        take: 8,
        orderBy: { lastMarketCap: 'desc' },
    });
    return dedupeShareClasses(peerTickers, 4).map(t => t.symbol);
}

// Helper: compute metrics for a single symbol
// tickerRecord: pre-fetched Ticker row (avoids duplicate DB queries from GET/POST)
export async function computeMetrics(symbol: string, tickerRecord?: any) {
    const analysis = await prisma.analysisCache.findUnique({ where: { symbol } });
    if (!analysis) return null;

    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

    const stmts = await prisma.financialStatement.findMany({
        where: { symbol, endDate: { gte: tenYearsAgo } },
        orderBy: { endDate: 'desc' },
    });

    // Adjust sharesOutstanding for stock splits using shared utility
    // Finnhub statements often have mixed pre-split and post-split shares
    if (stmts.length > 0) {
        try {
            await applySplitAdjustments(stmts, symbol, tenYearsAgo);
        } catch {
            // Non-critical — continue with unadjusted shares
        }
    }

    const latestStmt = stmts[0] || null;

    // Post-split shares adjustment for Finnhub statements not updated after a recent split
    // trustedShares = Ticker-level current count — corroborates per-statement
    // sharesOutstanding (the Finnhub EPS fallback can write ni/EPS garbage).
    let trustedShares = tickerRecord?.sharesOutstanding ?? null;
    if (stmts.length > 0) {
        const tickerInfo = tickerRecord ?? await prisma.ticker.findUnique({
            where: { symbol },
            select: { sharesOutstanding: true },
        });
        trustedShares = trustedShares ?? tickerInfo?.sharesOutstanding ?? null;
        if (tickerInfo?.sharesOutstanding) {
            applyPostSplitAdjustment(stmts, tickerInfo.sharesOutstanding);
        }
    }

    // Full daily valuation history (asc) — feeds both the latest snapshot
    // values and the historical percentile stats in one query.
    const valuationRows = await prisma.dailyValuationHistory.findMany({
        where: { symbol },
        orderBy: { date: 'asc' },
        select: { date: true, closePrice: true, marketCap: true, peRatio: true, psRatio: true, evEbitda: true, fcfYield: true },
    });
    const latestValuation = valuationRows.length > 0 ? valuationRows[valuationRows.length - 1]! : null;

    // Fetch Finnhub pre-computed metrics (primary source for ratios)
    const finnhubMetrics = await prisma.finnhubMetrics.findUnique({ where: { symbol } });

    const cached = analysis as any;
    const altmanZ = cached.altmanZ;
    const debtRepaymentYears = cached.debtRepaymentYears;

    // Snapshot variables MUST come from latestStmt (most recent quarter or annual)
    const totalDebt = latestStmt?.totalDebt ?? null;
    const cash = latestStmt?.cashAndEquivalents ?? null;
    const netDebt = (totalDebt !== null && cash !== null) ? totalDebt - cash : null;
    const totalEquity = latestStmt?.totalEquity ?? null;
    const totalAssets = latestStmt?.totalAssets ?? null;
    const totalLiabilities = latestStmt?.totalLiabilities ?? null;
    const currentAssets = latestStmt?.currentAssets ?? null;
    const currentLiabilities = latestStmt?.currentLiabilities ?? null;
    // Corrupted-shares guard: when a statement's count carries the
    // netIncome/integer signature (bad EPS fallback) and deviates >30% from
    // the trusted Ticker count, substitute the trusted count for the LATEST
    // statement (it IS the current count). Historical rows can't be repaired
    // this way — their endpoints are nulled below rather than showing garbage.
    const rawShares = latestStmt?.sharesOutstanding ?? null;
    const sharesOutstanding = isSuspiciousShareCount(rawShares, latestStmt?.netIncome ?? null, trustedShares)
        ? trustedShares
        : rawShares;
    const sbcSnapshot = latestStmt?.sbc ?? null;
    const saneShares = (s: { sharesOutstanding: number | null; netIncome: number | null } | undefined | null) =>
        isSuspiciousShareCount(s?.sharesOutstanding, s?.netIncome ?? null, trustedShares)
            ? null
            : (s?.sharesOutstanding ?? null);

    // TTM via shared utility (latestQ + FY - sameQ_prevYear)
    const ttm = computeTTM(stmts);
    const ttmNetIncome = ttm.netIncome;
    const ttmRevenue = ttm.revenue;
    const ttmEbit = ttm.ebit;
    const ttmGrossProfit = ttm.grossProfit;
    const ttmSbc = ttm.sbc;

    // P/E: our own TTM EPS is the production source. Finnhub's peRatio can be
    // computed on a stale EPS basis — e.g. MU showed 129x (FY-ago EPS) while
    // fresh statements gave ~23x. Finnhub stays exported as diagnostics only.
    const effectivePrice = tickerRecord?.lastPrice || latestValuation?.closePrice || 0;
    const effectiveNI = ttmNetIncome ?? latestStmt?.netIncome ?? null;
    let currentPe: number | null = null;
    if (effectivePrice > 0 && sharesOutstanding && sharesOutstanding > 0 && effectiveNI && effectiveNI > 0) {
        currentPe = (effectivePrice * sharesOutstanding) / effectiveNI;
    }
    if (currentPe === null) {
        currentPe = latestValuation?.peRatio || null;
    }

    // EPS: same NI basis as P/E — mixing Finnhub EPS with our P/E would break
    // the price/EPS reconciliation the UI asserts.
    const currentEps = (effectiveNI !== null && effectiveNI > 0 && sharesOutstanding !== null && sharesOutstanding > 0)
        ? effectiveNI / sharesOutstanding
        : finnhubMetrics?.netIncomePerShare ?? null;

    // P/E is meaningless for loss-making companies (negative TTM EPS).
    // Finnhub's "normalized" P/E can be a large positive number while the
    // reported TTM EPS is negative — showing "568x" next to "EPS −$3.55"
    // is a contradiction. Industry convention: no P/E for loss-makers.
    if (currentPe !== null && currentEps !== null && currentEps <= 0) {
        currentPe = null;
    }

    // Own TTM multiples — same basis as DailyValuationHistory rows, so the
    // historical percentile below ranks like-for-like. Market cap prefers the
    // ticker snapshot (same source the table uses), falls back to price×shares.
    const mcapNow = (tickerRecord?.lastMarketCap && tickerRecord.lastMarketCap > 0)
        ? tickerRecord.lastMarketCap * 1e9
        : (effectivePrice > 0 && sharesOutstanding && sharesOutstanding > 0 ? effectivePrice * sharesOutstanding : null);
    const currentPs = (mcapNow !== null && mcapNow > 0 && ttmRevenue !== null && ttmRevenue > 0)
        ? mcapNow / ttmRevenue : null;
    const evNow = (mcapNow !== null && totalDebt !== null && cash !== null)
        ? mcapNow + totalDebt - cash : null;
    const currentEvEbit = (evNow !== null && evNow > 0 && ttmEbit !== null && ttmEbit > 0)
        ? evNow / ttmEbit : null;
    const ttmFcf = (ttm.operatingCashFlow !== null && ttm.capex !== null)
        ? ttm.operatingCashFlow - Math.abs(ttm.capex) : null;
    const currentFcfYield = (ttmFcf !== null && mcapNow !== null && mcapNow > 0)
        ? ttmFcf / mcapNow : null;

    // FCF Yield: own TTM basis (same period as FCF margin). Fallbacks: latest
    // daily snapshot, then Finnhub P/FCF inverse.
    const fcfYield = currentFcfYield
        ?? latestValuation?.fcfYield
        ?? (finnhubMetrics?.priceFreeCashFlow != null && finnhubMetrics.priceFreeCashFlow > 0
            ? 1 / finnhubMetrics.priceFreeCashFlow
            : null);

    // Historical percentile stats vs own 10Y daily history (our TTM basis).
    const valuationHistoryStats = valuationRows.length > 0
        ? buildValuationHistory(valuationRows, {
            pe: currentPe,
            ps: currentPs ?? latestValuation?.psRatio ?? null,
            evEbit: currentEvEbit ?? latestValuation?.evEbitda ?? null,
            fcfYield: currentFcfYield ?? latestValuation?.fcfYield ?? null,
        })
        : null;

    // Forward P/E & implied forward EPS (market-implied next-year earnings)
    const forwardPeRaw = finnhubMetrics?.forwardPe ?? null;
    // Garbage guard: Finnhub sometimes returns tiny positive forward P/E
    // (e.g. 1.5e-05 for illiquid foreign names) — forwardEps = price/forwardPe
    // would explode. A forward P/E < 1 implies next-year earnings exceed the
    // whole market cap — not a real market expectation. Floor at 1 also bounds
    // forwardEps <= price.
    const forwardPe = forwardPeRaw !== null && forwardPeRaw >= 1 ? forwardPeRaw : null;
    const forwardEps = (forwardPe !== null && forwardPe > 0 && effectivePrice > 0)
        ? effectivePrice / forwardPe
        : null;
    // Forward implied 1Y growth = (forwardEps / currentEps - 1) × 100
    const forwardImpliedGrowth = (forwardEps !== null && forwardEps > 0 && currentEps !== null && currentEps > 0)
        ? parseFloat(((forwardEps / currentEps - 1) * 100).toFixed(2))
        : null;

    // Prefer Finnhub pre-computed ratios, fallback to our calculations
    // Own-statement ratios first, Finnhub as fallback — the pillar radar and
    // Key Metrics must read the same number for the same metric.
    const debtToEquity = ((totalDebt !== null && totalEquity !== null && totalEquity !== 0)
        ? totalDebt / totalEquity : null) ?? finnhubMetrics?.debtEquityRatio ?? null;
    const currentRatio = ((currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0)
        ? currentAssets / currentLiabilities : null) ?? finnhubMetrics?.currentRatio ?? null;
    const assetToLiability = (totalAssets !== null && totalLiabilities !== null && totalLiabilities !== 0)
        ? totalAssets / totalLiabilities : null;
    const netDebtToEbit = (netDebt !== null && ttmEbit !== null && ttmEbit !== 0)
        ? netDebt / ttmEbit : null;
    const sbcToRevenue = (ttmSbc !== null && ttmRevenue !== null && ttmRevenue > 0)
        ? ttmSbc / ttmRevenue : null;
    const sbcRatio = (ttmSbc !== null && ttmNetIncome !== null && ttmNetIncome > 0)
        ? (ttmSbc / ttmNetIncome) * 100 : null;
    // Own-first (latest-statement EBIT / |interest|), Finnhub fallback — same
    // convention the pillar radar uses, so Key Metrics and radar can't diverge.
    const interestCoverage = (latestStmt?.ebit != null && latestStmt.interestExpense != null && latestStmt.interestExpense !== 0)
        ? latestStmt.ebit / Math.abs(latestStmt.interestExpense)
        : (finnhubMetrics?.interestCoverage ?? null);

    // Calculate Dilution (Share Count change)
    // Compare same fiscal period one year (or 5 years) earlier — not just any
    // statement older than N days. This matches ShareDilutionChart logic.
    const currentShares = sharesOutstanding; // guarded — corrupt counts replaced by Ticker-level count
    const currentFP = latestStmt?.fiscalPeriod ?? null;
    const currentFY = latestStmt?.fiscalYear ?? null;

    const stmt1y = (currentFP && currentFY != null)
        ? stmts.find(s => s.fiscalPeriod === currentFP && s.fiscalYear === currentFY - 1)
        : stmts.find(s => s.endDate < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
    const stmt5y = (currentFP && currentFY != null)
        ? stmts.find(s => s.fiscalPeriod === currentFP && s.fiscalYear === currentFY - 5)
        : stmts.find(s => s.endDate < new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000));

    const dilution1y = (currentShares && saneShares(stmt1y))
        ? (currentShares / saneShares(stmt1y)! - 1) * 100 : null;
    const dilution5y = (currentShares && saneShares(stmt5y))
        ? (currentShares / saneShares(stmt5y)! - 1) * 100 : null;

    // ─── Pillar scores (radar) ────────────────────────────────────────────
    // Shared leg definitions (services/analysis/pillars.ts) — recomputed
    // read-time so all five axes sit on one as-of snapshot, independent of
    // how stale the stored AnalysisCache health/profitability/valuation are.
    const annualStmts = stmts.filter(s => s.fiscalPeriod === 'FY');
    const latestAnnual = annualStmts[0] ?? null;
    const stmt5yAgoAnnual = annualStmts[4] ?? annualStmts[annualStmts.length - 1] ?? null;
    const yearsBack = annualStmts.length >= 5 ? 4 : (annualStmts.length - 1);
    let epsCagr5y: number | null = null;
    const epsNowShares = saneShares(latestAnnual);
    const epsThenShares = saneShares(stmt5yAgoAnnual);
    if (latestAnnual && stmt5yAgoAnnual && yearsBack > 0
        && latestAnnual.netIncome && latestAnnual.netIncome > 0 && epsNowShares && epsNowShares > 0
        && stmt5yAgoAnnual.netIncome && stmt5yAgoAnnual.netIncome > 0 && epsThenShares && epsThenShares > 0) {
        const epsNow = latestAnnual.netIncome / epsNowShares;
        const epsThen = stmt5yAgoAnnual.netIncome / epsThenShares;
        if (epsNow > 0 && epsThen > 0) {
            epsCagr5y = (Math.pow(epsNow / epsThen, 1 / yearsBack) - 1) * 100;
        }
    }

    const investedCapital = (totalEquity || 0) + (totalDebt || 0) - (cash || 0);
    const pillarNetMargin = (ttmNetIncome !== null && ttmRevenue !== null && ttmRevenue > 0)
        ? ttmNetIncome / ttmRevenue
        : (finnhubMetrics?.netMargin != null ? finnhubMetrics.netMargin / 100 : null);
    const pillarOpMargin = (ttmEbit !== null && ttmRevenue !== null && ttmRevenue > 0)
        ? ttmEbit / ttmRevenue
        : (finnhubMetrics?.operatingMargin != null ? finnhubMetrics.operatingMargin / 100 : null);
    const pillarRoe = (totalEquity !== null && totalEquity > 0)
        ? (ttmNetIncome !== null ? ttmNetIncome / totalEquity
            : (finnhubMetrics?.roe != null ? finnhubMetrics.roe / 100 : null))
        : null;
    const pillarRoic = (ttmEbit !== null && investedCapital > 0)
        ? (ttmEbit * 0.79) / investedCapital
        : null;
    const pillarInterestCoverage = interestCoverage;
    const pillarNetCash = (totalDebt !== null || cash !== null) ? (totalDebt || 0) - (cash || 0) <= 0 : null;
    const pillarNetDebtRatio = (pillarNetCash === false && totalAssets !== null && totalAssets > 0)
        ? ((totalDebt || 0) - (cash || 0)) / totalAssets
        : null;

    const pillarsInput = {
        pePercentile: valuationHistoryStats?.pe.percentile ?? null,
        fcfYield: currentFcfYield ?? latestValuation?.fcfYield ?? null,
        psRatio: currentPs ?? finnhubMetrics?.psRatio ?? null,
        evEbit: currentEvEbit ?? null,
        revenueCagr: cached.revenueCagr ?? null,
        netIncomeCagr: cached.netIncomeCagr ?? null,
        epsCagr5y,
        forwardImpliedGrowth,
        roic: pillarRoic,
        roe: pillarRoe,
        netMargin: pillarNetMargin,
        operatingMargin: pillarOpMargin,
        altmanZ: altmanZ ?? null,
        // Own balance-sheet ratio first (matches scoreCalculator), Finnhub fallback.
        currentRatio: ((currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0)
            ? currentAssets / currentLiabilities : null) ?? finnhubMetrics?.currentRatio ?? null,
        interestCoverage: pillarInterestCoverage,
        netCash: pillarNetCash,
        debtRatio: pillarNetDebtRatio,
        piotroski: cached.piotroskiScore ?? null,
        beneish: cached.beneishScore ?? null,
        fcfConversion: cached.fcfConversion ?? null,
        marginStability: cached.marginStability ?? null,
    };
    if (process.env.DEBUG_PILLARS) console.log(`[pillars-input:${symbol}]`, JSON.stringify(pillarsInput));
    const pillars = computePillars(pillarsInput);

    return {
        ...analysis,
        statements: stmts,
        balanceSheet: {
            totalDebt,
            cash,
            netDebt,
            totalEquity,
            totalAssets,
            totalLiabilities,
            currentAssets,
            currentLiabilities,
            debtToEquity,
            currentRatio,
            assetToLiability,
            netDebtToEbit,
            sbc: sbcSnapshot,
            sbcToRevenue,
            sbcRatio,
            sharesOutstanding,
            dilution1y,
            dilution5y
        },
        ttm: {
            netIncome: ttmNetIncome,
            revenue: ttmRevenue,
            ebit: ttmEbit,
            grossProfit: ttmGrossProfit,
            operatingCashFlow: ttm.operatingCashFlow,
            capex: ttm.capex,
            sbc: ttmSbc
        },
        metrics: {
            zScore: altmanZ,
            altmanZ,
            debtRepaymentTime: debtRepaymentYears,
            debtRepaymentYears,
            fcfYield,
            currentEps,
            currentPe,
            psRatio: currentPs,
            evEbit: currentEvEbit,
            forwardPe,
            forwardEps,
            forwardImpliedGrowth,
            fcfMargin: cached.fcfMargin,
            fcfConversion: cached.fcfConversion,
            interestCoverage
        },
        valuationHistoryStats,
        pillars,
        finnhub: finnhubMetrics ? {
            peRatio: finnhubMetrics.peRatio,
            forwardPe: finnhubMetrics.forwardPe,
            pbRatio: finnhubMetrics.pbRatio,
            psRatio: finnhubMetrics.psRatio,
            evEbitda: finnhubMetrics.evEbitda,
            grossMargin: finnhubMetrics.grossMargin,
            operatingMargin: finnhubMetrics.operatingMargin,
            netMargin: finnhubMetrics.netMargin,
            roe: finnhubMetrics.roe,
            roa: finnhubMetrics.roa,
            roic: finnhubMetrics.roic,
            currentRatio: finnhubMetrics.currentRatio,
            quickRatio: finnhubMetrics.quickRatio,
            debtEquityRatio: finnhubMetrics.debtEquityRatio,
            interestCoverage: finnhubMetrics.interestCoverage,
            revenueGrowth: finnhubMetrics.revenueGrowth,
            earningsGrowth: finnhubMetrics.earningsGrowth,
            revenuePerShare: finnhubMetrics.revenuePerShare,
            netIncomePerShare: finnhubMetrics.netIncomePerShare,
            bookValuePerShare: finnhubMetrics.bookValuePerShare,
            freeCashFlowPerShare: finnhubMetrics.freeCashFlowPerShare,
            dividendYield: finnhubMetrics.dividendYield,
            payoutRatio: finnhubMetrics.payoutRatio,
            beta: finnhubMetrics.beta,
            pegRatio: finnhubMetrics.pegRatio,
            priceFreeCashFlow: finnhubMetrics.priceFreeCashFlow,
            fetchedAt: finnhubMetrics.fetchedAt,
        } : null
    };
}
