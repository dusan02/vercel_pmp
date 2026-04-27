/**
 * Jednoduchý skript na kontrolu sector/industry chýb
 * Zobrazí výsledky v čitateľnom formáte
 */

import { prisma } from '../src/lib/db/prisma';

async function checkSectorIndustry() {
  try {
    console.log('🔍 Kontrola sector/industry chýb...\n');

    // 1. Technology/Communication Equipment
    console.log('=== 1. Technology/Communication Equipment ===');
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
      take: 30,
      orderBy: { symbol: 'asc' }
    });
    
    if (techComm.length > 0) {
      console.log(`Nájdených ${techComm.length} tickerov:\n`);
      techComm.forEach(t => {
        console.log(`  ${t.symbol.padEnd(6)} | ${(t.name || 'N/A').padEnd(40)} | ${t.sector} / ${t.industry}`);
      });
    } else {
      console.log('Žiadne tickery nenájdené.\n');
    }

    // 2. Real Estate/REIT - Specialty
    console.log('\n=== 2. Real Estate/REIT - Specialty ===');
    const realEstate = await prisma.ticker.findMany({
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
      take: 30,
      orderBy: { symbol: 'asc' }
    });
    
    if (realEstate.length > 0) {
      console.log(`Nájdených ${realEstate.length} tickerov:\n`);
      realEstate.forEach(t => {
        console.log(`  ${t.symbol.padEnd(6)} | ${(t.name || 'N/A').padEnd(40)} | ${t.sector} / ${t.industry}`);
      });
    } else {
      console.log('Žiadne tickery nenájdené.\n');
    }

    // 3. NULL sector/industry
    console.log('\n=== 3. NULL sector/industry ===');
    const nullSector = await prisma.ticker.findMany({
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
      take: 30,
      orderBy: { symbol: 'asc' }
    });
    
    if (nullSector.length > 0) {
      console.log(`Nájdených ${nullSector.length} tickerov:\n`);
      nullSector.forEach(t => {
        console.log(`  ${t.symbol.padEnd(6)} | ${(t.name || 'N/A').padEnd(40)} | sector: ${t.sector || 'NULL'}, industry: ${t.industry || 'NULL'}`);
      });
    } else {
      console.log('Žiadne tickery nenájdené.\n');
    }

    console.log('\n✅ Kontrola dokončená!');
    console.log('\n💡 Tip: Manuálne skontrolujte výsledky a identifikujte potenciálne chyby.');

  } catch (error) {
    console.error('❌ Chyba pri kontrole:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkSectorIndustry();

