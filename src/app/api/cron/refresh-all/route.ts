import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';
import { processBatch } from '@/lib/utils/batchProcessing';

/**
 * Weekly cron: refresh analysis cache for all previously analyzed tickers.
 * Also fills financial data gaps (null revenue/ebit/netIncome) by re-syncing affected tickers.
 *
 * Trigger via:
 *   - curl -H "Authorization: Bearer $CRON_SECRET_KEY" https://premarketprice.com/api/cron/refresh-all
 *
 * Env var required: CRON_SECRET_KEY
 */
export async function GET(request: NextRequest) {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const startedAt = Date.now();

    const cached = await prisma.analysisCache.findMany({
        select: { symbol: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' }, // oldest first — most urgent to refresh
    });

    console.log(`[cron/refresh-all] Step 1: Refresh analysis for ${cached.length} tickers`);

    const results = await processBatch(
        cached.map(c => c.symbol),
        async (symbol: string) => {
            try {
                await AnalysisService.syncFinancials(symbol);
                await AnalysisService.syncValuationHistory(symbol);
                await AnalysisService.calculateScores(symbol);
                console.log(`[cron/refresh-all] ✓ ${symbol}`);
                return true;
            } catch (err: any) {
                console.error(`[cron/refresh-all] ✗ ${symbol}: ${err?.message}`);
                return false;
            }
        },
        5,  // batchSize
        2,  // concurrencyLimit (conservative — Polygon rate limits)
        undefined,
        5000  // interBatchDelay — 5s between batches to avoid Finnhub 429
    );

    const step1Ms = Date.now() - startedAt;
    console.log(`[cron/refresh-all] Step 1 done. ${results.success} ok, ${results.failed} failed. ${step1Ms}ms`);

    // Step 2: Fill financial data gaps — re-sync tickers with null revenue/ebit/netIncome
    const gapTickers = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT symbol FROM "FinancialStatement" WHERE revenue IS NULL OR ebit IS NULL OR "netIncome" IS NULL`
    ) as { symbol: string }[];

    console.log(`[cron/refresh-all] Step 2: Fill data gaps for ${gapTickers.length} tickers with null financials`);

    const gapResults = await processBatch(
        gapTickers.map(t => t.symbol),
        async (symbol: string) => {
            try {
                await AnalysisService.syncFinancials(symbol);
                console.log(`[cron/refresh-all] gap ✓ ${symbol}`);
                return true;
            } catch (err: any) {
                console.error(`[cron/refresh-all] gap ✗ ${symbol}: ${err?.message}`);
                return false;
            }
        },
        5,  // batchSize
        1,  // concurrencyLimit — conservative for gap fill
        undefined,
        5000  // interBatchDelay — 5s between batches
    );

    const totalMs = Date.now() - startedAt;
    console.log(`[cron/refresh-all] Step 2 done. ${gapResults.success} ok, ${gapResults.failed} failed.`);
    console.log(`[cron/refresh-all] All done. Total: ${totalMs}ms`);

    return NextResponse.json({
        step1: {
            total: cached.length,
            succeeded: results.success,
            failed: results.failed,
        },
        step2_gaps: {
            total: gapTickers.length,
            succeeded: gapResults.success,
            failed: gapResults.failed,
        },
        totalMs,
    });
}
