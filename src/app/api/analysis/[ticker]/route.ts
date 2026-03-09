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
        take: 1
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

    return {
        ...analysis,
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

        const analysis = await prisma.analysisCache.findUnique({
            where: { symbol },
        });

        console.log(`[Analysis API] Deep analysis complete for ${symbol}`);
        return NextResponse.json(analysis);
    } catch (error: any) {
        console.error(`Error generating analysis for ${symbol}:`, error);
        return NextResponse.json({
            error: 'Failed to run deep analysis',
            details: error.message
        }, { status: 500 });
    }
}
