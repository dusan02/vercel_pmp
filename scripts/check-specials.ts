import { prisma } from '../src/lib/db/prisma';

async function checkSpecials() {
  const symbols = ['MNDT', 'SRNE', 'SJI', 'JWN', 'GPS', 'ATVI', 'ANSS', 'PEAK', 'WRK'];
  const tickers = await prisma.ticker.findMany({
    where: { symbol: { in: symbols } }
  });
  
  console.log(JSON.stringify(tickers, null, 2));
}

checkSpecials().catch(console.error).finally(() => prisma.$disconnect());
