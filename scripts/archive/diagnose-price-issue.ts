/**
 * Diagnose why prices are stale or incorrect
 * Checks DB, SessionPrice, and Polygon API
 * 
 * Usage: npx tsx scripts/diagnose-price-issue.ts TICKER1 TICKER2 ...
 * Example: npx tsx scripts/diagnose-price-issue.ts ULTA MSFT
 */

import { prisma } from '../src/lib/db/prisma';
import { nowET, getDateET, createETDate } from '../src/lib/utils/dateET';
import { detectSession } from '../src/lib/utils/timeUtils';
import { getPricingState } from '../src/lib/utils/pricingStateMachine';

async function fetchPolygonPrice(ticker: string): Promise<{ price: number; timestamp: Date } | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results) {
      const tickerData = data.results;
      const price = tickerData.day?.c || tickerData.lastQuote?.p || tickerData.lastTrade?.p || 0;
      const timestamp = tickerData.lastTrade?.t 
        ? new Date(tickerData.lastTrade.t) 
        : new Date();

      return { price, timestamp };
    }
  } catch (error) {
    console.error(`Error fetching Polygon price for ${ticker}:`, error);
  }

  return null;
}

async function diagnoseTicker(ticker: string) {
  console.log('='.repeat(80));
  console.log(`🔍 DIAGNÓZA: ${ticker}`);
  console.log('='.repeat(80));
  console.log('');

  const etNow = nowET();
  const session = detectSession(etNow);
  const pricingState = getPricingState(etNow);
  const dateET = getDateET(etNow);
  const today = createETDate(dateET);

  // 1. DB Ticker table
  const dbTicker = await prisma.ticker.findUnique({
    where: { symbol: ticker },
    select: {
      lastPrice: true,
      lastPriceUpdated: true,
      latestPrevClose: true,
      lastChangePct: true
    }
  });

  console.log('📊 DATABASE (Ticker table):');
  if (dbTicker) {
    const ageMs = dbTicker.lastPriceUpdated 
      ? etNow.getTime() - dbTicker.lastPriceUpdated.getTime()
      : Infinity;
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);
    const isStale = ageHours > 2;

    console.log(`   Price: $${dbTicker.lastPrice || 0}`);
    console.log(`   Last Updated: ${dbTicker.lastPriceUpdated?.toISOString() || 'N/A'}`);
    console.log(`   Age: ${ageDays > 0 ? ageDays + 'd ' : ''}${ageHours % 24}h ${Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60))}m`);
    console.log(`   Status: ${isStale ? '⚠️ STALE' : '✅ OK'}`);
    console.log(`   PrevClose: $${dbTicker.latestPrevClose || 0}`);
    console.log(`   Change%: ${dbTicker.lastChangePct?.toFixed(2) || 0}%`);
  } else {
    console.log('   ❌ Not found in DB');
  }
  console.log('');

  // 2. SessionPrice records
  const lookback = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
  const sessionPrices = await prisma.sessionPrice.findMany({
    where: {
      symbol: ticker,
      date: { gte: lookback, lte: today }
    },
    orderBy: { lastTs: 'desc' },
    select: {
      date: true,
      session: true,
      lastPrice: true,
      lastTs: true,
      changePct: true
    }
  });

  console.log('📅 SESSION PRICE records (last 2 days):');
  if (sessionPrices.length > 0) {
    sessionPrices.slice(0, 5).forEach((sp, idx) => {
      const ageMs = etNow.getTime() - sp.lastTs.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      console.log(`   ${idx + 1}. ${sp.date.toISOString().split('T')[0]} | ${sp.session} | $${sp.lastPrice} | ${ageDays > 0 ? ageDays + 'd ' : ''}${ageHours % 24}h ago | ${sp.changePct?.toFixed(2) || 0}%`);
    });
  } else {
    console.log('   ⚠️  No SessionPrice records found');
  }
  console.log('');

  // 3. Polygon API
  console.log('🌐 POLYGON API:');
  const polygonData = await fetchPolygonPrice(ticker);
  if (polygonData) {
    const ageMs = etNow.getTime() - polygonData.timestamp.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    console.log(`   Price: $${polygonData.price}`);
    console.log(`   Timestamp: ${polygonData.timestamp.toISOString()}`);
    console.log(`   Age: ${ageHours}h ${Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60))}m`);
  } else {
    console.log('   ❌ Failed to fetch from Polygon API');
  }
  console.log('');

  // 4. Comparison
  console.log('🔍 COMPARISON:');
  if (dbTicker && polygonData) {
    const dbPrice = dbTicker.lastPrice || 0;
    const polygonPrice = polygonData.price;
    const diff = Math.abs(dbPrice - polygonPrice);
    const diffPct = dbPrice > 0 ? (diff / dbPrice) * 100 : 0;

    console.log(`   DB Price: $${dbPrice}`);
    console.log(`   Polygon Price: $${polygonPrice}`);
    console.log(`   Difference: $${diff.toFixed(2)} (${diffPct.toFixed(2)}%)`);

    if (diff > 0.01) {
      console.log(`   ⚠️  PRICE MISMATCH! DB is ${dbPrice < polygonPrice ? 'LOWER' : 'HIGHER'} than Polygon`);
    } else {
      console.log(`   ✅ Prices match`);
    }
  }

  // Check if SessionPrice is newer than Ticker.lastPrice
  if (dbTicker && sessionPrices.length > 0) {
    const latestSp = sessionPrices[0]!;
    if (dbTicker.lastPriceUpdated && latestSp.lastTs > dbTicker.lastPriceUpdated) {
      console.log(`   ⚠️  SessionPrice (${latestSp.lastTs.toISOString()}) is NEWER than Ticker.lastPriceUpdated (${dbTicker.lastPriceUpdated.toISOString()})`);
      console.log(`   ⚠️  This means stockService will use SessionPrice: $${latestSp.lastPrice} instead of Ticker.lastPrice: $${dbTicker.lastPrice}`);
    }
  }
  console.log('');

  // 5. Pricing State
  console.log('⚙️  PRICING STATE:');
  console.log(`   Session: ${session}`);
  console.log(`   State: ${pricingState.state}`);
  console.log(`   Can Ingest: ${pricingState.canIngest ? '✅ YES' : '❌ NO'}`);
  console.log(`   Can Overwrite: ${pricingState.canOverwrite ? '✅ YES' : '❌ NO'}`);
  console.log(`   Use Frozen Price: ${pricingState.useFrozenPrice ? '✅ YES' : '❌ NO'}`);
  console.log('');

  // 6. Recommendations
  console.log('💡 RECOMMENDATIONS:');
  if (dbTicker && polygonData) {
    const diff = Math.abs((dbTicker.lastPrice || 0) - polygonData.price);
    if (diff > 0.01) {
      console.log(`   1. Run force-update-prices.ts to update ${ticker}`);
      console.log(`      npx tsx scripts/force-update-prices.ts ${ticker}`);
    }
  }

  if (!pricingState.canIngest) {
    console.log(`   2. Worker cannot ingest (frozen state). Use force-update-prices.ts with force=true`);
  }

  if (sessionPrices.length > 0 && dbTicker?.lastPriceUpdated) {
    const latestSp = sessionPrices[0]!;
    if (latestSp.lastTs > dbTicker.lastPriceUpdated && latestSp.lastPrice !== dbTicker.lastPrice) {
      console.log(`   3. SessionPrice is newer but different. Consider syncing Ticker.lastPrice with SessionPrice`);
    }
  }
  console.log('');
}

async function main() {
  const tickers = process.argv.slice(2);

  if (tickers.length === 0) {
    console.error('Usage: npx tsx scripts/diagnose-price-issue.ts TICKER1 TICKER2 ...');
    console.error('Example: npx tsx scripts/diagnose-price-issue.ts ULTA MSFT');
    process.exit(1);
  }

  for (const ticker of tickers.map(t => t.toUpperCase())) {
    await diagnoseTicker(ticker);
  }
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
