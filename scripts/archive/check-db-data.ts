/**
 * Quick script to check database data
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📊 Checking database data...\n');
  
  // Count records
  const tickerCount = await prisma.ticker.count();
  const sessionPriceCount = await prisma.sessionPrice.count();
  const dailyRefCount = await prisma.dailyRef.count();
  
  console.log(`✅ Tickers: ${tickerCount}`);
  console.log(`✅ SessionPrice records: ${sessionPriceCount}`);
  console.log(`✅ DailyRef records: ${dailyRefCount}\n`);
  
  // Get recent records
  const recent = await prisma.sessionPrice.findMany({
    take: 10,
    orderBy: { lastTs: 'desc' },
    include: { ticker: { select: { name: true, sector: true } } }
  });
  
  console.log('📈 Recent price records:');
  recent.forEach(r => {
    console.log(`  ${r.symbol.padEnd(6)}: $${r.lastPrice.toFixed(2).padStart(8)} (${r.changePct > 0 ? '+' : ''}${r.changePct.toFixed(2)}%) - ${r.lastTs.toISOString()}`);
  });
  
  // Get today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const todayCount = await prisma.sessionPrice.count({
    where: {
      date: { gte: today, lt: tomorrow }
    }
  });
  
  console.log(`\n📅 Today's records: ${todayCount}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

