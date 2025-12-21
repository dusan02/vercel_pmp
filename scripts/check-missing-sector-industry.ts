/**
 * Check which tickers have missing sector/industry data
 */

import { prisma } from '../src/lib/db/prisma';

async function main() {
  console.log('=== KONTROLA TICKEROV S N/A SECTOR/INDUSTRY ===\n');
  
  const tickers = await prisma.ticker.findMany({
    where: {
      OR: [
        { sector: null },
        { industry: null }
      ]
    },
    select: {
      symbol: true,
      name: true,
      sector: true,
      industry: true
    },
    take: 50
  });
  
  console.log('Tickery s N/A sector/industry:');
  tickers.forEach(t => {
    console.log(`  ${t.symbol}: sector=${t.sector || 'N/A'}, industry=${t.industry || 'N/A'}`);
  });
  
  const total = await prisma.ticker.count({
    where: {
      OR: [
        { sector: null },
        { industry: null }
      ]
    }
  });
  
  console.log(`\nCelkovo: ${total} tickerov s chýbajúcimi dátami`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

