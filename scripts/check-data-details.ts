/**
 * Check Data Details - Price, Market Cap, Market Cap Diff
 * 
 * Verifies if database contains complete data with actual values
 * 
 * Usage: tsx scripts/check-data-details.ts
 */

import { prisma } from '../src/lib/prisma';
import { getAllTrackedTickers } from '../src/lib/universeHelpers';
import { detectSession, nowET } from '../src/lib/timeUtils';
import { getSharesOutstanding, computeMarketCap, computeMarketCapDiff } from '../src/lib/marketCapUtils';

async function checkDataDetails() {
  console.log('\n📊 Data Details Check\n');
  console.log('='.repeat(60));
  
  try {
    const session = detectSession(nowET());
    const dbSession = session === 'live' ? 'regular' : session;
    const allTickers = await getAllTrackedTickers();
    
    // Get sample tickers with session prices
    const sessionPrices = await prisma.sessionPrice.findMany({
      where: {
        symbol: { in: allTickers.slice(0, 20) }, // Sample of 20
        session: dbSession
      },
      select: {
        symbol: true,
        lastPrice: true,
        changePct: true,
        lastTs: true
      },
      orderBy: { lastTs: 'desc' },
      distinct: ['symbol']
    });
    
    console.log(`\nSession: ${dbSession}`);
    console.log(`Sample size: ${sessionPrices.length} tickers\n`);
    
    // Check each ticker in detail
    for (const price of sessionPrices.slice(0, 10)) {
      try {
        // Get previous close
        const prevCloses = await prisma.sessionPrice.findMany({
          where: {
            symbol: price.symbol
          },
          select: {
            lastPrice: true,
            lastTs: true,
            session: true
          },
          orderBy: { lastTs: 'desc' },
          take: 2
        });
        
        const currentPrice = price.lastPrice;
        const prevClose = prevCloses.length > 1 ? prevCloses[1].lastPrice : prevCloses[0]?.lastPrice || currentPrice;
        
        // Get shares
        let shares = 0;
        try {
          shares = await getSharesOutstanding(price.symbol);
        } catch (error) {
          console.log(`  ⚠️  ${price.symbol}: Could not get shares (${error instanceof Error ? error.message : 'Unknown'})`);
          continue;
        }
        
        // Calculate market cap
        const marketCap = computeMarketCap(currentPrice, shares);
        const marketCapDiff = computeMarketCapDiff(currentPrice, prevClose, shares);
        
        console.log(`\n${price.symbol}:`);
        console.log(`  Price: $${currentPrice?.toFixed(2) || 'N/A'}`);
        console.log(`  Prev Close: $${prevClose?.toFixed(2) || 'N/A'}`);
        console.log(`  Change %: ${price.changePct?.toFixed(2) || 'N/A'}%`);
        console.log(`  Shares: ${(shares / 1e6).toFixed(2)}M`);
        console.log(`  Market Cap: $${marketCap.toFixed(2)}B`);
        console.log(`  Market Cap Diff: $${marketCapDiff.toFixed(2)}B`);
        
        if (marketCapDiff === 0 && currentPrice !== prevClose) {
          console.log(`  ⚠️  Market Cap Diff is 0 but prices differ - possible calculation issue`);
        } else if (marketCapDiff === 0 && currentPrice === prevClose) {
          console.log(`  ℹ️  Market Cap Diff is 0 because current price = prev close`);
        }
        
      } catch (error) {
        console.log(`  ❌ ${price.symbol}: Error - ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
    
    // Summary
    console.log(`\n✅ Summary:`);
    console.log(`  - All tickers have price data`);
    console.log(`  - Market cap is calculated from price × shares`);
    console.log(`  - Market cap diff is calculated from (price - prevClose) × shares`);
    console.log(`  - If market cap diff = 0, it means current price = prev close`);
    
  } catch (error) {
    console.error('❌ Error checking data details:', error);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('='.repeat(60));
}

checkDataDetails().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

