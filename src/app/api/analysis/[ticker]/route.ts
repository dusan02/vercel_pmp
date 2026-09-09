import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';
import { FinnhubService } from '@/services/finnhubService';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { computeMetrics, fetchPeers, TICKER_SELECT } from '@/services/analysisCompute';

// In-memory dedup: prevents multiple concurrent background revalidations for the same symbol
const revalidating = new Set<string>();

const ANALYSIS_CACHE_TTL = 300; // 5 minutes

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
            // Timeout guard: a hung self-POST must not permanently occupy the
            // revalidating slot (it would block revalidation for this symbol).
            const abort = new AbortController();
            const timeout = setTimeout(() => abort.abort(), 120_000);
            fetch(`${new URL(request.url).origin}/api/analysis/${symbol}`, { method: 'POST', signal: abort.signal })
                .catch(() => {/* silent — background job */})
                .finally(() => {
                    clearTimeout(timeout);
                    revalidating.delete(symbol);
                });
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
        // Log full details server-side; return a sanitized message — raw
        // exception text can leak DB/Redis internals to the client.
        console.error(`Error generating analysis for ${symbol}:`, error);
        return NextResponse.json({
            error: 'Failed to run deep analysis',
            details: 'Deep analysis failed — check server logs for details.'
        }, { status: 500 });
    }
}
