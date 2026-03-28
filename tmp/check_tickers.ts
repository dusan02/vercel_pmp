import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

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
        sector: true,
        updatedAt: true
      }
    });

    console.log(`Found ${tickers.length} matching tickers.`);
    if (tickers.length > 0) {
      console.log(JSON.stringify(tickers, null, 2));
    } else {
      const allCount = await prisma.ticker.count();
      console.log(`Total tickers in DB: ${allCount}`);
      if (allCount > 0) {
        const sample = await prisma.ticker.findMany({ take: 5, select: { symbol: true } });
        console.log('Sample symbols:', sample.map(t => t.symbol));
      }
    }
  } catch (err) {
    console.error(`Error checking ${url}:`, err);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await checkDb('file:./dev.db');
  await checkDb('file:./prisma/data/premarket.db');
}

main().catch(console.error);
