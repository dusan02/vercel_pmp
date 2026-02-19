/**
 * Script to fix incorrect closing prices for specific tickers
 * Uses Polygon /prev endpoint as the source of truth
 */

import { prisma } from '../src/lib/db/prisma';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

interface PolygonPrevResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: Array<{
    T: string; // ticker
    v: number; // volume
    vw: number; // volume weighted average price
    o: number; // open
    c: number; // close
    h: number; // high
    l: number; // low
    t: number; // timestamp
    n: number; // number of transactions
  }>;
  status: string;
  request_id: string;
  count: number;
}

async function fetchPreviousCloseFromPolygon(ticker: string): Promise<number | null> {
  if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY not set');
    return null;
  }

  try {
    // Use /prev endpoint - most reliable source of truth
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      console.error(`❌ Polygon API error for ${ticker}: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: PolygonPrevResponse = await response.json();

    if (!data?.results?.[0]?.c || data.results[0].c <= 0) {
      console.error(`❌ No valid previous close found for ${ticker}`);
      return null;
    }

    return data.results[0].c;
  } catch (error) {
    console.error(`❌ Error fetching previous close for ${ticker}:`, error);
    return null;
  }
}

async function fixClosingPrice(ticker: string) {
  console.log(`\n🔍 Checking ${ticker}...`);

  // 1. Get current value from DB
  const tickerRecord = await prisma.ticker.findUnique({
    where: { symbol: ticker },
    select: {
      symbol: true,
      latestPrevClose: true,
      latestPrevCloseDate: true
    }
  });

  if (!tickerRecord) {
    console.error(`❌ Ticker ${ticker} not found in database`);
    return;
  }

  console.log(`   Current DB value: latestPrevClose = $${tickerRecord.latestPrevClose}, date = ${tickerRecord.latestPrevCloseDate?.toISOString() || 'null'}`);

  // 2. Fetch correct value from Polygon
  const correctPrevClose = await fetchPreviousCloseFromPolygon(ticker);

  if (!correctPrevClose) {
    console.error(`❌ Could not fetch correct previous close for ${ticker}`);
    return;
  }

  console.log(`   Polygon API value: $${correctPrevClose}`);

  // 3. Compare and fix if different
  const diff = Math.abs((tickerRecord.latestPrevClose ?? 0) - correctPrevClose);
  const diffPercent = (diff / correctPrevClose) * 100;

  if (diff > 0.01) { // More than 1 cent difference
    console.log(`   ⚠️  MISMATCH detected: Difference = $${diff.toFixed(2)} (${diffPercent.toFixed(2)}%)`);

    // Get last trading day for the date
    const { getLastTradingDay } = await import('../src/lib/utils/timeUtils');
    const { getDateET, createETDate } = await import('../src/lib/utils/dateET');
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
      const { setPrevClose } = await import('../src/lib/redis/operations');
      const todayStr = getDateET();
      await setPrevClose(todayStr, ticker, correctPrevClose);
      console.log(`   ✅ Updated Redis cache`);
    } catch (error) {
      console.warn(`   ⚠️  Failed to update Redis cache:`, error);
    }

    console.log(`   ✅ FIXED: Updated ${ticker} from $${tickerRecord.latestPrevClose} to $${correctPrevClose}`);
  } else {
    console.log(`   ✅ OK: Values match (difference = $${diff.toFixed(4)})`);
  }
}

async function main() {
  const tickers = process.argv.slice(2);

  if (tickers.length === 0) {
    console.error('Usage: npx tsx scripts/fix-closing-price.ts TICKER1 TICKER2 ...');
    console.error('Example: npx tsx scripts/fix-closing-price.ts ORCL PLTR');
    process.exit(1);
  }

  console.log(`🔧 Fixing closing prices for: ${tickers.join(', ')}`);

  for (const ticker of tickers) {
    await fixClosingPrice(ticker.toUpperCase());
    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n✅ Done!');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

