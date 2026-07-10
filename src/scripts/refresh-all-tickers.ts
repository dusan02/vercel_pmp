/**
 * Standalone script: refresh analysis data for all tickers.
 *
 * Usage on server:
 *   cd /var/www/premarketprice
 *   npx tsx src/scripts/refresh-all-tickers.ts
 *
 * Or with nohup:
 *   nohup npx tsx src/scripts/refresh-all-tickers.ts > /tmp/refresh-all.log 2>&1 &
 */

import { prisma } from '@/lib/db/prisma';
import { AnalysisService } from '@/services/analysisService';

const FINNHUB_DELAY_MS = 1200; // Finnhub free tier: 60 calls/min → 1s min, 1.2s safe

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const startedAt = Date.now();

    const cached = await prisma.analysisCache.findMany({
        select: { symbol: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' }, // oldest first — most urgent
    });

    const tickers = cached.map(c => c.symbol);
    console.log(`[refresh-all] Starting refresh for ${tickers.length} tickers`);
    console.log(`[refresh-all] Rate: ~${(1000 / FINNHUB_DELAY_MS).toFixed(0)} tickers/sec, est. ${((tickers.length * FINNHUB_DELAY_MS) / 1000 / 60).toFixed(1)} min`);

    let success = 0;
    let failed = 0;
    let rateLimited = 0;

    for (let i = 0; i < tickers.length; i++) {
        const symbol = tickers[i]!;
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);

        try {
            await AnalysisService.syncFinancials(symbol);
            await AnalysisService.syncValuationHistory(symbol);
            await AnalysisService.calculateScores(symbol);
            success++;
            console.log(`[refresh-all] ✓ ${symbol} (${i + 1}/${tickers.length}) — ${elapsed}s`);
        } catch (err: any) {
            failed++;
            const msg = err?.message ?? 'Unknown error';
            if (msg.includes('429')) rateLimited++;
            console.error(`[refresh-all] ✗ ${symbol}: ${msg} (${i + 1}/${tickers.length}) — ${elapsed}s`);
        }

        // Rate limit: wait between each ticker to stay under Finnhub 60/min
        if (i + 1 < tickers.length) {
            await sleep(FINNHUB_DELAY_MS);
        }
    }

    const totalMs = Date.now() - startedAt;
    console.log(`[refresh-all] Done. ${success} ok, ${failed} failed (${rateLimited} rate-limited). Total: ${(totalMs / 1000).toFixed(1)}s (${(totalMs / 1000 / 60).toFixed(1)} min)`);

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('[refresh-all] Fatal error:', err);
    process.exit(1);
});
