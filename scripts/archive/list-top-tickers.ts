import { prisma } from '../src/lib/db/prisma';

async function listTop() {
  const tickers = await prisma.ticker.findMany({
    orderBy: { lastMarketCap: 'desc' },
    take: 50,
    select: { symbol: true, lastMarketCap: true, lastPrice: true, sector: true, sharesOutstanding: true }
  });
  
  console.table(tickers);
}

listTop().catch(console.error).finally(() => prisma.$disconnect());
