#!/usr/bin/env node

/**
 * Bulk fix for Unknown sectors by adding comprehensive overrides
 */

const { PrismaClient } = require('@prisma/client');

// Common sector mappings for problematic tickers
const SECTOR_FIXES = {
  // Technology
  'A': { sector: 'Technology', industry: 'Software' },
  'ABNB': { sector: 'Technology', industry: 'Internet Services' },
  'ADSK': { sector: 'Technology', industry: 'Software' },
  'AJG': { sector: 'Technology', industry: 'Software' },
  'AKAM': { sector: 'Technology', industry: 'Software' },
  'ALLE': { sector: 'Technology', industry: 'Software' },
  'AMCR': { sector: 'Technology', industry: 'Software' },
  'AME': { sector: 'Technology', industry: 'Software' },
  'AMP': { sector: 'Technology', industry: 'Software' },
  'AOS': { sector: 'Technology', industry: 'Software' },
  'APH': { sector: 'Technology', industry: 'Semiconductors' },
  'APO': { sector: 'Technology', industry: 'Software' },
  'APP': { sector: 'Technology', industry: 'Software' },
  'APTV': { sector: 'Technology', industry: 'Software' },
  'ARE': { sector: 'Technology', industry: 'Software' },
  'ARES': { sector: 'Technology', industry: 'Software' },
  'ATO': { sector: 'Technology', industry: 'Software' },
  
  // Financial Services
  'ACGL': { sector: 'Financial Services', industry: 'Insurance' },
  'ADM': { sector: 'Consumer Staples', industry: 'Agricultural Products' },
  'ADP': { sector: 'Technology', industry: 'Software' },
  'AIZ': { sector: 'Financial Services', industry: 'Insurance' },
  'AIG': { sector: 'Financial Services', industry: 'Insurance' },
  
  // Utilities
  'AEE': { sector: 'Utilities', industry: 'Electric Utility' },
  'AES': { sector: 'Utilities', industry: 'Electric Utility' },
  
  // Materials
  'ALB': { sector: 'Materials', industry: 'Chemicals' },
  
  // Industrial
  'ALGN': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ALGN': { sector: 'Healthcare', industry: 'Medical Devices' },
  
  // Add more as needed...
};

async function fixSectors() {
  console.log('🔧 Applying bulk sector fixes...');
  const prisma = new PrismaClient();
  
  try {
    let fixed = 0;
    let notFound = 0;
    
    for (const [ticker, fix] of Object.entries(SECTOR_FIXES)) {
      const exists = await prisma.ticker.findUnique({
        where: { symbol: ticker }
      });
      
      if (exists) {
        await prisma.ticker.update({
          where: { symbol: ticker },
          data: {
            sector: fix.sector,
            industry: fix.industry
          }
        });
        fixed++;
        console.log(`✅ Fixed ${ticker}: ${fix.sector} - ${fix.industry}`);
      } else {
        notFound++;
        console.log(`❌ Not found: ${ticker}`);
      }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`   Fixed: ${fixed}`);
    console.log(`   Not found: ${notFound}`);
    
    // Check remaining Unknown sectors
    const remainingUnknown = await prisma.ticker.count({
      where: { sector: 'Unknown' }
    });
    
    console.log(`   Remaining Unknown: ${remainingUnknown}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixSectors().catch(console.error);
