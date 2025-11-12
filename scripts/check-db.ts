import { prisma } from '../src/lib/prisma';

async function main() {
  try {
    const count = await prisma.sessionPrice.count();
    console.log('✅ SessionPrice count:', count);
    
    const sample = await prisma.sessionPrice.findFirst({
      orderBy: { lastTs: 'desc' },
      include: { ticker: true }
    });
    
    if (sample) {
      console.log('✅ Latest data:', {
        symbol: sample.symbol,
        price: sample.lastPrice,
        changePct: sample.changePct,
        date: sample.date,
        session: sample.session,
        lastTs: sample.lastTs
      });
    } else {
      console.log('❌ No data in SessionPrice table');
    }
    
    const tickerCount = await prisma.ticker.count();
    console.log('✅ Ticker count:', tickerCount);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

