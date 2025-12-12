
import { prisma } from '../src/lib/db/prisma';

async function check() {
  const ticker = await prisma.ticker.findUnique({
    where: { symbol: 'NFLX' }
  });
  console.log('NFLX Data:', ticker);
}

check();

