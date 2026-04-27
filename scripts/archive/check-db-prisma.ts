/**
 * Check DB counts using Prisma
 */

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const tickerCount = await prisma.ticker.count();
    const sessionPriceCount = await prisma.sessionPrice.count();
    const dailyRefCount = await prisma.dailyRef.count();
    
    console.log('📊 DB Counts:');
    console.log(`  Ticker: ${tickerCount}`);
    console.log(`  SessionPrice: ${sessionPriceCount}`);
    console.log(`  DailyRef: ${dailyRefCount}`);
    
    if (sessionPriceCount > 0) {
      const latest = await prisma.sessionPrice.findFirst({
        orderBy: { lastTs: 'desc' },
        select: { symbol: true, lastPrice: true, lastTs: true }
      });
      console.log(`\n✅ Latest record: ${latest?.symbol} @ $${latest?.lastPrice} (${latest?.lastTs})`);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

