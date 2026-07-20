import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';
import { processBatch } from '@/lib/utils/batchProcessing';

// Fields to check for gaps — all financial statement data points used in charts
const GAP_FIELDS = [
    'revenue', '"netIncome"', 'ebit', '"operatingCashFlow"', 'capex',
    '"totalDebt"', '"cashAndEquivalents"', '"sharesOutstanding"', '"grossProfit"'
] as const;

async function getFieldStats() {
    const total = await prisma.financialStatement.count();
    const stats: Record<string, { filled: number; nulls: number; pct: number }> = {};
    for (const field of GAP_FIELDS) {
        const filled = await prisma.$queryRawUnsafe(
            `SELECT COUNT(*) as c FROM "FinancialStatement" WHERE ${field} IS NOT NULL`
        ) as { c: bigint }[];
        const filledCount = Number(filled[0]!.c);
        stats[field.replace(/"/g, '')] = {
            filled: filledCount,
            nulls: total - filledCount,
            pct: total > 0 ? (filledCount / total) * 100 : 0,
        };
    }
    return { total, stats };
}

/**
 * Weekly cron: refresh analysis cache for all previously analyzed tickers.
 * Also fills financial data gaps (null fields) by re-syncing affected tickers.
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

    // ─── Before stats ──────────────────────────────────────────────
    const beforeStats = await getFieldStats();
    console.log(`[cron/refresh-all] Before: ${beforeStats.total} statements`);
    for (const [field, s] of Object.entries(beforeStats.stats)) {
        console.log(`  ${field}: ${s.filled} filled, ${s.nulls} nulls (${s.pct.toFixed(1)}%)`);
    }

    // ─── Step 1: Refresh analysis for all cached tickers ──────────
    const cached = await prisma.analysisCache.findMany({
        select: { symbol: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' },
    });

    console.log(`[cron/refresh-all] Step 1: Refresh analysis for ${cached.length} tickers`);

    const results = await processBatch(
        cached.map(c => c.symbol),
        async (symbol: string) => {
            try {
                await AnalysisService.syncFinancials(symbol);
                await AnalysisService.syncValuationHistory(symbol);
                await AnalysisService.calculateScores(symbol);
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
    console.log(`[cron/refresh-all] Step 1 done: ${results.success} ok, ${results.failed} failed (${step1Ms}ms)`);

    // ─── Step 2: Fill financial data gaps ──────────────────────────
    // Find tickers with ANY null field across all tracked fields
    const nullCondition = GAP_FIELDS.map(f => `${f} IS NULL`).join(' OR ');
    const gapTickers = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT symbol FROM "FinancialStatement" WHERE ${nullCondition}`
    ) as { symbol: string }[];

    console.log(`[cron/refresh-all] Step 2: Fill data gaps for ${gapTickers.length} tickers`);

    const gapResults = await processBatch(
        gapTickers.map(t => t.symbol),
        async (symbol: string) => {
            try {
                await AnalysisService.syncFinancials(symbol);
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

    console.log(`[cron/refresh-all] Step 2 done: ${gapResults.success} ok, ${gapResults.failed} failed`);

    // ─── After stats ───────────────────────────────────────────────
    const afterStats = await getFieldStats();
    console.log(`[cron/refresh-all] After: ${afterStats.total} statements`);
    for (const [field, s] of Object.entries(afterStats.stats)) {
        const before = beforeStats.stats[field]!;
        const delta = s.nulls - before.nulls;
        const deltaStr = delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : '';
        console.log(`  ${field}: ${s.filled} filled, ${s.nulls} nulls (${s.pct.toFixed(1)}%)${deltaStr}`);
    }

    const totalMs = Date.now() - startedAt;
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
        before: beforeStats,
        after: afterStats,
        totalMs,
    });
}
