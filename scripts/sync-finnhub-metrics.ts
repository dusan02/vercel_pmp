/**
 * Sync FinnhubMetrics for all tracked tickers
 * Fetches metrics from Finnhub API and saves to DB + Redis cache.
 * Skips tickers updated within the last 12 hours.
 *
 * Run: npx tsx scripts/sync-finnhub-metrics.ts [--force] [--limit=50]
 * Cron: daily at 03:00 UTC via PM2
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { FinnhubService } from '../src/services/finnhubService';
import { calculateScores } from '../src/services/analysis/scoreCalculator';

async function main() {
  const forceRefresh = process.argv.includes('--force');
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? '0', 10) : undefined;

  console.log(`🔄 sync-finnhub-metrics starting (force=${forceRefresh}, limit=${limit ?? 'all'})`);

  const tickers = await prisma.ticker.findMany({
    where: { lastPrice: { gt: 0 }, assetType: 'STOCK' },
    select: { symbol: true, tier: true },
    orderBy: [{ tier: 'asc' }, { lastMarketCap: 'desc' }],
    ...(limit ? { take: limit } : {}),
  });

  console.log(`📊 Found ${tickers.length} active stock tickers to evaluate`);

  // Serial processing with 2s delay → ~30 calls/min (safe for Finnhub free tier 60/min)
  const DELAY_MS = 2000;
  const MAX_SYNCS_PER_RUN = limit ?? 1100;
  let success = 0;
  let failed = 0;
  let skipped = 0;

  let idx = 0;
  for (const t of tickers) {
    const symbol = t.symbol;
    if (!symbol) continue;
    if (success + failed >= MAX_SYNCS_PER_RUN) {
      break;
    }

    try {
      if (!forceRefresh) {
        const existing = await prisma.finnhubMetrics.findFirst({
          where: { symbol },
          select: { fetchedAt: true },
        });
        // Tier 1 & 2 refresh daily (>16h old); Tier 3 & 4 rotate every 3 days (>68h old)
        const maxAgeHours = (t.tier ?? 2) <= 2 ? 16 : 68;
        const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        if (existing?.fetchedAt && existing.fetchedAt > cutoff) {
          skipped++;
          idx++;
          continue;
        }
      }

      const metrics = await FinnhubService.getMetrics(symbol, true);
      if (metrics) {
        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    idx++;
    if ((success + failed) % 50 === 0) {
      console.log(`📈 Progress: ${idx}/${tickers.length} (✅ ${success} saved, ⏭️ ${skipped} skipped, ❌ ${failed} failed)`);
    }

    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }

  console.log(`✅ Sync complete: ${success} saved, ${skipped} skipped (fresh), ${failed} failed`);

  // Recalculate AnalysisCache scores (health/valuation/profitability/Piotroski/
  // Altman/Beneish) so they track the fresh daily metrics instead of waiting
  // for the weekly refresh-all. DB-only — no API calls, ~a few reads per ticker.
  const cached = await prisma.analysisCache.findMany({ select: { symbol: true } });
  let scoresOk = 0;
  let scoresFailed = 0;
  for (const { symbol } of cached) {
    try {
      await calculateScores(symbol);
      scoresOk++;
    } catch {
      scoresFailed++;
    }
  }
  console.log(`📊 Scores recalculated: ${scoresOk} ok, ${scoresFailed} failed (${cached.length} cached tickers)`);

  await prisma.$disconnect();
  // Explicit exit — an open Redis handle would otherwise keep the process
  // alive for hours after the sync finished (observed zombie PM2 processes).
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ sync-finnhub-metrics failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
