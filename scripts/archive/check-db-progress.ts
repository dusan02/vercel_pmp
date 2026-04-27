/**
 * Check Database Progress
 * 
 * Checks if worker is saving data to database
 * (works even with in-memory Redis cache)
 * 
 * Usage: tsx scripts/check-db-progress.ts
 */

import { prisma } from '../src/lib/db/prisma';
import { getAllTrackedTickers } from '../src/lib/utils/universeHelpers';
import { detectSession, nowET } from '../src/lib/utils/timeUtils';

async function checkDBProgress() {
  console.log('\n📊 Database Progress Check\n');
  console.log('='.repeat(60));
  
  try {
    // Get all tracked tickers
    const allTickers = await getAllTrackedTickers();
    console.log(`Total tracked tickers: ${allTickers.length}`);
    
    // Check session prices in DB
    const session = detectSession(nowET());
    const dbSession = session === 'live' ? 'regular' : session;
    
    const sessionPrices = await prisma.sessionPrice.findMany({
      where: {
        symbol: { in: allTickers },
        session: dbSession
      },
      select: {
        symbol: true,
        lastPrice: true,
        lastTs: true
      },
      orderBy: { lastTs: 'desc' },
      distinct: ['symbol']
    });
    
    const uniqueSymbols = new Set(sessionPrices.map(sp => sp.symbol));
    const count = uniqueSymbols.size;
    const percentage = Math.round((count / allTickers.length) * 100);
    
    console.log(`\nSession Prices in DB (${dbSession}):`);
    console.log(`  - Found: ${count} unique tickers`);
    console.log(`  - Expected: ${allTickers.length} tickers`);
    console.log(`  - Progress: ${percentage}%`);
    
    if (count > 0) {
      console.log(`\n✅ Worker is saving data to database!`);
      console.log(`   Sample tickers: ${Array.from(uniqueSymbols).slice(0, 10).join(', ')}`);
      
      // Check recent updates
      const recentCount = sessionPrices.filter(sp => {
        if (!sp.lastTs) return false;
        const age = Date.now() - sp.lastTs.getTime();
        return age < 600000; // Last 10 minutes
      }).length;
      
      console.log(`\nRecent updates (last 10 min): ${recentCount} tickers`);
      
      if (recentCount > 0) {
        console.log(`✅ Worker is actively updating data!`);
      }
    } else {
      console.log(`\n⚠️  No data in database yet.`);
      console.log(`   Worker may still be starting or has an issue.`);
    }
    
    // Check Ticker table
    const tickerCount = await prisma.ticker.count({
      where: {
        symbol: { in: allTickers }
      }
    });
    
    console.log(`\nTickers in DB: ${tickerCount}/${allTickers.length}`);
    
  } catch (error) {
    console.error('❌ Error checking DB progress:', error);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('='.repeat(60));
}

checkDBProgress().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

