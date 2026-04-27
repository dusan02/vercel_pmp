/**
 * Script to diagnose and fix previousClose issues in production
 * Checks if previousClose values are correct by comparing with Polygon API
 */

import { prisma } from '../src/lib/db/prisma';
import { getDateET, createETDate } from '../src/lib/utils/dateET';
import { getLastTradingDay } from '../src/lib/utils/timeUtils';
import { setPrevClose } from '../src/lib/redis/operations';

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

async function fetchPreviousCloseFromPolygon(ticker: string): Promise<{ price: number; timestamp: number } | null> {
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

    return {
      price: data.results[0].c,
      timestamp: data.results[0].t
    };
  } catch (error) {
    console.error(`❌ Error fetching previous close for ${ticker}:`, error);
    return null;
  }
}

async function checkTicker(ticker: string, fix: boolean = false) {
  console.log(`\n🔍 Checking ${ticker}...`);

  // 1. Get current values from DB
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
    return { ticker, needsFix: false, error: 'not_found' };
  }

  // 2. Get current price
  const currentPrice = tickerRecord.lastPrice || 0;
  const dbPrevClose = tickerRecord.latestPrevClose || 0;
  const dbPrevCloseDate = tickerRecord.latestPrevCloseDate;
  const storedChangePct = tickerRecord.lastChangePct;

  console.log(`   Current Price: $${currentPrice.toFixed(2)}`);
  console.log(`   DB previousClose: $${dbPrevClose.toFixed(2)} (date: ${dbPrevCloseDate?.toISOString().split('T')[0] || 'null'})`);
  console.log(`   Stored % change: ${storedChangePct !== null ? `${storedChangePct >= 0 ? '+' : ''}${storedChangePct.toFixed(2)}%` : 'null'}`);

  // 3. Fetch correct value from Polygon
  const polygonData = await fetchPreviousCloseFromPolygon(ticker);

  if (!polygonData) {
    console.error(`❌ Could not fetch correct previous close for ${ticker}`);
    return { ticker, needsFix: false, error: 'fetch_failed' };
  }

  const correctPrevClose = polygonData.price;
  const polygonTimestamp = polygonData.timestamp;
  const polygonDate = new Date(polygonTimestamp);

  console.log(`   Polygon API previousClose: $${correctPrevClose.toFixed(2)} (date: ${polygonDate.toISOString().split('T')[0]})`);

  // 4. Calculate what the % change should be
  let calculatedChangePct = 0;
  if (currentPrice > 0 && correctPrevClose > 0) {
    calculatedChangePct = ((currentPrice / correctPrevClose) - 1) * 100;
  }

  console.log(`   Calculated % change (with correct prevClose): ${calculatedChangePct >= 0 ? '+' : ''}${calculatedChangePct.toFixed(2)}%`);

  // 5. Compare
  const diff = Math.abs(dbPrevClose - correctPrevClose);
  const diffPercent = dbPrevClose > 0 ? (diff / dbPrevClose) * 100 : 0;

  if (diff > 0.01) { // More than 1 cent difference
    console.log(`   ⚠️  MISMATCH detected: Difference = $${diff.toFixed(2)} (${diffPercent.toFixed(2)}%)`);
    
    if (currentPrice > 0) {
      // Calculate what % change would be with wrong prevClose
      const wrongChangePct = ((currentPrice / dbPrevClose) - 1) * 100;
      const changePctDiff = Math.abs(calculatedChangePct - wrongChangePct);
      console.log(`   ⚠️  Wrong % change would be: ${wrongChangePct >= 0 ? '+' : ''}${wrongChangePct.toFixed(2)}% (diff: ${changePctDiff.toFixed(2)}%)`);
    }

    if (fix) {
      console.log(`   🔧 Fixing...`);
      
      // Get last trading day for the date
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
      return { ticker, needsFix: true, fixed: true, diff, diffPercent };
    } else {
      return { ticker, needsFix: true, fixed: false, diff, diffPercent };
    }
  } else {
    console.log(`   ✅ OK: Values match (difference = $${diff.toFixed(4)})`);
    return { ticker, needsFix: false, diff, diffPercent };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const tickers = args.filter(arg => !arg.startsWith('--'));

  if (tickers.length === 0) {
    console.error('Usage: npx tsx scripts/check-prod-prevclose-issue.ts [TICKER1] [TICKER2] ... [--fix]');
    console.error('Example: npx tsx scripts/check-prod-prevclose-issue.ts MSFT --fix');
    console.error('Example: npx tsx scripts/check-prod-prevclose-issue.ts MSFT NVDA AAPL');
    process.exit(1);
  }

  console.log(`🔍 Checking previousClose for: ${tickers.join(', ')}`);
  if (fix) {
    console.log(`⚠️  FIX MODE: Will update incorrect values`);
  } else {
    console.log(`ℹ️  DRY RUN: Use --fix to actually update values`);
  }

  const results = [];
  for (const ticker of tickers) {
    const result = await checkTicker(ticker.toUpperCase(), fix);
    results.push(result);
    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n📊 Summary:');
  const needsFix = results.filter(r => r.needsFix);
  const fixed = results.filter(r => r.fixed);
  
  if (needsFix.length > 0) {
    console.log(`\n⚠️  ${needsFix.length} ticker(s) need fixing:`);
    needsFix.forEach(r => {
      console.log(`   - ${r.ticker}: diff = $${r.diff?.toFixed(2) || 'N/A'} (${r.diffPercent?.toFixed(2) || 'N/A'}%)`);
    });
  } else {
    console.log(`\n✅ All tickers have correct previousClose values`);
  }

  if (fix && fixed.length > 0) {
    console.log(`\n✅ Fixed ${fixed.length} ticker(s)`);
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
