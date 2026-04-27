import { prisma } from '../src/lib/db/prisma';

async function check() {
  try {
    const tickerCount = await prisma.ticker.count();
    const withPrice = await prisma.ticker.count({ 
      where: { lastPrice: { not: null } } 
    });
    const withMarketCap = await prisma.ticker.count({ 
      where: { lastMarketCap: { not: null } } 
    });
    
    const recent = await prisma.sessionPrice.count({ 
      where: { 
        lastTs: { gte: new Date(Date.now() - 600000) } // Last 10 min
      } 
    });
    
    const recentTickers = await prisma.ticker.count({
      where: {
        lastPriceUpdated: { gte: new Date(Date.now() - 600000) }
      }
    });
    
    console.log('\n📊 Database Status:\n');
    console.log(`Total tickers: ${tickerCount}`);
    console.log(`Tickers with price: ${withPrice}`);
    console.log(`Tickers with market cap: ${withMarketCap}`);
    console.log(`Recent SessionPrice updates (last 10min): ${recent}`);
    console.log(`Recent Ticker updates (last 10min): ${recentTickers}`);
    
    if (recent > 0 || recentTickers > 0) {
      console.log('\n✅ Workers are actively updating data!');
    } else {
      console.log('\n⚠️  No recent updates. Workers may still be starting...');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

check();

