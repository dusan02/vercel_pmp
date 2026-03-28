import { PrismaClient } from '@prisma/client';

async function checkDb(url: string) {
  console.log(`\n--- Checking ${url} ---`);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: url
      }
    }
  });

  try {
    const symbols = ['SRNE', 'MNDT', 'SJI', 'JWN', 'GPS', 'ATVI', 'PEAK', 'WRK'];
    const tickers = await prisma.ticker.findMany({
      where: {
        symbol: { in: symbols }
      },
      select: {
        symbol: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
        updatedAt: true
      }
    });

    console.log(`Found ${tickers.length} matching tickers.`);
    if (tickers.length > 0) {
      console.log(JSON.stringify(tickers, null, 2));
    }
  } catch (err) {
    console.error(`Error checking ${url}:`, err);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await checkDb('file:./prisma/data/premarket.db');
}

main().catch(console.error);
