import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';

const DELAY_MS = 2000; // 2s between tickers to respect Polygon rate limits
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Weekly cron: refresh analysis cache for all previously analyzed tickers.
 *
 * Trigger via:
 *   - Vercel Cron (add to vercel.json): {"path": "/api/cron/refresh-all", "schedule": "0 4 * * 1"}
 *   - External cron / curl: GET /api/cron/refresh-all?secret=<CRON_SECRET>
 *   - Manual: curl https://premarketprice.com/api/cron/refresh-all?secret=...
 *
 * Env var required: CRON_SECRET (set in .env.local and Vercel dashboard)
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();

    // Get all tickers that have been analyzed before, ordered by most recently updated
    const cached = await prisma.analysisCache.findMany({
        select: { symbol: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' }, // oldest first — most urgent to refresh
    });

    const results: { symbol: string; status: string; ms: number }[] = [];
    let succeeded = 0;
    let failed = 0;

    console.log(`[cron/refresh-all] Starting refresh for ${cached.length} tickers`);

    for (const { symbol } of cached) {
        const t0 = Date.now();
        try {
            await AnalysisService.syncFinancials(symbol);
            await AnalysisService.syncValuationHistory(symbol); // now incremental — fast
            await AnalysisService.calculateScores(symbol);
            const ms = Date.now() - t0;
            results.push({ symbol, status: 'ok', ms });
            succeeded++;
            console.log(`[cron/refresh-all] ✓ ${symbol} (${ms}ms)`);
        } catch (err: any) {
            const ms = Date.now() - t0;
            results.push({ symbol, status: `error: ${err?.message}`, ms });
            failed++;
            console.error(`[cron/refresh-all] ✗ ${symbol}: ${err?.message}`);
        }
        await sleep(DELAY_MS);
    }

    const totalMs = Date.now() - startedAt;
    console.log(`[cron/refresh-all] Done. ${succeeded} ok, ${failed} failed. Total: ${totalMs}ms`);

    return NextResponse.json({
        total: cached.length,
        succeeded,
        failed,
        totalMs,
        results,
    });
}
