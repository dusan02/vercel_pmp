/**
 * Force update stock prices from Polygon API
 * Bypasses pricing state machine and timestamp checks
 * 
 * Usage: npx tsx scripts/force-update-prices.ts TICKER1 TICKER2 ...
 * Example: npx tsx scripts/force-update-prices.ts ULTA MSFT
 */

import { prisma } from '../src/lib/db/prisma';
import { ingestBatch } from '../src/workers/polygonWorker';

const apiKey = process.env.POLYGON_API_KEY;

async function forceUpdatePrices(tickers: string[]) {
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not set');
    process.exit(1);
  }

  console.log(`🔧 Force updating prices for: ${tickers.join(', ')}`);
  console.log('⚠️  This will bypass pricing state machine and timestamp checks\n');

  // Use ingestBatch with force=true to bypass state machine
  const results = await ingestBatch(tickers, apiKey, true);

  console.log('\n📊 Results:');
  let success = 0;
  let failed = 0;

  results.forEach(result => {
    if (result.success) {
      success++;
      console.log(`   ✅ ${result.symbol}: $${result.price?.toFixed(2) || 'N/A'} (${result.changePct?.toFixed(2) || 'N/A'}%)`);
    } else {
      failed++;
      console.log(`   ❌ ${result.symbol}: ${result.error || 'Unknown error'}`);
    }
  });

  console.log(`\n✅ Success: ${success}, Failed: ${failed}`);
}

async function main() {
  const tickers = process.argv.slice(2);

  if (tickers.length === 0) {
    console.error('Usage: npx tsx scripts/force-update-prices.ts TICKER1 TICKER2 ...');
    console.error('Example: npx tsx scripts/force-update-prices.ts ULTA MSFT');
    process.exit(1);
  }

  await forceUpdatePrices(tickers.map(t => t.toUpperCase()));
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
