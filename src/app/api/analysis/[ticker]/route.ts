import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';
import { FinnhubService } from '@/services/finnhubService';

// Helper: compute metrics for a single symbol
async function computeMetrics(symbol: string, finnhubData?: any) {
    const [analysis, stmts, latestValuation] = await Promise.all([
        prisma.analysisCache.findUnique({ where: { symbol } }),
        prisma.financialStatement.findMany({
            where: { symbol },
            orderBy: { endDate: 'desc' },
            take: 120 
        }),
        prisma.dailyValuationHistory.findFirst({
            where: { symbol },
            orderBy: { date: 'desc' }
        })
    ]);

    if (!analysis) return null;
    const latestStmt = stmts[0] || null;

    const cached = analysis as any;
    const altmanZ = cached.altmanZ;
    const debtRepaymentYears = cached.debtRepaymentYears;
    const fcfYield = latestValuation?.fcfYield ?? null;
    let currentEps = null;
    let currentPe = latestValuation?.peRatio || null;

    if (latestStmt) {
        if (latestStmt.netIncome !== null && latestStmt.sharesOutstanding !== null && latestStmt.sharesOutstanding > 0) {
            currentEps = latestStmt.netIncome / latestStmt.sharesOutstanding;
        }
    }

    // Balance Sheet from latest annual statement
    const latestAnnual = stmts.find(s => s.fiscalPeriod === 'FY') || latestStmt;
    const totalDebt = latestAnnual?.totalDebt ?? null;
    
    // Primary source: Reported Financials from DB. 
    // Fallback: Finnhub pre-computed metrics if available.
    // If not passed from parent, fetch internally (with cache)
    const fh = finnhubData || await FinnhubService.getAnalysisData(symbol);
    const fhMetrics = fh?.metrics;
    
    let cash = latestAnnual?.cashAndEquivalents ?? null;
    if (cash === null && fhMetrics?.cashPerShare && fh?.profile?.shareOutstanding) {
        cash = fhMetrics.cashPerShare * fh.profile.shareOutstanding;
    }

    const netDebt = (totalDebt !== null && cash !== null) ? totalDebt - cash : null;
    const totalEquity = latestAnnual?.totalEquity ?? null;
    const totalAssets = latestAnnual?.totalAssets ?? null;
    const totalLiabilities = latestAnnual?.totalLiabilities ?? null;
    const currentAssets = latestAnnual?.currentAssets ?? null;
    const currentLiabilities = latestAnnual?.currentLiabilities ?? null;
    const sbc = latestAnnual?.sbc ?? null;
    const sharesOutstanding = latestAnnual?.sharesOutstanding ?? null;
    const ebit = latestAnnual?.ebit ?? null;
    const debtToEquity = fhMetrics?.totalDebtToEquityAnnual 
        ? fhMetrics.totalDebtToEquityAnnual / 100 // Finnhub returns percentage e.g. 35.5
        : (totalDebt !== null && totalEquity !== null && totalEquity !== 0)
            ? totalDebt / totalEquity : null;
            
    const currentRatio = fhMetrics?.currentRatioAnnual
        ?? ((currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0)
            ? currentAssets / currentLiabilities : null);
            
    const assetToLiability = (totalAssets !== null && totalLiabilities !== null && totalLiabilities !== 0)
        ? totalAssets / totalLiabilities : null;
    // Net Debt / EBIT (schema has no depreciation field, so EBITDA cannot be computed)
    const netDebtToEbitda = (netDebt !== null && ebit !== null && ebit !== 0)
        ? netDebt / ebit : null;

    // Calculate Dilution (Share Count change)
    // stmts is already sorted by date desc
    const currentShares = latestStmt?.sharesOutstanding ?? null;
    const stmt1y = stmts.find(s => s.endDate < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
    const stmt5y = stmts.find(s => s.endDate < new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000));
    
    const dilution1y = (currentShares && stmt1y?.sharesOutstanding) 
        ? (currentShares / stmt1y.sharesOutstanding - 1) * 100 : null;
    const dilution5y = (currentShares && stmt5y?.sharesOutstanding)
        ? (currentShares / stmt5y.sharesOutstanding - 1) * 100 : null;

    const netIncome = latestStmt?.netIncome ?? 0;
    const sbcRatio = (sbc !== null && netIncome > 0) ? (sbc / netIncome) * 100 : null;

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
            // Prefer Finnhub pre-computed ratios if available (more accurate)
            debtToEquity,
            currentRatio,
            assetToLiability,
            netDebtToEbitda,
            sbc,
            sbcRatio,
            sharesOutstanding,
            dilution1y,
            dilution5y
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
        // Fetch Finnhub metrics first so computeMetrics can use them without re-fetching
        const finnhubData = await FinnhubService.getAnalysisData(symbol);
        
        // Parallelize primary analysis and ticker details
        const [primary, tickerRecord] = await Promise.all([
            computeMetrics(symbol, finnhubData),
            prisma.ticker.findUnique({
                where: { symbol },
                select: { sector: true, industry: true, description: true, websiteUrl: true, name: true, logoUrl: true, employees: true, lastPrice: true, lastMarketCap: true, headquarters: true }
            })
        ]);

        if (!primary) return NextResponse.json(null);

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
            const [secondary, secondaryFinnhub] = await Promise.all([
                computeMetrics(compareSymbol),
                FinnhubService.getAnalysisData(compareSymbol),
            ]);
            return NextResponse.json({
                primary: { ...primary, ticker: tickerRecord, finnhub: finnhubData },
                secondary: secondary ? { ...secondary, finnhub: secondaryFinnhub } : null,
                peers
            });
        }

        // Background revalidation: if cache is stale (> 7 days), trigger async refresh
        const cacheAge = await prisma.analysisCache.findUnique({
            where: { symbol },
            select: { updatedAt: true },
        });
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (cacheAge && cacheAge.updatedAt < sevenDaysAgo) {
            fetch(`${new URL(request.url).origin}/api/analysis/${symbol}`, { method: 'POST' })
                .catch(() => {/* silent — background job */});
        }

        return NextResponse.json({ ...primary, ticker: tickerRecord, peers, finnhub: finnhubData });
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

        // Fetch fresh Finnhub metrics (forceRefresh after manual POST)
        const finnhubData = await FinnhubService.getAnalysisData(symbol);
        
        const [primary, tickerRecord] = await Promise.all([
            computeMetrics(symbol, finnhubData),
            prisma.ticker.findUnique({
                where: { symbol },
                select: { sector: true, industry: true, description: true, websiteUrl: true, name: true, logoUrl: true, employees: true, lastPrice: true, lastMarketCap: true, headquarters: true }
            })
        ]);

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
        return NextResponse.json({ ...primary, ticker: tickerRecord, peers, finnhub: finnhubData });
    } catch (error: any) {
        console.error(`Error generating analysis for ${symbol}:`, error);
        return NextResponse.json({
            error: 'Failed to run deep analysis',
            details: error.message
        }, { status: 500 });
    }
}
