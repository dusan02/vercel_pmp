/**
 * Script to fix incorrect sector/industry for TPL, STZ, and NOW tickers
 */

import { prisma } from '../src/lib/db/prisma';
import { validateSectorIndustry, normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator';

// Correct mappings based on actual company business
const corrections: { [key: string]: { sector: string; industry: string } } = {
  'TPL': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Texas Pacific Land Corporation - land management and royalties
  'STZ': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' }, // Constellation Brands - beer, wine, spirits
  'NOW': { sector: 'Technology', industry: 'Software' }, // ServiceNow - cloud software platform
};

async function fixTickers() {
  try {
    console.log('🔍 Checking current sector/industry for TPL, STZ, NOW...\n');

    // First, check current values
    const tickers = await prisma.ticker.findMany({
      where: { symbol: { in: ['TPL', 'STZ', 'NOW'] } },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      }
    });

    console.log('Current values:');
    tickers.forEach(t => {
      console.log(`  ${t.symbol} (${t.name}): ${t.sector || 'N/A'} / ${t.industry || 'N/A'}`);
    });

    console.log('\n🔧 Applying corrections...\n');

    let updated = 0;
    let errors = 0;

    for (const [symbol, correction] of Object.entries(corrections)) {
      try {
        // Validate the correction
        const isValid = validateSectorIndustry(correction.sector, correction.industry);
        if (!isValid) {
          console.error(`  ❌ ${symbol}: Invalid combination - ${correction.sector} / ${correction.industry}`);
          errors++;
          continue;
        }

        // Normalize industry name
        const normalizedIndustry = normalizeIndustry(correction.sector, correction.industry) || correction.industry;

        // Update the ticker
        await prisma.ticker.update({
          where: { symbol },
          data: {
            sector: correction.sector,
            industry: normalizedIndustry,
            updatedAt: new Date()
          }
        });

        console.log(`  ✅ ${symbol}: ${correction.sector} / ${normalizedIndustry}`);
        updated++;
      } catch (error) {
        console.error(`  ❌ Error updating ${symbol}:`, error);
        errors++;
      }
    }

    console.log('\n📊 Verification - checking updated values...\n');
    const updatedTickers = await prisma.ticker.findMany({
      where: { symbol: { in: ['TPL', 'STZ', 'NOW'] } },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      }
    });

    console.log('Updated values:');
    updatedTickers.forEach(t => {
      console.log(`  ${t.symbol} (${t.name}): ${t.sector || 'N/A'} / ${t.industry || 'N/A'}`);
    });

    console.log(`\n✅ Fix complete!`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Errors: ${errors}`);

  } catch (error) {
    console.error('❌ Error fixing tickers:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixTickers();

