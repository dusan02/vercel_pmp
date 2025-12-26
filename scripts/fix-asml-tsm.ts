/**
 * Script to fix ASML and TSM sector/industry data
 * 
 * Usage: npx tsx scripts/fix-asml-tsm.ts
 */

import { prisma } from '../src/lib/db/prisma';

async function fixASMLTSM() {
  try {
    console.log('🔧 Fixing ASML and TSM sector/industry data...\n');

    // ASML - Semiconductor Equipment
    const asml = await prisma.ticker.update({
      where: { symbol: 'ASML' },
      data: {
        sector: 'Technology',
        industry: 'Semiconductor Equipment',
        updatedAt: new Date()
      }
    });
    console.log(`✅ ASML: ${asml.sector} / ${asml.industry}`);

    // TSM - Semiconductors
    const tsm = await prisma.ticker.update({
      where: { symbol: 'TSM' },
      data: {
        sector: 'Technology',
        industry: 'Semiconductors',
        updatedAt: new Date()
      }
    });
    console.log(`✅ TSM: ${tsm.sector} / ${tsm.industry}`);

    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixASMLTSM();

