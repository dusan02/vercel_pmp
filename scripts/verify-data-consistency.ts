/**
 * Verify Data Consistency Script
 * Checks if GOOGL data is consistent between database, tables API, and heatmap API
 */

import { prisma } from '../src/lib/db/prisma';
import { computePercentChange, computeMarketCapDiff, computeMarketCap } from '../src/lib/utils/marketCapUtils';

async function verifyDataConsistency() {
  console.log('\n🔍 Verifying Data Consistency for GOOGL\n');
  console.log('='.repeat(80));

  try {
    const ticker = 'GOOGL';

    // 1. Check database (Ticker table)
    console.log('\n1️⃣ Database (Ticker table):');
    const tickerData = await prisma.ticker.findUnique({
      where: { symbol: ticker },
      select: {
        symbol: true,
        name: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
        lastMarketCapDiff: true,
        latestPrevClose: true,
        sharesOutstanding: true,
        updatedAt: true,
      },
    });

    if (!tickerData) {
      console.log(`❌ ${ticker} not found in database`);
      return;
    }

    console.log(`  Price: $${tickerData.lastPrice || 0}`);
    console.log(`  Previous Close: $${tickerData.latestPrevClose || 0}`);
    console.log(`  % Change (DB): ${tickerData.lastChangePct || 0}%`);
    console.log(`  Market Cap: $${tickerData.lastMarketCap || 0}B`);
    console.log(`  Cap Diff (DB): $${tickerData.lastMarketCapDiff || 0}B`);
    console.log(`  Shares: ${tickerData.sharesOutstanding?.toLocaleString() || 'N/A'}`);
    console.log(`  Updated: ${tickerData.updatedAt.toISOString()}`);

    // Calculate expected values
    const currentPrice = tickerData.lastPrice || 0;
    const prevClose = tickerData.latestPrevClose || 0;
    const shares = tickerData.sharesOutstanding || 0;

    const expectedPercentChange = (currentPrice > 0 && prevClose > 0)
      ? computePercentChange(currentPrice, prevClose)
      : 0;
    const expectedMarketCapDiff = (currentPrice > 0 && prevClose > 0 && shares > 0)
      ? computeMarketCapDiff(currentPrice, prevClose, shares)
      : 0;
    const expectedMarketCap = (currentPrice > 0 && shares > 0)
      ? computeMarketCap(currentPrice, shares)
      : 0;

    console.log(`\n  📊 Calculated values (from currentPrice/prevClose):`);
    console.log(`  % Change (calculated): ${expectedPercentChange >= 0 ? '+' : ''}${expectedPercentChange.toFixed(2)}%`);
    console.log(`  Cap Diff (calculated): ${expectedMarketCapDiff >= 0 ? '+' : ''}$${expectedMarketCapDiff.toFixed(2)}B`);
    console.log(`  Market Cap (calculated): $${expectedMarketCap.toFixed(2)}B`);

    // 2. Check SessionPrice (last 24h)
    console.log('\n2️⃣ SessionPrice (last 24h):');
    const dayAgo = new Date();
    dayAgo.setHours(dayAgo.getHours() - 24);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sessionPrices = await prisma.sessionPrice.findMany({
      where: {
        symbol: ticker,
        date: { gte: dayAgo, lt: tomorrow },
      },
      orderBy: { lastTs: 'desc' },
      take: 1,
    });

    if (sessionPrices.length > 0) {
      const sp = sessionPrices[0];
      console.log(`  ✅ Found SessionPrice record`);
      console.log(`  Price: $${sp.lastPrice}`);
      console.log(`  % Change: ${sp.changePct >= 0 ? '+' : ''}${sp.changePct.toFixed(2)}%`);
      console.log(`  Date: ${sp.date.toISOString()}`);
      console.log(`  Last TS: ${sp.lastTs?.toISOString() || 'N/A'}`);
    } else {
      console.log(`  ⚠️ No SessionPrice records in last 24h`);
    }

    // 3. Check DailyRef (last 24h)
    console.log('\n3️⃣ DailyRef (last 24h):');
    const dailyRefs = await prisma.dailyRef.findMany({
      where: {
        symbol: ticker,
        date: { gte: dayAgo, lte: new Date() },
      },
      orderBy: { date: 'desc' },
      take: 1,
    });

    if (dailyRefs.length > 0) {
      const dr = dailyRefs[0];
      console.log(`  ✅ Found DailyRef record`);
      console.log(`  Previous Close: $${dr.previousClose}`);
      console.log(`  Date: ${dr.date.toISOString()}`);
    } else {
      console.log(`  ⚠️ No DailyRef records in last 24h`);
    }

    // 4. Test API endpoints
    console.log('\n4️⃣ Testing API Endpoints:');
    
    // Test /api/stocks endpoint
    try {
      const stocksUrl = `http://localhost:3000/api/stocks?tickers=${ticker}&project=pmp`;
      const stocksResponse = await fetch(stocksUrl);
      if (stocksResponse.ok) {
        const stocksData = await stocksResponse.json();
        if (stocksData.data && stocksData.data.length > 0) {
          const stock = stocksData.data[0];
          console.log(`  ✅ /api/stocks: Found ${ticker}`);
          console.log(`     Price: $${stock.currentPrice || 0}`);
          console.log(`     % Change: ${stock.percentChange >= 0 ? '+' : ''}${stock.percentChange.toFixed(2)}%`);
          console.log(`     Cap Diff: ${stock.marketCapDiff >= 0 ? '+' : ''}$${stock.marketCapDiff.toFixed(2)}B`);
          
          // Compare with calculated values
          const percentMatch = Math.abs(stock.percentChange - expectedPercentChange) < 0.01;
          const capDiffMatch = Math.abs((stock.marketCapDiff || 0) - expectedMarketCapDiff) < 0.01;
          console.log(`     % Change match: ${percentMatch ? '✅' : '❌'} (expected: ${expectedPercentChange.toFixed(2)}%)`);
          console.log(`     Cap Diff match: ${capDiffMatch ? '✅' : '❌'} (expected: ${expectedMarketCapDiff.toFixed(2)}B)`);
        } else {
          console.log(`  ⚠️ /api/stocks: No data returned`);
        }
      } else {
        console.log(`  ❌ /api/stocks: ${stocksResponse.status}`);
      }
    } catch (error) {
      console.log(`  ❌ /api/stocks: Error - ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test /api/heatmap endpoint
    try {
      const heatmapUrl = `http://localhost:3000/api/heatmap?force=true`;
      const heatmapResponse = await fetch(heatmapUrl);
      if (heatmapResponse.ok) {
        const heatmapData = await heatmapResponse.json();
        if (heatmapData.data && Array.isArray(heatmapData.data)) {
          const heatmapStock = heatmapData.data.find((s: any) => s.ticker === ticker);
          if (heatmapStock) {
            console.log(`  ✅ /api/heatmap: Found ${ticker}`);
            console.log(`     Price: $${heatmapStock.currentPrice || 0}`);
            console.log(`     % Change: ${heatmapStock.percentChange >= 0 ? '+' : ''}${heatmapStock.percentChange.toFixed(2)}%`);
            console.log(`     Cap Diff: ${heatmapStock.marketCapDiff >= 0 ? '+' : ''}$${heatmapStock.marketCapDiff.toFixed(2)}B`);
            
            // Compare with calculated values
            const percentMatch = Math.abs(heatmapStock.percentChange - expectedPercentChange) < 0.01;
            const capDiffMatch = Math.abs((heatmapStock.marketCapDiff || 0) - expectedMarketCapDiff) < 0.01;
            console.log(`     % Change match: ${percentMatch ? '✅' : '❌'} (expected: ${expectedPercentChange.toFixed(2)}%)`);
            console.log(`     Cap Diff match: ${capDiffMatch ? '✅' : '❌'} (expected: ${expectedMarketCapDiff.toFixed(2)}B)`);
          } else {
            console.log(`  ⚠️ /api/heatmap: ${ticker} not found in heatmap data`);
          }
        } else {
          console.log(`  ⚠️ /api/heatmap: No data returned`);
        }
      } else {
        console.log(`  ❌ /api/heatmap: ${heatmapResponse.status}`);
      }
    } catch (error) {
      console.log(`  ❌ /api/heatmap: Error - ${error instanceof Error ? error.message : String(error)}`);
    }

    // 5. Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 Summary:');
    console.log(`  Current Price: $${currentPrice}`);
    console.log(`  Previous Close: $${prevClose}`);
    console.log(`  Expected % Change: ${expectedPercentChange >= 0 ? '+' : ''}${expectedPercentChange.toFixed(2)}%`);
    console.log(`  Expected Cap Diff: ${expectedMarketCapDiff >= 0 ? '+' : ''}$${expectedMarketCapDiff.toFixed(2)}B`);
    
    if (expectedPercentChange > 5) {
      console.log(`\n  ⚠️ WARNING: % Change is ${expectedPercentChange.toFixed(2)}% - seems unusually high!`);
      console.log(`     This might indicate stale previousClose data or incorrect calculation.`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDataConsistency();

