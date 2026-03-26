import { PrismaClient } from '@prisma/client';

async function checkGPS() {
  const prisma = new PrismaClient();
  try {
    const t = await prisma.ticker.findUnique({ where: { symbol: 'GPS' } });
    console.log('GPS Record:');
    console.log(JSON.stringify(t, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkGPS();
