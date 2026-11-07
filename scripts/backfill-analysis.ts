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
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const CRON_SECRET = process.env.CRON_SECRET || process.env.CRON_SECRET_KEY || '';
const DEFAULT_LIMIT = 50;
const DELAY_MS = 3500; // 3.5s between requests to be gentle on Finnhub/Polygon

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : DEFAULT_LIMIT;
  const dryRun = args.includes('--dry-run');

  // Find stock tickers that either have no AnalysisCache row OR have an empty stub
  // AnalysisCache row (healthScore: null) and 0 FinancialStatements.
  // Skip tickers whose empty AnalysisCache was already attempted in the last 3 days
  // (e.g. foreign ADRs without SEC EDGAR XBRL filings) so the queue always advances.
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const tickers = await prisma.ticker.findMany({
    where: {
      assetType: 'STOCK',
      lastMarketCap: { gt: 0.1 }, // > $100M market cap (stored in billions)
      financialStatements: { none: {} },
      OR: [
        { analysisCache: { is: null } },
        {
          analysisCache: {
            healthScore: null,
          },
        },
      ],
    },
    orderBy: [{ tier: 'asc' }, { lastMarketCap: 'desc' }],
    take: limit * 3,
    select: {
      symbol: true,
      name: true,
      tier: true,
      lastMarketCap: true,
      analysisCache: { select: { updatedAt: true, healthScore: true } },
    },
  });

  // Prioritize tickers never attempted or attempted longest ago, while preserving market cap priority
  const finalTickers = tickers
    .sort((a, b) => {
      const aRecent = a.analysisCache?.updatedAt && a.analysisCache.updatedAt > threeDaysAgo ? 1 : 0;
      const bRecent = b.analysisCache?.updatedAt && b.analysisCache.updatedAt > threeDaysAgo ? 1 : 0;
      if (aRecent !== bRecent) return aRecent - bRecent;
      const tierDiff = (a.tier ?? 3) - (b.tier ?? 3);
      if (tierDiff !== 0) return tierDiff;
      return (b.lastMarketCap ?? 0) - (a.lastMarketCap ?? 0);
    })
    .slice(0, limit);

  console.log(`Found ${finalTickers.length} stock tickers needing fundamental backfill (limit: ${limit}, min market cap: $100M)`);

  if (finalTickers.length === 0) {
    console.log('All eligible stock tickers already have fundamental statements & scores. Nothing to do.');
    return;
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would backfill:');
    for (const t of finalTickers) {
      console.log(`  ${t.symbol} (Tier ${t.tier}) — ${t.name} (mcap: $${(t.lastMarketCap ?? 0).toFixed(2)}B)`);
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
        console.log(`${progress} ✅ ${t.symbol} — health: ${json?. pillars?.health?.score ?? json?.healthScore ?? 'N/A'}`);
        success++;
      } else {
        console.error(`${progress} ❌ ${t.symbol} — HTTP ${res.status}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`${progress} ❌ ${t.symbol} — ${err.message}`);
      failed++;
    }

    // Touch AnalysisCache.updatedAt so tickers without SEC XBRL filings (e.g. ADRs)
    // move to the back of the queue for 3 days instead of blocking future runs.
    try {
      await prisma.analysisCache.upsert({
        where: { symbol: t.symbol },
        update: { updatedAt: new Date() },
        create: { symbol: t.symbol, updatedAt: new Date() },
      });
    } catch {}

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
