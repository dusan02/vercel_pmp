import { PrismaClient } from '@prisma/client';

async function checkPremarketDB() {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: 'file:./prisma/data/premarket.db'
      }
    }
  });

  try {
    const symbols = ['MNDT', 'SRNE', 'SJI', 'JWN', 'GPS', 'ATVI', 'ANSS', 'PEAK', 'WRK'];
    const tickers = await client.ticker.findMany({
      where: { symbol: { in: symbols } }
    });
    
    console.log('Results from premarket.db:');
    console.table(tickers.map(t => ({
      symbol: t.symbol,
      name: t.name,
      sector: t.sector,
      industry: t.industry,
      marketCap: t.lastMarketCap,
      price: t.lastPrice,
      shares: t.sharesOutstanding
    })));
    
    const count = await client.ticker.count();
    const unknownSectors = await client.ticker.count({
      where: {
        OR: [
          { sector: 'Unknown' },
          { sector: null }
        ]
      }
    });
    console.log(`Total tickers: ${count}`);
    console.log(`Unknown/Null sectors: ${unknownSectors}`);
    
  } catch (e) {
    console.error('Error reading premarket.db:', e);
  } finally {
    await client.$disconnect();
  }
}

checkPremarketDB();
