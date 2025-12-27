/**
 * Quick fix script for TSM sector/industry
 */

import { prisma } from '../src/lib/db/prisma';
import { normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator';

async function fixTSM() {
  try {
    console.log('🔧 Fixing TSM sector/industry...\n');

    const ticker = await prisma.ticker.findUnique({
      where: { symbol: 'TSM' },
      select: { symbol: true, name: true, sector: true, industry: true }
    });

    if (!ticker) {
      console.error('❌ TSM not found in database');
      process.exit(1);
    }

    console.log(`Current state: ${ticker.symbol} (${ticker.name || 'N/A'})`);
    console.log(`  Sector: ${ticker.sector || 'NULL'}`);
    console.log(`  Industry: ${ticker.industry || 'NULL'}\n`);

    const correctSector = 'Technology';
    const correctIndustry = 'Semiconductors';
    const normalizedIndustry = normalizeIndustry(correctSector, correctIndustry) || correctIndustry;

    await prisma.ticker.update({
      where: { symbol: 'TSM' },
      data: {
        sector: correctSector,
        industry: normalizedIndustry,
        updatedAt: new Date()
      }
    });

    console.log(`✅ Fixed TSM:`);
    console.log(`  Sector: ${correctSector}`);
    console.log(`  Industry: ${normalizedIndustry}\n`);

    // Verify
    const updated = await prisma.ticker.findUnique({
      where: { symbol: 'TSM' },
      select: { symbol: true, name: true, sector: true, industry: true }
    });

    console.log('Verification:');
    console.log(JSON.stringify(updated, null, 2));

  } catch (error) {
    console.error('❌ Error fixing TSM:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixTSM();

