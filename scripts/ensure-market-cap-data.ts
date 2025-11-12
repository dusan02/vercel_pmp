/**
 * Script to ensure all tickers have sharesOutstanding data
 * This is required for accurate market cap calculation in the heatmap
 */

import { prisma } from '../src/lib/prisma';
import { getSharesOutstanding } from '../src/lib/marketCapUtils';

interface TickerStatus {
  symbol: string;
  name: string | null;
  hasSharesOutstanding: boolean;
  sharesOutstanding: number | null;
  hasCurrentPrice: boolean;
  canCalculateMarketCap: boolean;
}

async function checkMarketCapData() {
  console.log('📊 Checking market cap data coverage...\n');

  // Get all tickers
  const allTickers = await prisma.ticker.findMany({
    select: {
      symbol: true,
      name: true,
      sharesOutstanding: true
    },
    orderBy: {
      symbol: 'asc'
    }
  });

  console.log(`📈 Total tickers in database: ${allTickers.length}\n`);

  // Check which tickers have sharesOutstanding
  const tickersWithShares = allTickers.filter(t => t.sharesOutstanding && t.sharesOutstanding > 0);
  const tickersWithoutShares = allTickers.filter(t => !t.sharesOutstanding || t.sharesOutstanding <= 0);

  console.log('📊 Coverage Statistics:');
  console.log(`  Tickers with sharesOutstanding: ${tickersWithShares.length} (${((tickersWithShares.length / allTickers.length) * 100).toFixed(1)}%)`);
  console.log(`  Tickers without sharesOutstanding: ${tickersWithoutShares.length} (${((tickersWithoutShares.length / allTickers.length) * 100).toFixed(1)}%)\n`);

  // Check which tickers have current price data (SessionPrice)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const pricesWithData = await prisma.sessionPrice.findMany({
    where: {
      date: {
        gte: weekAgo,
        lt: tomorrow
      },
      lastPrice: {
        gt: 0
      }
    },
    select: {
      symbol: true,
      lastPrice: true
    },
    distinct: ['symbol']
  });

  const symbolsWithPrice = new Set(pricesWithData.map(p => p.symbol));

  console.log('📊 Price Data Coverage:');
  console.log(`  Tickers with current price data: ${symbolsWithPrice.size} (${((symbolsWithPrice.size / allTickers.length) * 100).toFixed(1)}%)\n`);

  // Analyze which tickers can calculate market cap
  const tickerStatuses: TickerStatus[] = allTickers.map(ticker => {
    const hasShares = ticker.sharesOutstanding && ticker.sharesOutstanding > 0;
    const hasPrice = symbolsWithPrice.has(ticker.symbol);
    const canCalculate = hasShares && hasPrice;

    return {
      symbol: ticker.symbol,
      name: ticker.name,
      hasSharesOutstanding: hasShares,
      sharesOutstanding: ticker.sharesOutstanding,
      hasCurrentPrice: hasPrice,
      canCalculateMarketCap: canCalculate
    };
  });

  const canCalculate = tickerStatuses.filter(t => t.canCalculateMarketCap).length;
  const cannotCalculate = tickerStatuses.filter(t => !t.canCalculateMarketCap).length;

  console.log('📊 Market Cap Calculation Readiness:');
  console.log(`  Tickers that CAN calculate market cap: ${canCalculate} (${((canCalculate / allTickers.length) * 100).toFixed(1)}%)`);
  console.log(`  Tickers that CANNOT calculate market cap: ${cannotCalculate} (${((cannotCalculate / allTickers.length) * 100).toFixed(1)}%)\n`);

  // Show breakdown of why they can't calculate
  const missingShares = tickerStatuses.filter(t => !t.hasSharesOutstanding && t.hasCurrentPrice);
  const missingPrice = tickerStatuses.filter(t => t.hasSharesOutstanding && !t.hasCurrentPrice);
  const missingBoth = tickerStatuses.filter(t => !t.hasSharesOutstanding && !t.hasCurrentPrice);

  console.log('📊 Breakdown of tickers that CANNOT calculate market cap:');
  console.log(`  Missing sharesOutstanding only: ${missingShares.length}`);
  console.log(`  Missing current price only: ${missingPrice.length}`);
  console.log(`  Missing both: ${missingBoth.length}\n`);

  // Show samples
  if (missingShares.length > 0) {
    console.log('📋 Sample tickers missing sharesOutstanding (but have price):');
    missingShares.slice(0, 10).forEach(t => {
      console.log(`  - ${t.symbol} (${t.name || 'N/A'})`);
    });
    if (missingShares.length > 10) {
      console.log(`  ... and ${missingShares.length - 10} more\n`);
    }
  }

  return {
    total: allTickers.length,
    withShares: tickersWithShares.length,
    withoutShares: tickersWithoutShares.length,
    withPrice: symbolsWithPrice.size,
    canCalculate,
    cannotCalculate,
    missingShares: missingShares.length,
    missingPrice: missingPrice.length,
    missingBoth: missingBoth.length,
    tickersToUpdate: tickersWithoutShares
  };
}

async function updateSharesOutstanding() {
  console.log('🚀 Starting sharesOutstanding update...\n');

  const analysis = await checkMarketCapData();

  if (analysis.withoutShares === 0) {
    console.log('✅ All tickers already have sharesOutstanding data!\n');
    return;
  }

  console.log(`\n🔄 Updating ${analysis.withoutShares} tickers...\n`);

  const tickersToUpdate = analysis.tickersToUpdate;
  const batchSize = 5; // Process 5 at a time to avoid rate limits
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < tickersToUpdate.length; i += batchSize) {
    const batch = tickersToUpdate.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(tickersToUpdate.length / batchSize);

    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);

    await Promise.all(
      batch.map(async (ticker) => {
        try {
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));

          const shares = await getSharesOutstanding(ticker.symbol);

          if (shares && shares > 0) {
            await prisma.ticker.update({
              where: { symbol: ticker.symbol },
              data: { sharesOutstanding: shares }
            });
            console.log(`  ✅ ${ticker.symbol}: ${shares.toLocaleString()} shares`);
            updated++;
          } else {
            console.log(`  ⚠️  ${ticker.symbol}: No shares data available`);
            skipped++;
          }
        } catch (error) {
          console.error(`  ❌ ${ticker.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errors++;
        }
      })
    );

    // Longer delay between batches
    if (i + batchSize < tickersToUpdate.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n✅ Update complete!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}\n`);

  // Run final check
  console.log('📊 Final status check...\n');
  await checkMarketCapData();
}

// Main execution
async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0] || 'check';

    if (command === 'check') {
      await checkMarketCapData();
    } else if (command === 'update') {
      await updateSharesOutstanding();
    } else {
      console.log('Usage:');
      console.log('  npx tsx scripts/ensure-market-cap-data.ts check   - Check coverage');
      console.log('  npx tsx scripts/ensure-market-cap-data.ts update - Update missing data');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

