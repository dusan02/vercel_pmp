import { PrismaClient } from '@prisma/client';

async function checkInsensitive() {
  const prisma = new PrismaClient();
  try {
    const search = 'MNDT';
    const tickers = await prisma.ticker.findMany({
      where: {
        symbol: {
          contains: search
        }
      }
    });
    console.log(`Found ${tickers.length} tickers containing "${search}":`);
    console.log(JSON.stringify(tickers, null, 2));

    // Also check lowercase
    const tickersLower = await prisma.ticker.findMany({
      where: {
        symbol: {
          equals: search.toLowerCase()
        }
      }
    });
    console.log(`Found ${tickersLower.length} tickers with lowercase "${search.toLowerCase()}":`);
    console.log(JSON.stringify(tickersLower, null, 2));

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkInsensitive();
