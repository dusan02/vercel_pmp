#!/usr/bin/env node

/**
 * Fix production Unknown sectors by running static data update
 */

const { PrismaClient } = require('@prisma/client');

async function fixProductionSectors() {
  console.log('🔧 Fixing production Unknown sectors...');
  
  const prisma = new PrismaClient();
  
  try {
    // Check initial state
    const totalTickers = await prisma.ticker.count();
    const unknownSectors = await prisma.ticker.count({
      where: { sector: 'Unknown' }
    });
    
    console.log(`📊 Before fix:`);
    console.log(`   Total tickers: ${totalTickers}`);
    console.log(`   Unknown sectors: ${unknownSectors}`);
    console.log(`   Percentage: ${Math.round((unknownSectors / totalTickers) * 100)}%`);
    
    if (unknownSectors === 0) {
      console.log('✅ No Unknown sectors found - all good!');
      return;
    }
    
    console.log('\n🚀 Running static data update...');
    
    // Run the static data update script
    const { execSync } = require('child_process');
    
    try {
      const output = execSync('npm run db:update-static', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 300000 // 5 minutes timeout
      });
      
      console.log(output);
      
    } catch (error) {
      console.error('❌ Error running static data update:', error.message);
      if (error.stdout) {
        console.log('STDOUT:', error.stdout);
      }
      if (error.stderr) {
        console.log('STDERR:', error.stderr);
      }
      return;
    }
    
    // Check results
    const unknownSectorsAfter = await prisma.ticker.count({
      where: { sector: 'Unknown' }
    });
    
    const tickersWithPrices = await prisma.ticker.count({
      where: { lastPrice: { not: null } }
    });
    
    console.log(`\n📊 After fix:`);
    console.log(`   Unknown sectors: ${unknownSectorsAfter} (was ${unknownSectors})`);
    console.log(`   Improvement: ${unknownSectors - unknownSectorsAfter} sectors fixed`);
    console.log(`   Success rate: ${Math.round(((unknownSectors - unknownSectorsAfter) / unknownSectors) * 100)}%`);
    console.log(`   Tickers with prices: ${tickersWithPrices}/${totalTickers}`);
    
    if (unknownSectorsAfter > 0) {
      console.log(`\n⚠️ Still ${unknownSectorsAfter} tickers with Unknown sectors`);
      console.log('These may need manual sector overrides or different data sources');
    } else {
      console.log('\n🎉 All Unknown sectors fixed!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixProductionSectors().catch(console.error);
