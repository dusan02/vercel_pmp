import { prisma } from '@/lib/db/prisma';
import { applySplitAdjustments, applyPostSplitAdjustment } from '@/lib/utils/splitAdjustment';
import { isSuspiciousShareCount } from '@/lib/utils/shareCount';
import { dedupeShareClasses } from '@/lib/companyNames';
import { derivePillarInputs } from '@/services/analysis/pillarInputs';

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

    // ─── Shared derivation — the single snapshot (same code the write path
    // uses to fill AnalysisCache). No stored metric feeds the pillar inputs:
    // cached values could be days stale while statements/price are live, and
    // mixing the two produced the KKR 23-vs-26 health divergence.
    const tickerForDerive = tickerRecord ?? await prisma.ticker.findUnique({
        where: { symbol },
        select: { lastPrice: true, lastMarketCap: true, sharesOutstanding: true },
    });
    const d = derivePillarInputs({
        stmts,
        tickerData: tickerForDerive
            ? {
                lastPrice: tickerForDerive.lastPrice ?? null,
                lastMarketCap: tickerForDerive.lastMarketCap ?? null,
                sharesOutstanding: tickerForDerive.sharesOutstanding ?? null,
            }
            : null,
        finnhubMetrics,
        valuationRows,
    });
    const pillars = d.pillars;

    // ─── Display-only fields (not pillar inputs) ──────────────────────────
    const bsStmt = d.bsStmt;
    const totalDebt = bsStmt?.totalDebt ?? null;
    const cash = bsStmt?.cashAndEquivalents ?? null;
    const netDebt = d.netDebt;
    const totalEquity = bsStmt?.totalEquity ?? null;
    const totalAssets = bsStmt?.totalAssets ?? null;
    const totalLiabilities = bsStmt?.totalLiabilities ?? null;
    const currentAssets = bsStmt?.currentAssets ?? null;
    const currentLiabilities = bsStmt?.currentLiabilities ?? null;
    const sharesOutstanding = isSuspiciousShareCount(latestStmt?.sharesOutstanding, latestStmt?.netIncome ?? null, trustedShares)
        ? trustedShares
        : (latestStmt?.sharesOutstanding ?? null);
    const sbcSnapshot = stmts.find(s => s.sbc != null)?.sbc ?? null;
    const ttm = d.ttm;
    const ttmNetIncome = ttm.netIncome;
    const ttmRevenue = ttm.revenue;
    const ttmEbit = ttm.ebit;
    const ttmGrossProfit = ttm.grossProfit;
    const ttmSbc = ttm.sbc;
    const effectivePrice = d.currentPrice;
    const currentShareCount = d.currentShareCount;
    const currentPe = d.currentPe;
    const currentEps = d.currentEps;
    const currentPs = d.currentPs;
    const currentEvEbit = d.currentEvEbit;
    const currentFcfYield = d.currentFcfYield;
    const insufficientData = d.insufficientData;

    // FCF Yield display: own TTM basis, then the latest daily snapshot, then
    // Finnhub P/FCF inverse — track the source so the UI tooltip cannot claim
    // a TTM basis for a Finnhub-derived value. (Pillar leg uses only the first
    // two tiers; the Finnhub fallback is display-only by design.)
    const fcfYieldSource: 'ttm' | 'history' | 'finnhub' | null =
        currentFcfYield !== null ? 'ttm'
        : latestValuation?.fcfYield != null ? 'history'
        : (finnhubMetrics?.priceFreeCashFlow != null && finnhubMetrics.priceFreeCashFlow > 0) ? 'finnhub'
        : null;
    const fcfYield = currentFcfYield
        ?? latestValuation?.fcfYield
        ?? (fcfYieldSource === 'finnhub' ? 1 / finnhubMetrics!.priceFreeCashFlow! : null);

    // Forward P/E & implied forward EPS (market-implied next-year earnings)
    const forwardPe = d.forwardPe;
    const forwardEps = (forwardPe !== null && forwardPe > 0 && effectivePrice > 0)
        ? effectivePrice / forwardPe
        : null;
    // Forward implied 1Y growth — shared value, rounded for display parity
    // with the previous read path.
    const forwardImpliedGrowth = d.forwardImpliedGrowth !== null
        ? parseFloat(d.forwardImpliedGrowth.toFixed(2))
        : null;

    // Own-statement ratios first, Finnhub as fallback (display block).
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
    const interestCoverage = d.interestCoverage;

    // Dilution (share-count change vs same fiscal period 1Y/5Y earlier).
    const currentShares = currentShareCount;
    const currentFP = latestStmt?.fiscalPeriod ?? null;
    const currentFY = latestStmt?.fiscalYear ?? null;
    const saneShares = (s: { sharesOutstanding: number | null; netIncome: number | null } | undefined | null) =>
        isSuspiciousShareCount(s?.sharesOutstanding, s?.netIncome ?? null, trustedShares)
            ? null
            : (s?.sharesOutstanding ?? null);
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

    const liveMarginStability = d.marginStability;
    const liveFcfConversion = d.fcfConversion;
    const valuationHistoryStats = d.valuationHistoryStats;
    const altmanZ = d.altmanZ;
    const debtRepaymentYears = d.debtRepaymentYears;


    // Strip integer-EPS-derived garbage share counts from historical rows
    // before handing statements to UI charts (ShareDilutionChart).
    for (const s of stmts) {
        if (isSuspiciousShareCount(s.sharesOutstanding, s.netIncome, trustedShares)) {
            s.sharesOutstanding = s === latestStmt ? trustedShares : null;
        }
    }

    return {
        ...analysis,
        fcfConversion: liveFcfConversion,
        marginStability: liveMarginStability ?? cached.marginStability ?? null,
        insufficientData,
        negativeNiYears: d.negativeNiYears,
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
            altmanZ,
            debtRepaymentTime: debtRepaymentYears,
            debtRepaymentYears,
            fcfYield,
            fcfYieldSource,
            currentEps,
            currentPe,
            psRatio: currentPs,
            evEbit: currentEvEbit,
            forwardPe,
            forwardEps,
            forwardImpliedGrowth,
            fcfMargin: d.fcfMargin,
            fcfConversion: d.fcfConversion,
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
            evSales: finnhubMetrics.evSales,
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
            cashPerShare: finnhubMetrics.cashPerShare,
            freeCashFlowPerShare: finnhubMetrics.freeCashFlowPerShare,
            dividendYield: finnhubMetrics.dividendYield,
            payoutRatio: finnhubMetrics.payoutRatio,
            beta: finnhubMetrics.beta,
            assetTurnover: finnhubMetrics.assetTurnover,
            pegRatio: finnhubMetrics.pegRatio,
            priceFreeCashFlow: finnhubMetrics.priceFreeCashFlow,
            fetchedAt: finnhubMetrics.fetchedAt,
        } : null
    };
}
