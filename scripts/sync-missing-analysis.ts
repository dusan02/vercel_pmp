/**
 * Sync analysis cache for tickers that don't have it yet.
 * Runs AnalysisService.syncAndAnalyze for each missing ticker.
 *
 * Run: npx tsx scripts/sync-missing-analysis.ts
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { AnalysisService } from '../src/services/analysisService';

async function main() {
  console.log('🔄 sync-missing-analysis starting...');

  const all = await prisma.ticker.findMany({
    select: { symbol: true },
    orderBy: { lastMarketCap: 'desc' },
  });

  const cached = await prisma.analysisCache.findMany({
    distinct: ['symbol'],
    select: { symbol: true },
  });
  const cachedSet = new Set(cached.map(c => c.symbol));
  const missing = all.filter(t => !cachedSet.has(t.symbol)).map(t => t.symbol);

  console.log(`Missing analysis cache: ${missing.length} tickers`);

  let success = 0;
  let failed = 0;
  const errors: { symbol: string; error: string }[] = [];

  for (let i = 0; i < missing.length; i++) {
    const symbol = missing[i]!;
    process.stdout.write(`[${i + 1}/${missing.length}] ${symbol}... `);
    try {
      const ok = await AnalysisService.syncAndAnalyze(symbol);
      if (ok) {
        success++;
        console.log('✓');
      } else {
        failed++;
        console.log('✗ (returned false)');
        errors.push({ symbol, error: 'returned false' });
      }
    } catch (err: any) {
      failed++;
      console.log(`✗ ${err?.message || 'error'}`);
      errors.push({ symbol, error: err?.message || 'unknown' });
    }
    // Small delay to respect API rate limits
    if (i < missing.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n=== DONE ===`);
  console.log(`Success: ${success}, Failed: ${failed}, Total: ${missing.length}`);
  if (errors.length > 0) {
    console.log('\nFailed tickers:');
    for (const e of errors) {
      console.log(`  ${e.symbol}: ${e.error}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
