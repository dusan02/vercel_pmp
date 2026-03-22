import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';

// Helper: compute metrics for a single symbol
async function computeMetrics(symbol: string) {
    const analysis = await prisma.analysisCache.findUnique({ where: { symbol } });
    if (!analysis) return null;

    const stmts = await prisma.financialStatement.findMany({
        where: { symbol },
        orderBy: { endDate: 'desc' },
        take: 40
    });
    const latestStmt = stmts[0] || null;

    const latestValuation = await prisma.dailyValuationHistory.findFirst({
        where: { symbol },
        orderBy: { date: 'desc' }
    });

    const cached = analysis as any;
    const altmanZ = cached.altmanZ;
    const debtRepaymentYears = cached.debtRepaymentYears;
    const fcfYield = analysis.valuationScore ? (latestValuation?.fcfYield || null) : null;
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
    const cash = latestAnnual?.cashAndEquivalents ?? null;
    const netDebt = (totalDebt !== null && cash !== null) ? totalDebt - cash : null;
    const totalEquity = latestAnnual?.totalEquity ?? null;
    const totalAssets = latestAnnual?.totalAssets ?? null;
    const totalLiabilities = latestAnnual?.totalLiabilities ?? null;
    const currentAssets = latestAnnual?.currentAssets ?? null;
    const currentLiabilities = latestAnnual?.currentLiabilities ?? null;
    const sbc = latestAnnual?.sbc ?? null;
    const sharesOutstanding = latestAnnual?.sharesOutstanding ?? null;
    const ebit = latestAnnual?.ebit ?? null;
    const debtToEquity = (totalDebt !== null && totalEquity !== null && totalEquity !== 0)
        ? totalDebt / totalEquity : null;
    const currentRatio = (currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0)
        ? currentAssets / currentLiabilities : null;
    const assetToLiability = (totalAssets !== null && totalLiabilities !== null && totalLiabilities !== 0)
        ? totalAssets / totalLiabilities : null;
    // Net Debt / EBITDA (using EBIT as proxy)
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
        const primary = await computeMetrics(symbol);
        if (!primary) return NextResponse.json(null);

        // Also fetch sector peers and ticker details (logo, sector, description)
        const tickerRecord = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sector: true, industry: true, description: true, websiteUrl: true, name: true, logoUrl: true, employees: true, lastPrice: true, lastMarketCap: true }
        });

        let peers: string[] = [];
        if (tickerRecord?.sector) {
            const peerTickers = await prisma.ticker.findMany({
                where: { sector: tickerRecord.sector, symbol: { not: symbol } },
                select: { symbol: true },
                take: 4,
                orderBy: { lastPrice: 'desc' },
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

        try {
            await AnalysisService.syncTickerDetails(symbol);
            console.log(`[Analysis API] Ticker details synced for ${symbol}`);
        } catch (e: any) {
            console.error(`[Analysis API] Details sync failed for ${symbol}:`, e.message);
            // Details are not critical, continue
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

        const primary = await computeMetrics(symbol);

        const tickerRecord = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sector: true, industry: true, description: true, websiteUrl: true, name: true, logoUrl: true, employees: true, lastPrice: true, lastMarketCap: true }
        });

        let peers: string[] = [];
        if (tickerRecord?.sector) {
            const peerTickers = await prisma.ticker.findMany({
                where: { sector: tickerRecord.sector, symbol: { not: symbol } },
                select: { symbol: true },
                take: 4,
                orderBy: { lastPrice: 'desc' },
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
