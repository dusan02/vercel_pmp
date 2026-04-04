import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuthOptional } from '@/lib/utils/cronAuth';
import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';

export const maxDuration = 300; // 5 min max (Vercel Pro / self-hosted)

/**
 * POST /api/admin/refresh-all
 * Re-runs full analysis pipeline for every symbol that has an AnalysisCache record.
 *
 * Auth: Bearer $CRON_SECRET_KEY  (skipped in dev when no secret set)
 *
 * Body (optional JSON):
 *   force        boolean  – ignore 24-h freshness check (default false)
 *   symbols      string[] – limit to specific symbols (default: all analyzed)
 *   delayMs      number   – ms to wait between tickers (default 1000)
 */
export async function POST(request: NextRequest) {
    const authError = verifyCronAuthOptional(request, true); // allow dev without auth
    if (authError) return authError;

    let force = false;
    let symbols: string[] | null = null;
    let delayMs = 1000;

    try {
        const body = await request.json().catch(() => ({}));
        force = body.force ?? false;
        symbols = Array.isArray(body.symbols) ? body.symbols : null;
        delayMs = typeof body.delayMs === 'number' ? body.delayMs : 1000;
    } catch { /* no body */ }

    // Fetch all analyzed symbols (or subset)
    const cacheRows = await prisma.analysisCache.findMany({
        ...(symbols ? { where: { symbol: { in: symbols } } } : {}),
        select: { symbol: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' }, // oldest first
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toRefresh = force
        ? cacheRows
        : cacheRows.filter(r => r.updatedAt < oneDayAgo);

    console.log(`[refresh-all] ${toRefresh.length}/${cacheRows.length} tickers need refresh (force=${force})`);

    const results: { symbol: string; status: 'ok' | 'error'; error?: string; durationMs: number }[] = [];

    for (const { symbol } of toRefresh) {
        const start = Date.now();
        try {
            await AnalysisService.syncFinancials(symbol);

            // Always re-sync ticker details (description, employees, HQ)
            await AnalysisService.syncTickerDetails(symbol);

            await AnalysisService.syncValuationHistory(symbol);
            await AnalysisService.calculateScores(symbol);

            results.push({ symbol, status: 'ok', durationMs: Date.now() - start });
            console.log(`[refresh-all] ✅ ${symbol} (${Date.now() - start}ms)`);
        } catch (err: any) {
            results.push({ symbol, status: 'error', error: err?.message, durationMs: Date.now() - start });
            console.error(`[refresh-all] ❌ ${symbol}:`, err?.message);
        }

        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    }

    const ok = results.filter(r => r.status === 'ok').length;
    const errors = results.filter(r => r.status === 'error');

    return NextResponse.json({
        total: cacheRows.length,
        refreshed: toRefresh.length,
        ok,
        errors: errors.length,
        skipped: cacheRows.length - toRefresh.length,
        details: results,
    });
}

/**
 * GET /api/admin/refresh-all
 * Returns how many tickers are in AnalysisCache and how many are stale (>24h).
 */
export async function GET(request: NextRequest) {
    const authError = verifyCronAuthOptional(request, true);
    if (authError) return authError;

    const rows = await prisma.analysisCache.findMany({
        select: { symbol: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' },
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = rows.filter(r => r.updatedAt < oneDayAgo);

    return NextResponse.json({
        total: rows.length,
        stale: stale.length,
        fresh: rows.length - stale.length,
        staleTickers: stale.map(r => ({ symbol: r.symbol, updatedAt: r.updatedAt })),
    });
}
