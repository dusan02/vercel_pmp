#!/usr/bin/env node

/**
 * Check production sector data and identify Unknown sectors
 */

const { PrismaClient } = require('@prisma/client');

async function checkProductionSectors() {
  console.log('🔍 Checking production sector data...');
  
  const prisma = new PrismaClient();
  
  try {
    const totalTickers = await prisma.ticker.count();
    const unknownSectors = await prisma.ticker.count({
      where: { sector: 'Unknown' }
    });
    
    console.log(`📊 Production Database Status:`);
    console.log(`   Total tickers: ${totalTickers}`);
    console.log(`   Unknown sectors: ${unknownSectors}`);
    console.log(`   Percentage: ${Math.round((unknownSectors / totalTickers) * 100)}%`);
    
    if (unknownSectors > 0) {
      const samples = await prisma.ticker.findMany({
        where: { sector: 'Unknown' },
        select: { symbol: true, sector: true, industry: true, name: true },
        take: 20,
        orderBy: { symbol: 'asc' }
      });
      
      console.log(`\n🚨 First 20 tickers with Unknown sectors:`);
      samples.forEach(t => {
        console.log(`   ${t.symbol}: sector="${t.sector}", industry="${t.industry}", name="${t.name}"`);
      });
    }
    
    // Check for null sectors too
    const nullSectors = await prisma.ticker.count({
      where: { sector: null }
    });
    
    if (nullSectors > 0) {
      console.log(`\n⚠️ Also found ${nullSectors} tickers with null sectors`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkProductionSectors().catch(console.error);
