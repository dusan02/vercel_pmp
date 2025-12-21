/**
 * Verify that sector/industry fix was successful
 */

import { prisma } from '../src/lib/db/prisma';

async function main() {
  console.log('=== FINÁLNA KONTROLA OPRAVENÝCH TICKEROV ===\n');
  
  const tickers = await prisma.ticker.findMany({
    where: {
      symbol: { in: ['GOOG', 'GOOGL', 'META', 'NFLX', 'DIS'] }
    },
    select: {
      symbol: true,
      sector: true,
      industry: true
    }
  });
  
  console.log('Opravené tickery:');
  tickers.forEach(t => {
    console.log(`  ${t.symbol}: ${t.sector || 'N/A'} / ${t.industry || 'N/A'}`);
  });
  
  const allFixed = tickers.every(t => t.sector && t.industry);
  console.log(`\n${allFixed ? '✅' : '❌'} Všetky tickery ${allFixed ? 'majú' : 'nemajú'} sector/industry`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

