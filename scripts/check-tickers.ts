import { prisma } from '../src/lib/db/prisma';
import { getProjectTickers } from '../src/data/defaultTickers';

async function check() {
  const allTickers = getProjectTickers('pmp', 1000);
  const top50 = getProjectTickers('pmp', 50);
  const remaining = allTickers.filter(t => !top50.includes(t));
  
  console.log('Total expected:', allTickers.length);
  console.log('Remaining expected:', remaining.length);
  
  const inDB = await prisma.ticker.findMany({
    where: { symbol: { in: remaining } },
    select: { symbol: true }
  });
  
  console.log('Remaining in DB:', inDB.length);
  console.log('Missing:', remaining.length - inDB.length);
  
  // Check ARES position
  const aresIndex = remaining.indexOf('ARES');
  console.log('\nARES position in remaining:', aresIndex + 1);
  console.log('ARES in DB:', inDB.some(t => t.symbol === 'ARES'));
  
  await prisma.$disconnect();
}

check();

