/**
 * Script to verify and fix incorrect sector/industry data
 * Checks all tickers against known correct mappings and fixes errors
 * 
 * Usage: tsx scripts/verify-fix-sector-industry.ts
 */

import { prisma } from '../src/lib/prisma';

// Known correct mappings for major pharmaceutical and healthcare companies
const knownCorrectMappings: { [key: string]: { sector: string; industry: string } } = {
  // Healthcare - Drug Manufacturers
  'NVS': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // Novartis
  'AZN': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // AstraZeneca
  'GSK': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // GlaxoSmithKline
  'SNY': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // Sanofi
  'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // Eli Lilly
  'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // Johnson & Johnson
  'PFE': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // Pfizer
  'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // AbbVie
  'MRK': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // Merck
  'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // Bristol-Myers Squibb
  'NVO': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // Novo Nordisk
  'TAK': { sector: 'Healthcare', industry: 'Drug Manufacturers' }, // Takeda
  
  // Healthcare - Biotechnology
  'AMGN': { sector: 'Healthcare', industry: 'Biotechnology' },
  'GILD': { sector: 'Healthcare', industry: 'Biotechnology' },
  'REGN': { sector: 'Healthcare', industry: 'Biotechnology' },
  'VRTX': { sector: 'Healthcare', industry: 'Biotechnology' },
  'BIIB': { sector: 'Healthcare', industry: 'Biotechnology' },
  
  // Healthcare - Medical Devices
  'MDT': { sector: 'Healthcare', industry: 'Medical Devices' }, // Medtronic
  'ABT': { sector: 'Healthcare', industry: 'Medical Devices' },
  'BSX': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ISRG': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ZTS': { sector: 'Healthcare', industry: 'Medical Devices' },
  
  // Healthcare - Diagnostics & Research
  'TMO': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
  'DHR': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
  
  // Healthcare - Healthcare Plans
  'UNH': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'CVS': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'CI': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'HUM': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'ELV': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  
  // Financial Services - should NOT be Healthcare
  // (These are correctly Financial Services)
  'JPM': { sector: 'Financial Services', industry: 'Banks' },
  'BAC': { sector: 'Financial Services', industry: 'Banks' },
  'WFC': { sector: 'Financial Services', industry: 'Banks' },
  'GS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'MS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'V': { sector: 'Financial Services', industry: 'Credit Services' },
  'MA': { sector: 'Financial Services', industry: 'Credit Services' },
  'AXP': { sector: 'Financial Services', industry: 'Credit Services' },
};

// Common incorrect patterns to check
const incorrectPatterns = [
  {
    description: 'Pharmaceutical companies incorrectly in Financial Services',
    check: (ticker: string, sector: string | null, industry: string | null) => {
      const pharmaTickers = ['NVS', 'AZN', 'GSK', 'SNY', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRK', 'BMY', 'NVO', 'TAK'];
      return pharmaTickers.includes(ticker) && sector === 'Financial Services';
    },
    fix: (ticker: string) => knownCorrectMappings[ticker] || { sector: 'Healthcare', industry: 'Drug Manufacturers' }
  },
  {
    description: 'Medical device companies incorrectly in Financial Services',
    check: (ticker: string, sector: string | null, industry: string | null) => {
      const deviceTickers = ['MDT', 'ABT', 'BSX', 'ISRG', 'ZTS'];
      return deviceTickers.includes(ticker) && sector === 'Financial Services';
    },
    fix: (ticker: string) => knownCorrectMappings[ticker] || { sector: 'Healthcare', industry: 'Medical Devices' }
  }
];

async function verifyAndFixSectorIndustry() {
  console.log('🔍 Starting sector/industry verification and fix...\n');
  
  try {
    // Get all tickers with sector/industry
    const allTickers = await prisma.ticker.findMany({
      where: {
        OR: [
          { sector: { not: null } },
          { industry: { not: null } }
        ]
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
      },
      orderBy: {
        symbol: 'asc'
      }
    });
    
    console.log(`📊 Found ${allTickers.length} tickers with sector/industry data\n`);
    
    let fixed = 0;
    let errors: Array<{ ticker: string; current: string; fixed: string }> = [];
    let verified = 0;
    
    for (const ticker of allTickers) {
      const symbol = ticker.symbol;
      const currentSector = ticker.sector;
      const currentIndustry = ticker.industry;
      
      // Check if we have a known correct mapping
      if (knownCorrectMappings[symbol]) {
        const correct = knownCorrectMappings[symbol];
        
        if (currentSector !== correct.sector || currentIndustry !== correct.industry) {
          console.log(`❌ ${symbol} (${ticker.name || 'N/A'}):`);
          console.log(`   Current: ${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`);
          console.log(`   Should be: ${correct.sector} / ${correct.industry}`);
          
          // Fix it
          await prisma.ticker.update({
            where: { symbol },
            data: {
              sector: correct.sector,
              industry: correct.industry,
              updatedAt: new Date()
            }
          });
          
          errors.push({
            ticker: symbol,
            current: `${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`,
            fixed: `${correct.sector} / ${correct.industry}`
          });
          
          fixed++;
          console.log(`   ✅ Fixed!\n`);
        } else {
          verified++;
        }
      } else {
        // Check against incorrect patterns
        let needsFix = false;
        let fixData: { sector: string; industry: string } | null = null;
        
        for (const pattern of incorrectPatterns) {
          if (pattern.check(symbol, currentSector, currentIndustry)) {
            fixData = pattern.fix(symbol);
            needsFix = true;
            break;
          }
        }
        
        if (needsFix && fixData) {
          console.log(`❌ ${symbol} (${ticker.name || 'N/A'}):`);
          console.log(`   Current: ${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`);
          console.log(`   Should be: ${fixData.sector} / ${fixData.industry}`);
          
          await prisma.ticker.update({
            where: { symbol },
            data: {
              sector: fixData.sector,
              industry: fixData.industry,
              updatedAt: new Date()
            }
          });
          
          errors.push({
            ticker: symbol,
            current: `${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`,
            fixed: `${fixData.sector} / ${fixData.industry}`
          });
          
          fixed++;
          console.log(`   ✅ Fixed!\n`);
        } else {
          verified++;
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Total tickers checked: ${allTickers.length}`);
    console.log(`   Verified correct: ${verified}`);
    console.log(`   Fixed: ${fixed}`);
    console.log('='.repeat(60));
    
    if (errors.length > 0) {
      console.log('\n🔧 Fixed tickers:');
      errors.forEach(e => {
        console.log(`   ${e.ticker}: ${e.current} → ${e.fixed}`);
      });
    }
    
    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('❌ Error during verification:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
verifyAndFixSectorIndustry()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

