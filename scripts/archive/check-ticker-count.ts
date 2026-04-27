/**
 * Check Ticker Count in Database
 * 
 * Shows detailed count of tickers in the database
 * 
 * Usage: tsx scripts/check-ticker-count.ts
 */

import { prisma } from '../src/lib/db/prisma';
import { getAllTrackedTickers } from '../src/lib/utils/universeHelpers';

async function checkTickerCount() {
  console.log('\n📊 Ticker Count Check\n');
  console.log('='.repeat(60));
  
  try {
    // Total tickers in DB
    const totalTickers = await prisma.ticker.count();
    console.log(`\nTotal Tickers in DB: ${totalTickers}`);
    
    // Tracked tickers (from universe)
    const trackedTickers = await getAllTrackedTickers();
    console.log(`Tracked Tickers (from universe): ${trackedTickers.length}`);
    
    // Tickers in DB that are tracked
    const trackedInDB = await prisma.ticker.count({
      where: {
        symbol: { in: trackedTickers }
      }
    });
    console.log(`Tracked Tickers in DB: ${trackedInDB}/${trackedTickers.length}`);
    
    // Session prices count
    const sessionPrices = await prisma.sessionPrice.groupBy({
      by: ['symbol'],
      _count: {
        symbol: true
      }
    });
    console.log(`\nTickers with Session Prices: ${sessionPrices.length}`);
    
    // Check by session
    const session = 'after'; // Current session
    const sessionCount = await prisma.sessionPrice.findMany({
      where: {
        session: session
      },
      select: {
        symbol: true
      },
      distinct: ['symbol']
    });
    console.log(`Tickers with ${session} session data: ${sessionCount.length}`);
    
    // Sample tickers
    const sampleTickers = await prisma.ticker.findMany({
      take: 10,
      select: {
        symbol: true,
        name: true
      },
      orderBy: {
        symbol: 'asc'
      }
    });
    
    console.log(`\nSample Tickers (first 10):`);
    sampleTickers.forEach(t => {
      console.log(`  - ${t.symbol}: ${t.name || 'N/A'}`);
    });
    
    // Check for SP500 tickers (if we have a way to identify them)
    const sp500Count = await prisma.ticker.count({
      where: {
        symbol: { in: trackedTickers.slice(0, 503) } // First 503 should be SP500
      }
    });
    console.log(`\nSP500 Tickers in DB: ${sp500Count}/503`);
    
  } catch (error) {
    console.error('❌ Error checking ticker count:', error);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('='.repeat(60));
}

checkTickerCount().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

