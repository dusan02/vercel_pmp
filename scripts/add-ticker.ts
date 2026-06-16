/**
 * One-off script to manually seed a ticker into the Ticker table.
 * Run from project root: npx tsx scripts/add-ticker.ts <SYMBOL>
 *
 * After adding, the worker will populate price data on the next ingest cycle.
 */

import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';

const symbol = (process.argv[2] || '').trim().toUpperCase();
if (!symbol) {
  console.error('Usage: npx tsx scripts/add-ticker.ts <SYMBOL>');
  process.exit(1);
}

async function main() {
  const result = await prisma.ticker.upsert({
    where: { symbol },
    update: {},
    create: {
      symbol,
      name: symbol,
      lastPrice: 0,
      lastChangePct: 0,
      lastMarketCap: 0,
      lastMarketCapDiff: 0,
      lastVolume: 0,
    },
  });
  console.log(`✅ Ticker ${symbol} upserted (symbol: ${result.symbol})`);
}

main()
  .catch((e) => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
