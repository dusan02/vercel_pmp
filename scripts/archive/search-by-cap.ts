import { PrismaClient } from '@prisma/client';

async function searchByCap() {
  const prisma = new PrismaClient();
  try {
    const results = await prisma.ticker.findMany({
      where: {
        lastMarketCap: {
          gte: 460,
          lte: 461
        }
      }
    });
    console.log(`Found ${results.length} tickers with cap ~460B:`);
    console.table(results.map(r => ({
      symbol: r.symbol,
      cap: r.lastMarketCap,
      price: r.lastPrice,
      shares: r.sharesOutstanding,
      sector: r.sector
    })));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

searchByCap();
