import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';
import { FinnhubService } from '@/services/finnhubService';
import { computeTTM } from '@/lib/utils/ttm';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { applySplitAdjustments, applyPostSplitAdjustment } from '@/lib/utils/splitAdjustment';

// In-memory dedup: prevents multiple concurrent background revalidations for the same symbol
const revalidating = new Set<string>();

const ANALYSIS_CACHE_TTL = 300; // 5 minutes

// Shared ticker select — includes all fields needed by computeMetrics + GET/POST handlers
const TICKER_SELECT = {
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
async function fetchPeers(symbol: string, sector: string | null): Promise<string[]> {
    if (!sector) return [];
    const peerTickers = await prisma.ticker.findMany({
        where: { sector, symbol: { not: symbol } },
        select: { symbol: true },
        take: 4,
        orderBy: { lastMarketCap: 'desc' },
    });
    return peerTickers.map(t => t.symbol);
}

// Helper: compute metrics for a single symbol
// tickerRecord: pre-fetched Ticker row (avoids duplicate DB queries from GET/POST)
async function computeMetrics(symbol: string, tickerRecord?: any) {
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
    if (stmts.length > 0) {
        const tickerInfo = tickerRecord ?? await prisma.ticker.findUnique({
            where: { symbol },
            select: { sharesOutstanding: true },
        });
        if (tickerInfo?.sharesOutstanding) {
            applyPostSplitAdjustment(stmts, tickerInfo.sharesOutstanding);
        }
    }

    const latestValuation = await prisma.dailyValuationHistory.findFirst({
        where: { symbol },
        orderBy: { date: 'desc' }
    });

    // Fetch Finnhub pre-computed metrics (primary source for ratios)
    const finnhubMetrics = await prisma.finnhubMetrics.findUnique({ where: { symbol } });

    const cached = analysis as any;
    const altmanZ = cached.altmanZ;
    const debtRepaymentYears = cached.debtRepaymentYears;
    // FCF Yield: prefer valuation history, fallback to Finnhub P/FCF (inverse)
    const fcfYield = latestValuation?.fcfYield
        ?? (finnhubMetrics?.priceFreeCashFlow != null && finnhubMetrics.priceFreeCashFlow > 0
            ? 1 / finnhubMetrics.priceFreeCashFlow
            : null);

    // Snapshot variables MUST come from latestStmt (most recent quarter or annual)
    const totalDebt = latestStmt?.totalDebt ?? null;
    const cash = latestStmt?.cashAndEquivalents ?? null;
    const netDebt = (totalDebt !== null && cash !== null) ? totalDebt - cash : null;
    const totalEquity = latestStmt?.totalEquity ?? null;
    const totalAssets = latestStmt?.totalAssets ?? null;
    const totalLiabilities = latestStmt?.totalLiabilities ?? null;
    const currentAssets = latestStmt?.currentAssets ?? null;
    const currentLiabilities = latestStmt?.currentLiabilities ?? null;
    const sharesOutstanding = latestStmt?.sharesOutstanding ?? null;
    const sbcSnapshot = latestStmt?.sbc ?? null;

    // TTM via shared utility (latestQ + FY - sameQ_prevYear)
    const ttm = computeTTM(stmts);
    const ttmNetIncome = ttm.netIncome;
    const ttmRevenue = ttm.revenue;
    const ttmEbit = ttm.ebit;
    const ttmGrossProfit = ttm.grossProfit;
    const ttmSbc = ttm.sbc;

    // P/E: prefer Finnhub pre-computed, fallback to our TTM calculation
    const effectivePrice = tickerRecord?.lastPrice || latestValuation?.closePrice || 0;
    const effectiveNI = ttmNetIncome ?? latestStmt?.netIncome ?? null;
    let currentPe: number | null = finnhubMetrics?.peRatio ?? null;
    if (currentPe === null && effectivePrice > 0 && sharesOutstanding && sharesOutstanding > 0 && effectiveNI && effectiveNI > 0) {
        currentPe = (effectivePrice * sharesOutstanding) / effectiveNI;
    }
    if (currentPe === null) {
        currentPe = latestValuation?.peRatio || null;
    }

    // EPS: prefer Finnhub, fallback to our calculation
    let currentEps = finnhubMetrics?.netIncomePerShare ?? null;
    if (currentEps === null && ttmNetIncome !== null && sharesOutstanding !== null && sharesOutstanding > 0) {
        currentEps = ttmNetIncome / sharesOutstanding;
    }

    // Forward P/E & implied forward EPS (market-implied next-year earnings)
    const forwardPe = finnhubMetrics?.forwardPe ?? null;
    const forwardEps = (forwardPe !== null && forwardPe > 0 && effectivePrice > 0)
        ? effectivePrice / forwardPe
        : null;

    // Prefer Finnhub pre-computed ratios, fallback to our calculations
    const debtToEquity = finnhubMetrics?.debtEquityRatio ?? ((totalDebt !== null && totalEquity !== null && totalEquity !== 0)
        ? totalDebt / totalEquity : null);
    const currentRatio = finnhubMetrics?.currentRatio ?? ((currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0)
        ? currentAssets / currentLiabilities : null);
    const assetToLiability = (totalAssets !== null && totalLiabilities !== null && totalLiabilities !== 0)
        ? totalAssets / totalLiabilities : null;
    const netDebtToEbit = (netDebt !== null && ttmEbit !== null && ttmEbit !== 0)
        ? netDebt / ttmEbit : null;
    const sbcToRevenue = (ttmSbc !== null && ttmRevenue !== null && ttmRevenue > 0)
        ? ttmSbc / ttmRevenue : null;
    const sbcRatio = (ttmSbc !== null && ttmNetIncome !== null && ttmNetIncome > 0)
        ? (ttmSbc / ttmNetIncome) * 100 : null;
    const interestCoverage = finnhubMetrics?.interestCoverage ?? null;

    // Calculate Dilution (Share Count change)
    // Compare same fiscal period one year (or 5 years) earlier — not just any
    // statement older than N days. This matches ShareDilutionChart logic.
    const currentShares = latestStmt?.sharesOutstanding ?? null;
    const currentFP = latestStmt?.fiscalPeriod ?? null;
    const currentFY = latestStmt?.fiscalYear ?? null;

    const stmt1y = (currentFP && currentFY != null)
        ? stmts.find(s => s.fiscalPeriod === currentFP && s.fiscalYear === currentFY - 1)
        : stmts.find(s => s.endDate < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
    const stmt5y = (currentFP && currentFY != null)
        ? stmts.find(s => s.fiscalPeriod === currentFP && s.fiscalYear === currentFY - 5)
        : stmts.find(s => s.endDate < new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000));

    const dilution1y = (currentShares && stmt1y?.sharesOutstanding)
        ? (currentShares / stmt1y.sharesOutstanding - 1) * 100 : null;
    const dilution5y = (currentShares && stmt5y?.sharesOutstanding)
        ? (currentShares / stmt5y.sharesOutstanding - 1) * 100 : null;

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
            grossProfit: ttmGrossProfit
        },
        metrics: {
            zScore: altmanZ,
            altmanZ,
            debtRepaymentTime: debtRepaymentYears,
            debtRepaymentYears,
            fcfYield,
            currentEps,
            currentPe,
            forwardPe,
            forwardEps,
            fcfMargin: cached.fcfMargin,
            fcfConversion: cached.fcfConversion
        },
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
        } : null
    };
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();
    const { searchParams } = new URL(request.url);
    const compareSymbol = searchParams.get('compare')?.toUpperCase() || null;

    try {
        // 1. Check Redis cache first (skip for compare requests — they need fresh data)
        if (!compareSymbol) {
            try {
                const cached = await getCachedData(`analysis:cache:${symbol}`);
                if (cached) {
                    return NextResponse.json(cached);
                }
            } catch {}
        }

        // 2. Fetch ticker record once (shared select for computeMetrics + response)
        const tickerRecord = await prisma.ticker.findUnique({
            where: { symbol },
            select: TICKER_SELECT,
        });

        // 3. Compute metrics (pass tickerRecord to avoid duplicate DB query)
        const primary = await computeMetrics(symbol, tickerRecord);
        if (!primary) return NextResponse.json(null);

        // 4. Fetch peers
        const peers = await fetchPeers(symbol, tickerRecord?.sector ?? null);

        // 5. If compare requested, fetch secondary analysis
        if (compareSymbol) {
            const secondary = await computeMetrics(compareSymbol);
            return NextResponse.json({
                primary: { ...primary, ticker: tickerRecord },
                secondary,
                peers
            });
        }

        // 6. Background revalidation: if cache is stale (> 7 days), trigger async refresh
        const analysisUpdatedAt = (primary as any)?.updatedAt;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (analysisUpdatedAt && new Date(analysisUpdatedAt) < sevenDaysAgo && !revalidating.has(symbol)) {
            revalidating.add(symbol);
            fetch(`${new URL(request.url).origin}/api/analysis/${symbol}`, { method: 'POST' })
                .catch(() => {/* silent — background job */})
                .finally(() => revalidating.delete(symbol));
        }

        // 7. Build response and cache it
        const response = { ...primary, ticker: tickerRecord, peers };
        try {
            await setCachedData(`analysis:cache:${symbol}`, response, ANALYSIS_CACHE_TTL);
        } catch {}

        return NextResponse.json(response);
    } catch (error) {
        console.error(`Error fetching analysis for ${symbol}:`, error);
        return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();

    try {
        console.log(`[Analysis API] Starting deep analysis for ${symbol}...`);

        try {
            await AnalysisService.syncFinancials(symbol);
            console.log(`[Analysis API] Financials synced for ${symbol}`);
        } catch (e: any) {
            console.error(`[Analysis API] Financials sync failed for ${symbol}:`, e.message);
            throw e;
        }

        // Sync Finnhub pre-computed metrics (P/E, P/B, ROE, margins, etc.)
        try {
            await FinnhubService.getMetrics(symbol, true);
            console.log(`[Analysis API] Finnhub metrics synced for ${symbol}`);
        } catch (e: any) {
            console.error(`[Analysis API] Finnhub metrics sync failed for ${symbol}:`, e.message);
        }

        // Skip syncTickerDetails if data was refreshed within 30 days and key fields are populated
        const existingTicker = await prisma.ticker.findUnique({
            where: { symbol },
            select: { updatedAt: true, description: true, employees: true, headquarters: true }
        });
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const isStale = !existingTicker || existingTicker.updatedAt < thirtyDaysAgo;
        const isMissingData = !existingTicker?.description || !existingTicker?.employees || !existingTicker?.headquarters;

        if (isStale || isMissingData) {
            try {
                await AnalysisService.syncTickerDetails(symbol);
                console.log(`[Analysis API] Ticker details synced for ${symbol}`);
            } catch (e: any) {
                console.error(`[Analysis API] Details sync failed for ${symbol}:`, e.message);
            }
        } else {
            console.log(`[Analysis API] Ticker details fresh (< 30d), skipping sync for ${symbol}`);
        }

        try {
            await AnalysisService.syncValuationHistory(symbol);
            console.log(`[Analysis API] Valuation history synced for ${symbol}`);
        } catch (e: any) {
            console.error(`[Analysis API] Valuation history sync failed for ${symbol}:`, e.message);
            throw e;
        }

        try {
            await AnalysisService.calculateScores(symbol);
            console.log(`[Analysis API] Scores calculated for ${symbol}`);
        } catch (e: any) {
            console.error(`[Analysis API] Score calculation failed for ${symbol}:`, e.message);
            throw e;
        }

        // Fetch ticker once with shared select, pass to computeMetrics
        const tickerRecord = await prisma.ticker.findUnique({
            where: { symbol },
            select: TICKER_SELECT,
        });
        const primary = await computeMetrics(symbol, tickerRecord);
        const peers = await fetchPeers(symbol, tickerRecord?.sector ?? null);

        // Invalidate Redis caches so next GET fetches fresh data
        try {
            const { del } = await import('@/lib/redis/operations');
            await del([`analysis:cache:${symbol}`, `analysis:history:${symbol}`]);
        } catch {}

        console.log(`[Analysis API] Deep analysis complete for ${symbol}`);
        return NextResponse.json({ ...primary, ticker: tickerRecord, peers });
    } catch (error: any) {
        console.error(`Error generating analysis for ${symbol}:`, error);
        return NextResponse.json({
            error: 'Failed to run deep analysis',
            details: error.message
        }, { status: 500 });
    }
}
