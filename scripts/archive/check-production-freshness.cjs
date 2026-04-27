#!/usr/bin/env node

/**
 * Check production data freshness and identify issues
 */

const { PrismaClient } = require('@prisma/client');

async function checkProductionData() {
  console.log('🔍 Checking production data freshness...');
  const prisma = new PrismaClient();
  
  try {
    const totalTickers = await prisma.ticker.count();
    const withPrices = await prisma.ticker.count({
      where: { lastPrice: { not: null } }
    });
    const withMarketCap = await prisma.ticker.count({
      where: { lastMarketCap: { not: null } }
    });
    const unknownSectors = await prisma.ticker.count({
      where: { sector: 'Unknown' }
    });
    
    // Check data freshness
    const recentData = await prisma.ticker.count({
      where: {
        lastPriceUpdated: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });
    
    console.log(`📊 Production Database Status:`);
    console.log(`   Total tickers: ${totalTickers}`);
    console.log(`   With prices: ${withPrices} (${Math.round(withPrices / totalTickers * 100)}%)`);
    console.log(`   With market cap: ${withMarketCap} (${Math.round(withMarketCap / totalTickers * 100)}%)`);
    console.log(`   Unknown sectors: ${unknownSectors} (${Math.round(unknownSectors / totalTickers * 100)}%)`);
    console.log(`   Fresh data (24h): ${recentData} (${Math.round(recentData / totalTickers * 100)}%)`);
    
    // Check high movers with Unknown sectors
    const highMovers = await prisma.ticker.findMany({
      where: {
        sector: 'Unknown',
        OR: [
          { lastChangePct: { gt: 5 } },
          { lastChangePct: { lt: -5 } }
        ]
      },
      select: { symbol: true, lastChangePct: true, lastPrice: true, lastPriceUpdated: true },
      orderBy: { lastChangePct: 'desc' },
      take: 10
    });
    
    if (highMovers.length > 0) {
      console.log(`\n🚨 High movers with Unknown sectors:`);
      highMovers.forEach(t => {
        const updated = t.lastPriceUpdated ? new Date(t.lastPriceUpdated).toISOString() : 'Never';
        console.log(`   ${t.symbol}: ${t.lastChangePct?.toFixed(2)}% (price: $${t.lastPrice?.toFixed(2)}, updated: ${updated})`);
      });
    }
    
    // Check very old data
    const veryOldData = await prisma.ticker.count({
      where: {
        lastPriceUpdated: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Older than 7 days
        }
      }
    });
    
    if (veryOldData > 0) {
      console.log(`\n⚠️ Very old data (7+ days): ${veryOldData} tickers`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkProductionData().catch(console.error);
