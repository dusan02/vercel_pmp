/**
 * Backfill AnalysisCache for top tickers by market cap that don't have analysis yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-analysis.ts [--limit=50] [--dry-run]
 *
 * Calls the production /api/analysis/[ticker] POST endpoint for each ticker
 * to trigger deep analysis (financials sync, score calculation, etc).
 * Runs sequentially with a delay to avoid overwhelming external APIs.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const CRON_SECRET = process.env.CRON_SECRET || '';
const DEFAULT_LIMIT = 50;
const DELAY_MS = 5000; // 5s between requests to be gentle on Finnhub/Polygon

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : DEFAULT_LIMIT;
  const dryRun = args.includes('--dry-run');

  // Find top tickers by market cap WITHOUT AnalysisCache
  // Use a low threshold ($100M) to catch mid-caps, then fall back to any ticker without analysis
  const tickers = await prisma.ticker.findMany({
    where: {
      analysisCache: null,
      lastMarketCap: { gt: 100_000_000 }, // > $100M market cap
    },
    orderBy: { lastMarketCap: 'desc' },
    take: limit,
    select: { symbol: true, name: true, lastMarketCap: true },
  });

  // If still empty, fall back to ANY ticker without AnalysisCache (regardless of market cap)
  let finalTickers = tickers;
  if (tickers.length === 0) {
    finalTickers = await prisma.ticker.findMany({
      where: { analysisCache: null },
      orderBy: { symbol: 'asc' },
      take: limit,
      select: { symbol: true, name: true, lastMarketCap: true },
    });
  }

  console.log(`Found ${finalTickers.length} tickers without AnalysisCache (limit: ${limit}, min market cap: $100M)`);

  if (finalTickers.length === 0) {
    console.log('All eligible tickers already have AnalysisCache. Nothing to do.');
    return;
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would backfill:');
    for (const t of finalTickers) {
      console.log(`  ${t.symbol} — ${t.name} (mcap: $${((t.lastMarketCap ?? 0) / 1e9).toFixed(1)}B)`);
    }
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < finalTickers.length; i++) {
    const t = finalTickers[i]!;
    const progress = `[${i + 1}/${finalTickers.length}]`;
    console.log(`${progress} Backfilling ${t.symbol} (${t.name})...`);

    try {
      const url = `${BASE_URL}/api/analysis/${t.symbol}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2min timeout per ticker

      const res = await fetch(url, {
        method: 'POST',
        headers: CRON_SECRET ? { 'x-cron-secret': CRON_SECRET } : {},
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        console.log(`${progress} ✅ ${t.symbol} — health: ${json?.healthScore ?? 'N/A'}`);
        success++;
      } else {
        console.error(`${progress} ❌ ${t.symbol} — HTTP ${res.status}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`${progress} ❌ ${t.symbol} — ${err.message}`);
      failed++;
    }

    // Delay between requests
    if (i < finalTickers.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed out of ${finalTickers.length}`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
