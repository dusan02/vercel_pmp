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

  const symbols = tickers.map(t => t.symbol);
  console.log(`📊 Found ${symbols.length} active tickers to sync`);

  if (forceRefresh) {
    const result = await FinnhubService.batchGetMetrics(symbols);
    console.log(`✅ Force-synced ${result.size} tickers`);
  } else {
    const result = await FinnhubService.backgroundSync(symbols);
    console.log(`✅ Background sync complete: ${result.success} success, ${result.failed} failed`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ sync-finnhub-metrics failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
