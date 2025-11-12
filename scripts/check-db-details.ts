import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('=== DATABASE RECORDS ===\n');
    
    // Counts
    const tickerCount = await prisma.ticker.count();
    const sessionPriceCount = await prisma.sessionPrice.count();
    const dailyRefCount = await prisma.dailyRef.count();
    const earningsCount = await prisma.earningsCalendar.count();
    
    console.log(`Ticker: ${tickerCount} records`);
    console.log(`SessionPrice: ${sessionPriceCount} records`);
    console.log(`DailyRef: ${dailyRefCount} records`);
    console.log(`EarningsCalendar: ${earningsCount} records\n`);
    
    // Ticker details
    if (tickerCount > 0) {
      console.log('=== TICKER Records ===');
      const tickers = await prisma.ticker.findMany({ take: 10 });
      tickers.forEach(t => {
        console.log(`  ${t.symbol}: ${t.name || 'N/A'} | Sector: ${t.sector || 'N/A'} | Shares: ${t.sharesOutstanding?.toLocaleString() || 'N/A'}`);
      });
      console.log('');
    }
    
    // SessionPrice details
    if (sessionPriceCount > 0) {
      console.log('=== SessionPrice Records ===');
      const prices = await prisma.sessionPrice.findMany({ 
        take: 10, 
        orderBy: { lastTs: 'desc' },
        include: { ticker: true }
      });
      prices.forEach(sp => {
        console.log(`  ${sp.symbol} (${sp.session}): $${sp.lastPrice.toFixed(2)} | ${sp.changePct >= 0 ? '+' : ''}${sp.changePct.toFixed(2)}% | ${sp.lastTs.toISOString()} | Quality: ${sp.quality}`);
      });
      console.log('');
    }
    
    // DailyRef details
    if (dailyRefCount > 0) {
      console.log('=== DailyRef Records ===');
      const refs = await prisma.dailyRef.findMany({ take: 10, orderBy: { date: 'desc' } });
      refs.forEach(ref => {
        console.log(`  ${ref.symbol} (${ref.date.toISOString().split('T')[0]}): Previous Close: $${ref.previousClose.toFixed(2)}`);
      });
      console.log('');
    }
    
    // EarningsCalendar details
    if (earningsCount > 0) {
      console.log('=== EarningsCalendar Records ===');
      const earnings = await prisma.earningsCalendar.findMany({ take: 10, orderBy: { date: 'desc' } });
      earnings.forEach(e => {
        console.log(`  ${e.ticker} (${e.date.toISOString().split('T')[0]} ${e.time}): EPS ${e.epsActual || 'N/A'} | Revenue ${e.revenueActual || 'N/A'}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

