import { PrismaClient } from '@prisma/client';

async function checkPremaDB() {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: 'file:./data/prema.db'
      }
    }
  });

  try {
    const symbols = ['MNDT', 'SRNE', 'SJI', 'JWN', 'GPS', 'ATVI', 'ANSS', 'PEAK', 'WRK'];
    const tickers = await client.ticker.findMany({
      where: { symbol: { in: symbols } }
    });
    
    console.log('Results from prema.db:');
    console.log(JSON.stringify(tickers, null, 2));
    
    const count = await client.ticker.count();
    console.log(`Total tickers in prema.db: ${count}`);
    
  } catch (e) {
    console.error('Error reading prema.db:', e);
  } finally {
    await client.$disconnect();
  }
}

checkPremaDB();
