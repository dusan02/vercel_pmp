
import { prisma } from '../src/lib/db/prisma';

async function main() {
  const tickers = ['AAPL'];
  
  console.log('Checking DB for:', tickers.join(', '));
  
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
    } else {
      console.log('Ticker Table: Not found');
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });

