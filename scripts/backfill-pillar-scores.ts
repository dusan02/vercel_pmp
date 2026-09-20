/**
 * Backfills growthScore / qualityScore / overallScore into AnalysisCache.
 *
 * Reuses scoreCalculator.calculateScores (the same code path that writes
 * scores during refresh) with skipVerdict + skipNotify so the run does not
 * spend AI calls or fire quality-breakout notifications.
 *
 * Usage:
 *   npx tsx scripts/backfill-pillar-scores.ts            # all cached symbols
 *   npx tsx scripts/backfill-pillar-scores.ts PM AAPL    # specific symbols
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '@/lib/db/prisma';
import { calculateScores } from '@/services/analysis/scoreCalculator';

async function main() {
    const args = process.argv.slice(2).map(s => s.toUpperCase());
    const symbols = args.length > 0
        ? args
        : (await prisma.analysisCache.findMany({ select: { symbol: true } })).map(r => r.symbol);

    console.log(`[backfill] ${symbols.length} symbols`);
    let done = 0, failed = 0;
    for (const symbol of symbols) {
        try {
            await calculateScores(symbol, { skipVerdict: true, skipNotify: true });
            done++;
            if (done % 50 === 0) console.log(`[backfill] ${done}/${symbols.length}`);
        } catch (e) {
            failed++;
            console.error(`[backfill] ${symbol} failed:`, (e as Error).message);
        }
    }
    console.log(`[backfill] done — ${done} updated, ${failed} failed`);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
