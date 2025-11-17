/**
 * Diagnostický skript pre kontrolu heatmap dát
 * 
 * Usage: tsx scripts/check-heatmap-data.ts
 */

import { prisma } from '../src/lib/prisma';

async function checkHeatmapData() {
  console.log('\n📊 Heatmap Data Diagnostic\n');
  console.log('='.repeat(60));

  try {
    // 1. Kontrola tickerov s sector/industry
    const tickers = await prisma.ticker.findMany({
      where: {
        sector: { not: null },
        industry: { not: null },
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        sharesOutstanding: true,
      },
      take: 10, // Len prvých 10 pre test
    });

    console.log(`\n✅ Tickers with sector/industry: ${tickers.length}`);
    if (tickers.length > 0) {
      console.log('Sample tickers:');
      tickers.slice(0, 5).forEach(t => {
        console.log(`  - ${t.symbol}: ${t.name || 'N/A'} (${t.sector} / ${t.industry})`);
      });
    }

    // 2. Kontrola SessionPrice
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const sessionPriceCount = await prisma.sessionPrice.count({
      where: {
        date: { gte: weekAgo, lt: tomorrow },
      },
    });

    console.log(`\n✅ SessionPrice records (last 7 days): ${sessionPriceCount}`);

    // 3. Kontrola DailyRef
    const dailyRefCount = await prisma.dailyRef.count({
      where: {
        date: { gte: weekAgo, lt: tomorrow },
      },
    });

    console.log(`\n✅ DailyRef records (last 7 days): ${dailyRefCount}`);

    // 4. Kontrola konkrétnych tickerov
    if (tickers.length > 0) {
      const testTicker = tickers[0].symbol;
      console.log(`\n🔍 Testing ticker: ${testTicker}`);

      const sessionPrices = await prisma.sessionPrice.findMany({
        where: {
          symbol: testTicker,
          date: { gte: weekAgo, lt: tomorrow },
        },
        orderBy: {
          lastTs: 'desc',
        },
        take: 1,
      });

      const dailyRefs = await prisma.dailyRef.findMany({
        where: {
          symbol: testTicker,
          date: { gte: weekAgo, lt: tomorrow },
        },
        orderBy: {
          date: 'desc',
        },
        take: 1,
      });

      console.log(`  SessionPrice: ${sessionPrices.length > 0 ? '✅ Found' : '❌ Not found'}`);
      if (sessionPrices.length > 0) {
        console.log(`    - Price: ${sessionPrices[0].lastPrice}, Change: ${sessionPrices[0].changePct}%`);
      }

      console.log(`  DailyRef: ${dailyRefs.length > 0 ? '✅ Found' : '❌ Not found'}`);
      if (dailyRefs.length > 0) {
        console.log(`    - Previous Close: ${dailyRefs[0].previousClose}`);
      }
    }

    // 5. Celkový počet tickerov
    const totalTickers = await prisma.ticker.count();
    console.log(`\n📊 Total tickers in DB: ${totalTickers}`);

    const tickersWithSector = await prisma.ticker.count({
      where: {
        sector: { not: null },
        industry: { not: null },
      },
    });
    console.log(`📊 Tickers with sector/industry: ${tickersWithSector}`);

    console.log('\n✅ Diagnostic complete!\n');

  } catch (error) {
    console.error('\n❌ Error during diagnostic:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkHeatmapData();

