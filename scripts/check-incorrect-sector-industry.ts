/**
 * Script to check for potentially incorrect sector/industry combinations
 * Looks for common patterns that might indicate errors
 */

import { prisma } from '../src/lib/db/prisma';

async function checkIncorrectSectorIndustry() {
  try {
    console.log('🔍 Checking for potentially incorrect sector/industry combinations...\n');

    // Check for tickers with Technology/Communication Equipment that might be wrong
    console.log('1. Checking Technology/Communication Equipment (might include non-tech companies)...');
    const techComm = await prisma.ticker.findMany({
      where: {
        sector: 'Technology',
        industry: 'Communication Equipment'
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      },
      take: 20
    });
    console.log(`   Found ${techComm.length} tickers with Technology/Communication Equipment`);
    techComm.forEach(t => {
      console.log(`     ${t.symbol} (${t.name})`);
    });

    // Check for tickers with Real Estate/REIT - Specialty that might be wrong
    console.log('\n2. Checking Real Estate/REIT - Specialty (might include non-REIT companies)...');
    const realEstateSpecialty = await prisma.ticker.findMany({
      where: {
        sector: 'Real Estate',
        industry: 'REIT - Specialty'
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      },
      take: 20
    });
    console.log(`   Found ${realEstateSpecialty.length} tickers with Real Estate/REIT - Specialty`);
    realEstateSpecialty.forEach(t => {
      console.log(`     ${t.symbol} (${t.name})`);
    });

    // Check for specific known problematic tickers
    console.log('\n3. Checking specific tickers (TPL, STZ, NOW)...');
    const specificTickers = await prisma.ticker.findMany({
      where: {
        symbol: { in: ['TPL', 'STZ', 'NOW'] }
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      }
    });
    specificTickers.forEach(t => {
      console.log(`     ${t.symbol} (${t.name}): ${t.sector || 'N/A'} / ${t.industry || 'N/A'}`);
    });

    // Check for tickers with Technology sector but names suggesting other sectors
    console.log('\n4. Checking for Technology tickers that might be misclassified...');
    const techTickers = await prisma.ticker.findMany({
      where: {
        sector: 'Technology'
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      },
      take: 50
    });
    
    // Look for suspicious patterns
    const suspicious = techTickers.filter(t => {
      const name = (t.name || '').toLowerCase();
      const symbol = (t.symbol || '').toLowerCase();
      
      // Check for beverage/alcohol related names
      if (name.includes('brand') || name.includes('beverage') || name.includes('beer') || 
          name.includes('wine') || name.includes('spirit') || symbol === 'stz') {
        return true;
      }
      
      // Check for real estate/land related names
      if (name.includes('land') || name.includes('real estate') || name.includes('property') ||
          symbol === 'tpl') {
        return true;
      }
      
      return false;
    });
    
    if (suspicious.length > 0) {
      console.log(`   Found ${suspicious.length} potentially misclassified Technology tickers:`);
      suspicious.forEach(t => {
        console.log(`     ${t.symbol} (${t.name}): ${t.sector} / ${t.industry}`);
      });
    } else {
      console.log('   No obvious misclassifications found');
    }

    // Check for Consumer Defensive tickers that might be Technology
    console.log('\n5. Checking for Consumer Defensive tickers that might be misclassified...');
    const consumerDefensive = await prisma.ticker.findMany({
      where: {
        sector: 'Consumer Defensive'
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      },
      take: 30
    });
    
    const suspiciousConsumer = consumerDefensive.filter(t => {
      const name = (t.name || '').toLowerCase();
      const symbol = (t.symbol || '').toLowerCase();
      
      // Check for tech-related names
      if (name.includes('software') || name.includes('cloud') || name.includes('tech') ||
          name.includes('service') || symbol === 'now') {
        return true;
      }
      
      return false;
    });
    
    if (suspiciousConsumer.length > 0) {
      console.log(`   Found ${suspiciousConsumer.length} potentially misclassified Consumer Defensive tickers:`);
      suspiciousConsumer.forEach(t => {
        console.log(`     ${t.symbol} (${t.name}): ${t.sector} / ${t.industry}`);
      });
    } else {
      console.log('   No obvious misclassifications found');
    }

    console.log('\n✅ Check complete!');
    console.log('\n💡 Tip: Review the results above and manually verify any suspicious entries.');

  } catch (error) {
    console.error('❌ Error checking sector/industry:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkIncorrectSectorIndustry();

