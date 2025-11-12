import { PrismaClient } from '@prisma/client';
import { getProjectTickers } from '@/data/defaultTickers';

const prisma = new PrismaClient();

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const top50 = getProjectTickers('pmp', 50);
  console.log(`Top 50 tickers: ${top50.length}`);
  
  const inDb = await prisma.sessionPrice.findMany({
    where: {
      symbol: { in: top50 },
      date: today
    },
    select: { symbol: true }
  });
  
  const inDbSymbols = new Set(inDb.map(r => r.symbol));
  const missingTickers = top50.filter(t => !inDbSymbols.has(t));
  
  console.log(`\nTop 50 tickers in DB: ${inDb.length}/50`);
  console.log(`Missing tickers: ${missingTickers.length}`);
  if (missingTickers.length > 0) {
    console.log(`First 10 missing: ${missingTickers.slice(0, 10).join(', ')}`);
  }
  
  await prisma.$disconnect();
}

main();

