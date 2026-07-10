import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';

// In-memory dedup: prevents multiple concurrent background revalidations for the same symbol
const revalidating = new Set<string>();

// Helper: compute metrics for a single symbol
async function computeMetrics(symbol: string) {
    const analysis = await prisma.analysisCache.findUnique({ where: { symbol } });
    if (!analysis) return null;

    const stmts = await prisma.financialStatement.findMany({
        where: { symbol },
        orderBy: { endDate: 'desc' },
        take: 120 // 10Y annual (10) + 10Y quarterly (40) + buffer = enough for full history charts
    });
    const latestStmt = stmts[0] || null;

    const latestValuation = await prisma.dailyValuationHistory.findFirst({
        where: { symbol },
        orderBy: { date: 'desc' }
    });

    const cached = analysis as any;
    const altmanZ = cached.altmanZ;
    const debtRepaymentYears = cached.debtRepaymentYears;
    const fcfYield = latestValuation?.fcfYield ?? null;
    let currentPe = latestValuation?.peRatio || null;

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

    // TTM Flow Variables
    const quarterlyStmts = stmts.filter(s => s.fiscalPeriod !== 'FY');
    const ttmStmts = quarterlyStmts.slice(0, 4);
    const has4Q = ttmStmts.length >= 4;

    const latestAnnual = stmts.find(s => s.fiscalPeriod === 'FY') || latestStmt;

    // Helper for TTM calculation
    const getTtmOrAnnual = (field: 'netIncome' | 'revenue' | 'ebit' | 'grossProfit' | 'sbc' | 'operatingCashFlow' | 'capex') => {
        if (has4Q) {
            let sum = 0;
            let valid = false;
            for (const s of ttmStmts) {
                const val = s[field as keyof typeof s];
                if (val != null) {
                    sum += val as number;
                    valid = true;
                }
            }
            return valid ? sum : null;
        }
        return (latestAnnual as any)?.[field] as number | null ?? null;
    };

    const ttmNetIncome = getTtmOrAnnual('netIncome');
    const ttmRevenue = getTtmOrAnnual('revenue');
    const ttmEbit = getTtmOrAnnual('ebit');
    const ttmGrossProfit = getTtmOrAnnual('grossProfit');
    const ttmSbc = getTtmOrAnnual('sbc');

    let currentEps = null;
    if (ttmNetIncome !== null && sharesOutstanding !== null && sharesOutstanding > 0) {
        currentEps = ttmNetIncome / sharesOutstanding;
    }

    const debtToEquity = (totalDebt !== null && totalEquity !== null && totalEquity !== 0)
        ? totalDebt / totalEquity : null;
    const currentRatio = (currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0)
        ? currentAssets / currentLiabilities : null;
    const assetToLiability = (totalAssets !== null && totalLiabilities !== null && totalLiabilities !== 0)
        ? totalAssets / totalLiabilities : null;
    const netDebtToEbit = (netDebt !== null && ttmEbit !== null && ttmEbit !== 0)
        ? netDebt / ttmEbit : null;
    const sbcToRevenue = (ttmSbc !== null && ttmRevenue !== null && ttmRevenue > 0)
        ? ttmSbc / ttmRevenue : null;
    const sbcRatio = (ttmSbc !== null && ttmNetIncome !== null && ttmNetIncome > 0)
        ? (ttmSbc / ttmNetIncome) * 100 : null;

    // Calculate Dilution (Share Count change)
    // stmts is already sorted by date desc
    const currentShares = latestStmt?.sharesOutstanding ?? null;
    const stmt1y = stmts.find(s => s.endDate < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
    const stmt5y = stmts.find(s => s.endDate < new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000));
    
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
            fcfMargin: cached.fcfMargin,
            fcfConversion: cached.fcfConversion
        }
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
        const primary = await computeMetrics(symbol);
        if (!primary) return NextResponse.json(null);

        // Also fetch sector peers and ticker details (logo, sector, description)
        const tickerRecord = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sector: true, industry: true, description: true, websiteUrl: true, name: true, logoUrl: true, employees: true, lastPrice: true, lastMarketCap: true, lastChangePct: true, lastMarketCapDiff: true, headquarters: true, lastPriceUpdated: true, latestPrevClose: true }
        });

        let peers: string[] = [];
        if (tickerRecord?.sector) {
            const peerTickers = await prisma.ticker.findMany({
                where: { sector: tickerRecord.sector, symbol: { not: symbol } },
                select: { symbol: true },
                take: 4,
                orderBy: { lastMarketCap: 'desc' },
            });
            peers = peerTickers.map((t: { symbol: string }) => t.symbol);
        }

        // If compare requested, fetch secondary analysis
        if (compareSymbol) {
            const secondary = await computeMetrics(compareSymbol);
            return NextResponse.json({
                primary: { ...primary, ticker: tickerRecord },
                secondary,
                peers
            });
        }

        // Background revalidation: if cache is stale (> 7 days), trigger async refresh
        // without blocking the response — next load will see fresh data
        const cacheAge = await prisma.analysisCache.findUnique({
            where: { symbol },
            select: { updatedAt: true },
        });
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (cacheAge && cacheAge.updatedAt < sevenDaysAgo && !revalidating.has(symbol)) {
            revalidating.add(symbol);
            // Fire-and-forget background refresh (non-blocking)
            fetch(`${new URL(request.url).origin}/api/analysis/${symbol}`, { method: 'POST' })
                .catch(() => {/* silent — background job */})
                .finally(() => revalidating.delete(symbol));
        }

        return NextResponse.json({ ...primary, ticker: tickerRecord, peers });
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

        // Skip syncTickerDetails if data was refreshed within 30 days and key fields are populated
        // (description, employees, HQ change rarely — no need to re-fetch on every Refresh Analysis)
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
                // Details are not critical, continue
            }
        } else {
            console.log(`[Analysis API] Ticker details fresh (< 30d), skipping sync for ${symbol}`);
        }

        // Always sync valuation history on manual POST to ensure new EPS from Finnhub recalculates P/E ratios correctly
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

        const primary = await computeMetrics(symbol);

        const tickerRecord = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sector: true, industry: true, description: true, websiteUrl: true, name: true, logoUrl: true, employees: true, lastPrice: true, lastMarketCap: true, lastChangePct: true, lastMarketCapDiff: true, headquarters: true, lastPriceUpdated: true, latestPrevClose: true }
        });

        let peers: string[] = [];
        if (tickerRecord?.sector) {
            const peerTickers = await prisma.ticker.findMany({
                where: { sector: tickerRecord.sector, symbol: { not: symbol } },
                select: { symbol: true },
                take: 4,
                orderBy: { lastMarketCap: 'desc' },
            });
            peers = peerTickers.map(t => t.symbol);
        }

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
