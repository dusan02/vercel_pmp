import { prisma } from '../src/lib/db/prisma';

async function diagnose() {
  console.log('🔍 Diagnosing Ticker table...');

  const total = await prisma.ticker.count();
  const unknownSectors = await prisma.ticker.count({ 
    where: { 
      OR: [
        { sector: 'Unknown' },
        { sector: 'unknown' },
        { sector: '' },
        { sector: null }
      ]
    } 
  });
  const nullSectors = await prisma.ticker.count({ where: { sector: null } });
  const oneBillionShares = await prisma.ticker.count({ where: { sharesOutstanding: 1000000000 } });
  
  const examples = await prisma.ticker.findMany({
    where: {
      OR: [
        { sharesOutstanding: 1000000000 },
        { sector: 'Unknown' },
        { sector: null }
      ]
    },
    take: 10,
    select: { symbol: true, name: true, sector: true, industry: true, sharesOutstanding: true, lastPrice: true }
  });

  console.log(`Total Tickers: ${total}`);
  console.log(`Unknown Sectors: ${unknownSectors}`);
  console.log(`Null Sectors: ${nullSectors}`);
  console.log(`1B Shares: ${oneBillionShares}`);
  console.log('\nExamples:');
  console.table(examples);
}

diagnose().catch(console.error).finally(() => prisma.$disconnect());
