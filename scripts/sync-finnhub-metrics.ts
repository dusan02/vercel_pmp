/**
 * Sync FinnhubMetrics + FinnhubPriceTarget for all tracked tickers
 * Fetches metrics and analyst price targets from Finnhub API and saves to DB + Redis cache.
 * Skips tickers updated within the last 12 hours.
 *
 * Run: npx tsx scripts/sync-finnhub-metrics.ts [--force] [--limit=50]
 * Cron: daily at 03:00 UTC via PM2
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { FinnhubService } from '../src/services/finnhubService';

async function main() {
  const forceRefresh = process.argv.includes('--force');
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? '0', 10) : undefined;

  console.log(`🔄 sync-finnhub-metrics starting (force=${forceRefresh}, limit=${limit ?? 'all'})`);

  const tickers = await prisma.ticker.findMany({
    where: { lastPrice: { gt: 0 } },
    select: { symbol: true },
    orderBy: { lastMarketCap: 'desc' },
    ...(limit ? { take: limit } : {}),
  });

  const symbols = tickers.map(t => t.symbol).filter((s): s is string => !!s);
  console.log(`📊 Found ${symbols.length} active tickers to sync`);

  // Serial processing with 2s delay → ~30 calls/min (safe for Finnhub free tier 60/min)
  // Each ticker makes 2 API calls (metrics + price target) → 1s delay between calls
  const DELAY_MS = 2000;
  let metricsSuccess = 0;
  let ptSuccess = 0;
  let failed = 0;
  let skipped = 0;

  let idx = 0;
  for (const symbol of symbols) {
    try {
      if (!forceRefresh) {
        const existing = await prisma.finnhubMetrics.findFirst({
          where: { symbol },
          select: { fetchedAt: true },
        });
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        if (existing?.fetchedAt && existing.fetchedAt > twelveHoursAgo) {
          // Also check price target freshness
          const ptExisting = await prisma.finnhubPriceTarget.findFirst({
            where: { symbol },
            select: { fetchedAt: true },
          });
          if (ptExisting?.fetchedAt && ptExisting.fetchedAt > twelveHoursAgo) {
            skipped++;
            idx++;
            continue;
          }
        }
      }

      // Fetch metrics
      const metrics = await FinnhubService.getMetrics(symbol, true);
      if (metrics) {
        metricsSuccess++;
      }

      // Small delay between the two API calls for the same symbol
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Fetch price target
      const priceTarget = await FinnhubService.getPriceTarget(symbol, true);
      if (priceTarget) {
        ptSuccess++;
      }

      if (!metrics && !priceTarget) {
        failed++;
      }
    } catch {
      failed++;
    }

    idx++;
    if (idx % 50 === 0) {
      console.log(`📈 Progress: ${idx}/${symbols.length} (✅ ${metricsSuccess} metrics, ✅ ${ptSuccess} price targets, ⏭️ ${skipped} skipped, ❌ ${failed} failed)`);
    }

    if (idx < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log(`✅ Sync complete: ${metricsSuccess} metrics, ${ptSuccess} price targets, ${skipped} skipped (fresh), ${failed} failed`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ sync-finnhub-metrics failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
