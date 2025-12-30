/**
 * Quick script to check TSM and RCL sector/industry
 */

import { prisma } from '../src/lib/db/prisma';

async function checkTSMRCL() {
  try {
    const tickers = await prisma.ticker.findMany({
      where: {
        symbol: { in: ['TSM', 'RCL'] }
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      }
    });

    console.log('📊 TSM and RCL Status:\n');
    tickers.forEach(t => {
      console.log(`${t.symbol} (${t.name || 'N/A'}):`);
      console.log(`  Sector: ${t.sector || 'N/A'}`);
      console.log(`  Industry: ${t.industry || 'N/A'}`);
      console.log('');
    });

    // Check if they're correct
    const tsm = tickers.find(t => t.symbol === 'TSM');
    const rcl = tickers.find(t => t.symbol === 'RCL');

    if (tsm) {
      const tsmOk = tsm.sector === 'Technology' && tsm.industry === 'Semiconductors';
      console.log(`TSM: ${tsmOk ? '✅ OK' : '❌ NEEDS FIX'}`);
    } else {
      console.log('TSM: ❌ NOT FOUND');
    }

    if (rcl) {
      const rclOk = rcl.sector === 'Consumer Cyclical' && rcl.industry === 'Travel Services';
      console.log(`RCL: ${rclOk ? '✅ OK' : '❌ NEEDS FIX'}`);
    } else {
      console.log('RCL: ❌ NOT FOUND');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkTSMRCL();

