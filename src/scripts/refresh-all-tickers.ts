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
import { processBatch } from '@/lib/utils/batchProcessing';

async function main() {
    const startedAt = Date.now();

    const cached = await prisma.analysisCache.findMany({
        select: { symbol: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' },
    });

    console.log(`[refresh-all] Starting refresh for ${cached.length} tickers`);

    const results = await processBatch(
        cached.map(c => c.symbol),
        async (symbol: string) => {
            try {
                await AnalysisService.syncFinancials(symbol);
                await AnalysisService.syncValuationHistory(symbol);
                await AnalysisService.calculateScores(symbol);
                console.log(`[refresh-all] ✓ ${symbol}`);
                return true;
            } catch (err: any) {
                console.error(`[refresh-all] ✗ ${symbol}: ${err?.message}`);
                return false;
            }
        },
        5,
        2,
        (batchNum, totalBatches, size) => {
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
            console.log(`[refresh-all] Batch ${batchNum}/${totalBatches} (${size} tickers) — ${elapsed}s elapsed`);
        }
    );

    const totalMs = Date.now() - startedAt;
    console.log(`[refresh-all] Done. ${results.success} ok, ${results.failed} failed. Total: ${(totalMs / 1000).toFixed(1)}s`);

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('[refresh-all] Fatal error:', err);
    process.exit(1);
});
