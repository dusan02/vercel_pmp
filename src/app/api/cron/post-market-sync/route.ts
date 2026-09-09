import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth, verifyCronAuthOptional, withCronLock } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { updateCronStatus } from '@/lib/utils/cronStatus';
import { processBatch } from '@/lib/utils/batchProcessing';
import { updateTickerSharesOutstanding } from '@/lib/utils/tickerUpdates';
import { getAllTrackedTickers } from '@/lib/utils/universeHelpers';
import { AnalysisService } from '@/services/analysisService';

const BATCH_SIZE = 50;
const CONCURRENCY_LIMIT = 10;

/**
 * Post-Market Data Sync
 *
 * Runs after market close to:
 * 1. Update shares outstanding for all tracked tickers
 * 2. Recompute analysis (syncAndAnalyze) for all tracked tickers
 *
 * This is a heavy job that may take several minutes.
 * Should be called with a generous timeout.
 */
export async function POST(request: NextRequest) {
    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        // Distributed lock: prevent overlapping runs (heavy job, several minutes)
        return await withCronLock('post-market-sync', 2 * 60 * 60, async () => runPostMarketSync(Date.now()));
    } catch (error) {
        return handleCronError(error, 'post-market-sync cron job');
    }
}

async function runPostMarketSync(startTime: number): Promise<NextResponse> {
    console.log('🔄 Starting post-market data sync...');

    // 1. UPDATE SHARES OUTSTANDING
    console.log('\n📝 Step 1: Updating sharesOutstanding...');
    const allTickers = await getAllTrackedTickers();
    const sharesResults = await processBatch(
        allTickers,
        updateTickerSharesOutstanding,
        BATCH_SIZE,
        CONCURRENCY_LIMIT
    );
    console.log(`✅ SharesOutstanding: ${sharesResults.success} updated, ${sharesResults.failed} failed`);

    // 2. RECOMPUTE ANALYSIS FOR ALL TRACKED TICKERS
    console.log('\n📝 Step 2: Recomputing analysis for all tracked tickers...');
    const trackedTickers = await getAllTrackedTickers();
    const analysisResults = await processBatch(
        trackedTickers,
        async (symbol: string) => {
            try {
                return await AnalysisService.syncAndAnalyze(symbol);
            } catch (err: any) {
                console.error(`❌ Analysis error for ${symbol}:`, err.message);
                return false;
            }
        },
        5,  // batchSize: 5 tickers per outer batch
        3,  // concurrencyLimit: 3 parallel within each batch (respects Polygon rate limits)
        undefined,
        5000  // interBatchDelay — 5s between batches to avoid Finnhub 429
    );
    console.log(`✅ Analysis Sync Complete: ${analysisResults.success} updated, ${analysisResults.failed} failed`);

    await updateCronStatus('post_market_reset');

    const duration = Date.now() - startTime;
    console.log(`✅ Post-market data sync completed in ${(duration / 1000).toFixed(2)}s`);

    return createCronSuccessResponse({
        message: 'Post-market data sync completed successfully',
        results: {
            sharesOutstanding: sharesResults,
            analysis: analysisResults,
        },
        summary: {
            totalTickers: allTickers.length,
            duration: `${(duration / 1000).toFixed(2)}s`,
        },
    });
}

export async function GET(request: NextRequest) {
    const authError = verifyCronAuthOptional(request, true);
    if (authError) return authError;
    try {
        return await POST(request);
    } catch (error) {
        return handleCronError(error, 'post-market-sync manual trigger');
    }
}
