import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';
import { processBatch } from '@/lib/utils/batchProcessing';

/**
 * Weekly cron: refresh analysis cache for all previously analyzed tickers.
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

    console.log(`[cron/refresh-all] Starting refresh for ${cached.length} tickers`);

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
        2   // concurrencyLimit (conservative — Polygon rate limits)
    );

    const totalMs = Date.now() - startedAt;
    console.log(`[cron/refresh-all] Done. ${results.success} ok, ${results.failed} failed. Total: ${totalMs}ms`);

    return NextResponse.json({
        total: cached.length,
        succeeded: results.success,
        failed: results.failed,
        totalMs,
    });
}
