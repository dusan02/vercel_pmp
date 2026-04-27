
import { prisma } from '../src/lib/db/prisma';

async function main() {
  const tickers = ['GBTC', 'AAPL'];

  console.log('Checking DB for:', tickers.join(', '));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const symbol of tickers) {
    console.log(`\n--- ${symbol} ---`);

    // Check Ticker table
    const ticker = await prisma.ticker.findUnique({
      where: { symbol }
    });

    if (ticker) {
      console.log('Ticker Table:');
      console.log(`  Last Price: ${ticker.lastPrice}`);
      console.log(`  Last Change %: ${ticker.lastChangePct}`);
      console.log(`  Latest Prev Close: ${ticker.latestPrevClose}`);
      console.log(`  Last Updated: ${ticker.lastPriceUpdated}`);
    } else {
      console.log('Ticker Table: Not found');
    }

    // Check SessionPrice
    const sessionPrices = await prisma.sessionPrice.findMany({
      where: {
        symbol,
        date: { gte: today }
      },
      orderBy: { lastTs: 'desc' },
      take: 5
    });

    console.log(`SessionPrice (today): ${sessionPrices.length} records`);
    sessionPrices.forEach(sp => {
      console.log(`  ${sp.session} | Price: ${sp.lastPrice} | Change: ${sp.changePct}% | Time: ${sp.lastTs}`);
    });

    // Check DailyRef
    const dailyRefs = await prisma.dailyRef.findMany({
      where: {
        symbol,
        date: { gte: today }
      },
      orderBy: { date: 'desc' }
    });

    console.log(`DailyRef (today): ${dailyRefs.length} records`);
    dailyRefs.forEach(dr => {
      console.log(`  Date: ${dr.date.toISOString().split('T')[0]} | PrevClose: ${dr.previousClose} | RegularClose: ${dr.regularClose}`);
    });
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
