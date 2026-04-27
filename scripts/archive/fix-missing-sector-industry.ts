/**
 * Script to fix missing sector/industry for specific tickers
 * Based on the provided list of companies
 */

import { prisma } from '../src/lib/db/prisma';
import { normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator';

// Correct mappings based on the provided data
const corrections: { [key: string]: { sector: string; industry: string; name?: string } } = {
  'IBM': { 
    sector: 'Technology', 
    industry: 'Information Technology Services',
    name: 'International Business Machines Corp'
  },
  'WM': { 
    sector: 'Industrials', 
    industry: 'Waste Management',
    name: 'Waste Management, Inc'
  },
  'PYPL': { 
    sector: 'Financial Services', 
    industry: 'Credit Services',
    name: 'PayPal Holdings Inc'
  },
  'EL': { 
    sector: 'Consumer Defensive', 
    industry: 'Household & Personal Products',
    name: 'Estee Lauder Cos., Inc'
  },
  'SYY': { 
    sector: 'Consumer Defensive', 
    industry: 'Food Distribution',
    name: 'Sysco Corp'
  },
  'HPE': { 
    sector: 'Technology', 
    industry: 'Communication Equipment',
    name: 'Hewlett Packard Enterprise Co'
  },
  'LEN': { 
    sector: 'Consumer Cyclical', 
    industry: 'Residential Construction',
    name: 'Lennar Corp'
  },
  'HUBB': { 
    sector: 'Industrials', 
    industry: 'Electrical Equipment & Parts',
    name: 'Hubbell Inc'
  },
  'WSM': { 
    sector: 'Consumer Cyclical', 
    industry: 'Specialty Retail',
    name: 'Williams-Sonoma, Inc'
  },
  'L': { 
    sector: 'Financial Services', 
    industry: 'Insurance',
    name: 'Loews Corp'
  },
  'LH': { 
    sector: 'Healthcare', 
    industry: 'Diagnostics & Research',
    name: 'Labcorp Holdings Inc'
  },
  'SW': { 
    sector: 'Consumer Cyclical', 
    industry: 'Packaging & Containers',
    name: 'Smurfit WestRock plc'
  },
  'GPN': { 
    sector: 'Financial Services', 
    industry: 'Credit Services',
    name: 'Global Payments, Inc'
  },
  'BG': { 
    sector: 'Consumer Defensive', 
    industry: 'Farm Products',
    name: 'Bunge Global SA'
  },
  'NWS': { 
    sector: 'Communication Services', 
    industry: 'Entertainment',
    name: 'News Corp'
  },
  'EG': { 
    sector: 'Financial Services', 
    industry: 'Insurance',
    name: 'Everest Group Ltd'
  },
  'UHS': { 
    sector: 'Healthcare', 
    industry: 'Medical Care Facilities',
    name: 'Universal Health Services, Inc'
  },
  'BBY': { 
    sector: 'Consumer Cyclical', 
    industry: 'Specialty Retail',
    name: 'Best Buy Co. Inc'
  },
  'LYB': { 
    sector: 'Basic Materials', 
    industry: 'Specialty Chemicals',
    name: 'LyondellBasell Industries NV'
  },
  'LW': { 
    sector: 'Consumer Defensive', 
    industry: 'Packaged Foods',
    name: 'Lamb Weston Holdings Inc'
  },
};

async function fixTickers() {
  try {
    console.log('🔧 Fixing sector/industry for missing tickers...\n');

    let fixed = 0;
    let notFound = 0;
    let errors = 0;

    for (const [symbol, correction] of Object.entries(corrections)) {
      try {
        const ticker = await prisma.ticker.findUnique({
          where: { symbol },
          select: { symbol: true, name: true, sector: true, industry: true }
        });

        if (!ticker) {
          console.log(`⚠️  ${symbol}: Not found in database`);
          notFound++;
          continue;
        }

        const normalizedIndustry = normalizeIndustry(correction.sector, correction.industry) || correction.industry;

        const updateData: any = {
          sector: correction.sector,
          industry: normalizedIndustry,
          updatedAt: new Date()
        };

        // Update name if provided and different
        if (correction.name && ticker.name !== correction.name) {
          updateData.name = correction.name;
        }

        await prisma.ticker.update({
          where: { symbol },
          data: updateData
        });

        console.log(`✅ Fixed ${symbol}:`);
        console.log(`   Before: ${ticker.sector || 'N/A'} / ${ticker.industry || 'N/A'}`);
        console.log(`   After:  ${correction.sector} / ${normalizedIndustry}`);
        if (correction.name && ticker.name !== correction.name) {
          console.log(`   Name:   ${ticker.name || 'N/A'} → ${correction.name}`);
        }
        console.log('');

        fixed++;
      } catch (error) {
        console.error(`❌ Error fixing ${symbol}:`, error);
        errors++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Fixed: ${fixed}`);
    console.log(`   Not found: ${notFound}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${Object.keys(corrections).length}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixTickers();

