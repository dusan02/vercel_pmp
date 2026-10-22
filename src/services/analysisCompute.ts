import { prisma } from '@/lib/db/prisma';
import { computeTTM, isAnnualPeriod } from '@/lib/utils/ttm';
import { summarizeLossYears } from '@/lib/utils/analysisMath';
import { applySplitAdjustments, applyPostSplitAdjustment } from '@/lib/utils/splitAdjustment';
import { isSuspiciousShareCount } from '@/lib/utils/shareCount';
import { dedupeShareClasses } from '@/lib/companyNames';
import { buildValuationHistory } from '@/services/analysis/valuationHistory';
import { computePillars, deriveMoatInputs } from '@/services/analysis/pillars';
import { isPeDistorted } from '@/lib/analysis/peDistortion';

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

    // Balance-sheet positions come from the newest statement that actually
    // reports them — Finnhub often delivers fresh quarterly rows with income
    // fields only (DELL Q1/Q2-FY27 have EBIT+NI but a null balance sheet), and
    // reading stmts[0] blindly would null out debt/cash/equity → pillar legs
    // showed n/a and netDebt coerced to 0 → fake "debt-free" takeaways.
    const bsStmt = stmts.find(s =>
        s.totalAssets != null || s.totalDebt != null || s.totalEquity != null ||
        s.cashAndEquivalents != null || s.totalLiabilities != null) ?? latestStmt;
    const totalDebt = bsStmt?.totalDebt ?? null;
    const cash = bsStmt?.cashAndEquivalents ?? null;
    const netDebt = (totalDebt !== null && cash !== null) ? totalDebt - cash : null;
    const totalEquity = bsStmt?.totalEquity ?? null;
    const totalAssets = bsStmt?.totalAssets ?? null;
    const totalLiabilities = bsStmt?.totalLiabilities ?? null;
    const currentAssets = bsStmt?.currentAssets ?? null;
    const currentLiabilities = bsStmt?.currentLiabilities ?? null;
    // Corrupted-shares guard: when a statement's count carries the
    // netIncome/integer signature (bad EPS fallback) and deviates >30% from
    // the trusted Ticker count, substitute the trusted count for the LATEST
    // statement (it IS the current count). Historical rows can't be repaired
    // this way — their endpoints are nulled below rather than showing garbage.
    const rawShares = latestStmt?.sharesOutstanding ?? null;
    const sharesOutstanding = isSuspiciousShareCount(rawShares, latestStmt?.netIncome ?? null, trustedShares)
        ? trustedShares
        : rawShares;
    const sbcSnapshot = stmts.find(s => s.sbc != null)?.sbc ?? null;
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
    //
    // Share basis: current multiples MUST use the trusted ticker-level count
    // (same basis as lastMarketCap) — mixing the latest statement's count
    // with ticker market cap made P/E, EPS and P/S silently diverge
    // (PSX: 403.27M stmt shares vs 399.02M ticker → two implied mcaps).
    const currentShareCount = trustedShares ?? sharesOutstanding;
    const effectivePrice = tickerRecord?.lastPrice || latestValuation?.closePrice || 0;
    // Sub-TTM fallback is annual-only: a quarterly row's cumulative-YTD NI
    // is not 12 months — a lone quarter priced GOOG at P/E ≈ 107 (Oct'21).
    const effectiveNI = ttmNetIncome
        ?? stmts.find(s => isAnnualPeriod(s.fiscalPeriod) && s.netIncome != null)?.netIncome
        ?? null;
    let currentPe: number | null = null;
    if (effectivePrice > 0 && currentShareCount && currentShareCount > 0 && effectiveNI && effectiveNI > 0) {
        currentPe = (effectivePrice * currentShareCount) / effectiveNI;
    }
    if (currentPe === null) {
        currentPe = latestValuation?.peRatio || null;
    }

    // EPS: same NI basis as P/E — mixing Finnhub EPS with our P/E would break
    // the price/EPS reconciliation the UI asserts.
    const currentEps = (effectiveNI !== null && effectiveNI > 0 && currentShareCount !== null && currentShareCount > 0)
        ? effectiveNI / currentShareCount
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
        : (effectivePrice > 0 && currentShareCount && currentShareCount > 0 ? effectivePrice * currentShareCount : null);
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
    // daily snapshot, then Finnhub P/FCF inverse — track the source so the UI
    // tooltip cannot claim a TTM basis for a Finnhub-derived value.
    const fcfYieldSource: 'ttm' | 'history' | 'finnhub' | null =
        currentFcfYield !== null ? 'ttm'
        : latestValuation?.fcfYield != null ? 'history'
        : (finnhubMetrics?.priceFreeCashFlow != null && finnhubMetrics.priceFreeCashFlow > 0) ? 'finnhub'
        : null;
    const fcfYield = currentFcfYield
        ?? latestValuation?.fcfYield
        ?? (fcfYieldSource === 'finnhub' ? 1 / finnhubMetrics!.priceFreeCashFlow! : null);

    // Historical percentile stats vs own 10Y daily history (our TTM basis).
    // Rank the last stored DVH snapshot (close basis) — the same "current"
    // the /valuation page derives from its last row — so both pages print
    // one percentile for the same ticker+date+series (contract: a 2-cent
    // live/close price drift must not move the percentile between pages).
    const valuationHistoryStats = valuationRows.length > 0
        ? buildValuationHistory(valuationRows, {
            pe: latestValuation?.peRatio ?? currentPe,
            ps: latestValuation?.psRatio ?? currentPs ?? null,
            evEbit: latestValuation?.evEbitda ?? currentEvEbit ?? null,
            fcfYield: latestValuation?.fcfYield ?? currentFcfYield ?? null,
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
    // When GAAP TTM Net Income exceeds TTM Operating Income (EBIT) by >5%, a
    // non-operating windfall (e.g. GOOGL +$135.7B unrealized investment gain,
    // AMZN Rivian/Anthropic gains) is inflating GAAP currentEps, whereas
    // analyst consensus forwardPe models recurring operating earnings. Strip
    // the non-operating excess above EBIT so forwardImpliedGrowth doesn't
    // invert into a fake negative growth rate (-20.6%).
    const recurringEpsForFwd = (ttmEbit !== null && ttmEbit > 0 && effectiveNI !== null && effectiveNI > ttmEbit * 1.05 && currentShareCount !== null && currentShareCount > 0)
        ? ttmEbit / currentShareCount
        : currentEps;
    // Forward implied 1Y growth = (forwardEps / recurringEpsForFwd - 1) × 100
    const forwardImpliedGrowth = (forwardEps !== null && forwardEps > 0 && recurringEpsForFwd !== null && recurringEpsForFwd > 0)
        ? parseFloat(((forwardEps / recurringEpsForFwd - 1) * 100).toFixed(2))
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
    // Own-first (EBIT / |interest| from the latest row reporting both),
    // Finnhub fallback — same convention the pillar radar uses, so Key
    // Metrics and radar can't diverge.
    const interestStmt = stmts.find(s => s.ebit != null && s.interestExpense != null && s.interestExpense !== 0);
    const interestCoverage = interestStmt
        ? interestStmt.ebit! / Math.abs(interestStmt.interestExpense!)
        : (finnhubMetrics?.interestCoverage ?? null);

    // Calculate Dilution (Share Count change)
    // Compare same fiscal period one year (or 5 years) earlier — not just any
    // statement older than N days. This matches ShareDilutionChart logic.
    const currentShares = currentShareCount; // trusted ticker count — current real basis, not the stale statement's
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
    const annualStmts = stmts.filter(s => isAnnualPeriod(s.fiscalPeriod));
    const moatDerived = deriveMoatInputs(annualStmts);
    const latestAnnual = annualStmts[0] ?? null;
    const stmt5yAgoAnnual = (latestAnnual?.fiscalYear != null
        ? annualStmts.find(s => s.fiscalYear === latestAnnual.fiscalYear - 4)
        : null) ?? annualStmts[4] ?? annualStmts[annualStmts.length - 1] ?? null;
    const fyDiff = (latestAnnual?.fiscalYear != null && stmt5yAgoAnnual?.fiscalYear != null)
        ? latestAnnual.fiscalYear - stmt5yAgoAnnual.fiscalYear
        : 0;
    const yearsBack = fyDiff > 0 ? fyDiff : (annualStmts.length >= 5 ? 4 : (annualStmts.length - 1));
    let epsCagr5y: number | null = null;
    const epsNowShares = saneShares(latestAnnual);
    if (latestAnnual && epsNowShares && epsNowShares > 0 && latestAnnual.netIncome && latestAnnual.netIncome > 0) {
        const candidates = annualStmts.filter(s =>
            s !== latestAnnual
            && (s.netIncome ?? 0) > 0
            && (saneShares(s) ?? 0) > 0
            && (latestAnnual.fiscalYear != null && s.fiscalYear != null ? latestAnnual.fiscalYear - s.fiscalYear >= 2 : true)
        );
        const epsBaseAnnual = (saneShares(stmt5yAgoAnnual) && (stmt5yAgoAnnual?.netIncome ?? 0) > 0)
            ? stmt5yAgoAnnual
            : candidates.sort((a, b) =>
                Math.abs((latestAnnual.fiscalYear! - a.fiscalYear!) - 4) - Math.abs((latestAnnual.fiscalYear! - b.fiscalYear!) - 4)
            )[0] ?? null;
        const epsYearsBack = (latestAnnual.fiscalYear != null && epsBaseAnnual?.fiscalYear != null && latestAnnual.fiscalYear > epsBaseAnnual.fiscalYear)
            ? latestAnnual.fiscalYear - epsBaseAnnual.fiscalYear
            : yearsBack;
        const epsThenShares = saneShares(epsBaseAnnual);
        if (epsBaseAnnual && epsYearsBack > 0 && epsBaseAnnual.netIncome && epsBaseAnnual.netIncome > 0 && epsThenShares && epsThenShares > 0) {
            const epsNow = latestAnnual.netIncome / epsNowShares;
            const epsThen = epsBaseAnnual.netIncome / epsThenShares;
            if (epsNow > 0 && epsThen > 0) {
                epsCagr5y = (Math.pow(epsNow / epsThen, 1 / epsYearsBack) - 1) * 100;
            }
        }
    }

    // Live marginStability & fcfConversion (same FY-first rule & ±200% clamp as scoreCalculator)
    const clampMargin = (m: number) => Math.max(-2, Math.min(2, m));
    const fyMargins = annualStmts
        .slice(0, 5)
        .filter(s => s.revenue && s.revenue > 0 && s.ebit !== null)
        .map(s => clampMargin(s.ebit! / s.revenue!));
    const marginSeries = fyMargins.length >= 3
        ? fyMargins
        : stmts
            .filter(s => s.revenue && s.revenue > 0 && s.ebit !== null)
            .map(s => clampMargin(s.ebit! / s.revenue!));
    let liveMarginStability: number | null = null;
    if (marginSeries.length > 2) {
        const mean = marginSeries.reduce((a, b) => a + b, 0) / marginSeries.length;
        const variance = marginSeries.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / marginSeries.length;
        liveMarginStability = Math.sqrt(variance);
    }
    const fcfDenomNi = ttmNetIncome
        ?? stmts.find(s => isAnnualPeriod(s.fiscalPeriod) && s.netIncome != null)?.netIncome
        ?? null;
    const liveFcfConversion = (ttmFcf !== null && fcfDenomNi !== null && fcfDenomNi > 0)
        ? ttmFcf / fcfDenomNi
        : (cached.fcfConversion ?? null);

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
    const pillarNetCash = netDebt !== null ? netDebt <= 0 : null;
    const pillarNetDebtRatio = (pillarNetCash === false && netDebt !== null && totalAssets !== null && totalAssets > 0)
        ? netDebt / totalAssets
        : null;

    // 0 statements with fundamentals ≠ weak fundamentals — ADR/foreign
    // names Finnhub doesn't cover (TSM, NVO, BABA) must render as
    // "insufficient data", never as a low-quality company.
    const insufficientData = !stmts.some(s => s.revenue != null || s.netIncome != null);

    const peDistortedNow = isPeDistorted(
        valuationHistoryStats?.pe.current ?? null,
        valuationHistoryStats?.pe.median ?? null,
    );
    const pillarsInput = {
        pePercentile: peDistortedNow ? null : (valuationHistoryStats?.pe.percentile ?? null),
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
        fcfConversion: liveFcfConversion,
        marginStability: liveMarginStability ?? cached.marginStability ?? null,
        // Moat: durability stats over the FY series (not TTM/current values).
        moatRoicDurability: moatDerived.roicDurability,
        moatGmMedian: moatDerived.gmMedian,
        moatFcfDurability: moatDerived.fcfDurability,
        moatMarginFloor: moatDerived.marginFloor,
    };
    if (process.env.DEBUG_PILLARS) console.log(`[pillars-input:${symbol}]`, JSON.stringify(pillarsInput));
    const pillars = computePillars(pillarsInput);

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
        negativeNiYears: summarizeLossYears(stmts).lossYears,
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
