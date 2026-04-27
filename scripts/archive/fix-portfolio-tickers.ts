/**
 * Script to check and fix previousClose for specific portfolio tickers
 * Usage: npx tsx scripts/fix-portfolio-tickers.ts TICKER1 TICKER2 ...
 * Example: npx tsx scripts/fix-portfolio-tickers.ts ULTA META AMZN SNPS ASML GOOGL ALGN
 */

import { prisma } from '../src/lib/db/prisma';
import { getPreviousClose } from '../src/lib/utils/marketCapUtils';
import { getLastTradingDay } from '../src/lib/utils/timeUtils';
import { getDateET, createETDate } from '../src/lib/utils/dateET';
import { setPrevClose } from '../src/lib/redis/operations';

async function checkAndFixTicker(ticker: string) {
  console.log(`\n🔍 Checking ${ticker}...`);

  // Get current DB value
  const tickerRecord = await prisma.ticker.findUnique({
    where: { symbol: ticker },
    select: {
      symbol: true,
      lastPrice: true,
      latestPrevClose: true,
      latestPrevCloseDate: true,
      lastChangePct: true
    }
  });

  if (!tickerRecord) {
    console.error(`❌ Ticker ${ticker} not found in database`);
    return;
  }

  const currentPrice = tickerRecord.lastPrice || 0;
  const dbPrevClose = tickerRecord.latestPrevClose || 0;
  const storedChangePct = tickerRecord.lastChangePct;

  console.log(`   Current Price: $${currentPrice.toFixed(2)}`);
  console.log(`   DB previousClose: $${dbPrevClose.toFixed(2)}`);
  console.log(`   Stored % change: ${storedChangePct !== null ? `${storedChangePct >= 0 ? '+' : ''}${storedChangePct.toFixed(2)}%` : 'null'}`);

  // Fetch correct value from Polygon
  let correctPrevClose: number | null = null;
  try {
    correctPrevClose = await getPreviousClose(ticker);
  } catch (error) {
    console.error(`❌ Error fetching previous close for ${ticker}:`, error);
    return;
  }

  if (!correctPrevClose || correctPrevClose <= 0) {
    console.error(`❌ Could not fetch correct previous close for ${ticker}`);
    return;
  }

  console.log(`   Polygon API previousClose: $${correctPrevClose.toFixed(2)}`);

  // Calculate what % change should be
  let calculatedChangePct = 0;
  if (currentPrice > 0 && correctPrevClose > 0) {
    calculatedChangePct = ((currentPrice / correctPrevClose) - 1) * 100;
  }
  console.log(`   Calculated % change (with correct prevClose): ${calculatedChangePct >= 0 ? '+' : ''}${calculatedChangePct.toFixed(2)}%`);

  // Compare
  const diff = Math.abs(dbPrevClose - correctPrevClose);
  const diffPercent = dbPrevClose > 0 ? (diff / dbPrevClose) * 100 : 0;

  if (diff > 0.01) {
    console.log(`   ⚠️  MISMATCH detected: Difference = $${diff.toFixed(2)} (${diffPercent.toFixed(2)}%)`);
    
    if (currentPrice > 0) {
      // Calculate what % change would be with wrong prevClose
      const wrongChangePct = ((currentPrice / dbPrevClose) - 1) * 100;
      const changePctDiff = Math.abs(calculatedChangePct - wrongChangePct);
      console.log(`   ⚠️  Wrong % change would be: ${wrongChangePct >= 0 ? '+' : ''}${wrongChangePct.toFixed(2)}% (diff: ${changePctDiff.toFixed(2)}%)`);
    }

    console.log(`   🔧 Fixing...`);
    
    // Get last trading day
    const today = createETDate(getDateET());
    const lastTradingDay = getLastTradingDay(today);

    // Update Ticker table
    await prisma.ticker.update({
      where: { symbol: ticker },
      data: {
        latestPrevClose: correctPrevClose,
        latestPrevCloseDate: lastTradingDay,
        updatedAt: new Date()
      }
    });

    // Update DailyRef table
    await prisma.dailyRef.upsert({
      where: {
        symbol_date: {
          symbol: ticker,
          date: lastTradingDay
        }
      },
      update: {
        previousClose: correctPrevClose,
        updatedAt: new Date()
      },
      create: {
        symbol: ticker,
        date: lastTradingDay,
        previousClose: correctPrevClose
      }
    });

    // Update Redis cache
    try {
      const todayStr = getDateET();
      await setPrevClose(todayStr, ticker, correctPrevClose);
      console.log(`   ✅ Updated Redis cache`);
    } catch (error) {
      console.warn(`   ⚠️  Failed to update Redis cache:`, error);
    }

    console.log(`   ✅ FIXED: Updated ${ticker} from $${dbPrevClose} to $${correctPrevClose}`);
    console.log(`   ✅ New % change: ${calculatedChangePct >= 0 ? '+' : ''}${calculatedChangePct.toFixed(2)}%`);
  } else {
    console.log(`   ✅ OK: Values match (difference = $${diff.toFixed(4)})`);
  }
}

async function main() {
  const tickers = process.argv.slice(2);

  if (tickers.length === 0) {
    console.error('Usage: npx tsx scripts/fix-portfolio-tickers.ts TICKER1 TICKER2 ...');
    console.error('Example: npx tsx scripts/fix-portfolio-tickers.ts ULTA META AMZN SNPS ASML GOOGL ALGN');
    process.exit(1);
  }

  console.log(`🔍 Checking and fixing previousClose for: ${tickers.join(', ')}`);

  for (const ticker of tickers) {
    await checkAndFixTicker(ticker.toUpperCase());
    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n✅ Done!');
  console.log('\n💡 Tip: Refresh your browser to see updated values in portfolio');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
