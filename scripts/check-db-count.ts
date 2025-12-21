import { prisma } from '../src/lib/db/prisma';

async function checkCounts() {
  try {
    const tickerCount = await prisma.ticker.count();
    const sessionPriceCount = await prisma.sessionPrice.count();
    const dailyRefCount = await prisma.dailyRef.count();
    const earningsCount = await prisma.earningsCalendar.count();

    console.log('=== Database Counts ===');
    console.log(`Ticker (firmy): ${tickerCount}`);
    console.log(`SessionPrice: ${sessionPriceCount}`);
    console.log(`DailyRef: ${dailyRefCount}`);
    console.log(`EarningsCalendar: ${earningsCount}`);
    
    if (tickerCount > 0) {
      const sample = await prisma.ticker.findMany({ take: 5 });
      console.log('\n=== Sample Tickers ===');
      sample.forEach(t => {
        console.log(`  ${t.symbol}: ${t.name || 'N/A'} (${t.sector || 'N/A'})`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCounts();

