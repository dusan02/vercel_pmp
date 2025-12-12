import { prisma } from '../src/lib/db/prisma';

async function checkLogos() {
  try {
    const withLogo = await prisma.ticker.count({
      where: { logoUrl: { not: null } }
    });
    const total = await prisma.ticker.count();
    
    const amd = await prisma.ticker.findUnique({
      where: { symbol: 'AMD' },
      select: { symbol: true, logoUrl: true }
    });
    
    const pg = await prisma.ticker.findUnique({
      where: { symbol: 'PG' },
      select: { symbol: true, logoUrl: true }
    });

    console.log('\n📊 Logo Status:\n');
    console.log(`Total tickers: ${total}`);
    console.log(`Tickers with logoUrl: ${withLogo}`);
    console.log(`\nAMD logoUrl: ${amd?.logoUrl || 'null'}`);
    console.log(`PG logoUrl: ${pg?.logoUrl || 'null'}`);

    // Check a few more
    const sample = await prisma.ticker.findMany({
      where: {
        symbol: { in: ['NFLX', 'ABBV', 'COST', 'HD', 'KO'] }
      },
      select: {
        symbol: true,
        logoUrl: true
      }
    });

    console.log('\n📊 Sample tickers:\n');
    sample.forEach(t => {
      console.log(`${t.symbol}: ${t.logoUrl || 'null'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLogos();

