#!/bin/bash
# Rýchly fix pre TPL, STZ, NOW - skopírovať obsah tohto súboru na server a spustiť
# Alebo použiť SQL príkaz nižšie

cat > /tmp/fix-tpl-stz-now.ts << 'EOF'
import { prisma } from './src/lib/db/prisma.js';
import { validateSectorIndustry, normalizeIndustry } from './src/lib/utils/sectorIndustryValidator.js';

const corrections: { [key: string]: { sector: string; industry: string } } = {
  'TPL': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'STZ': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'NOW': { sector: 'Technology', industry: 'Software' },
};

async function fixTickers() {
  try {
    console.log('🔍 Checking current sector/industry for TPL, STZ, NOW...\n');

    const tickers = await prisma.ticker.findMany({
      where: { symbol: { in: ['TPL', 'STZ', 'NOW'] } },
      select: { symbol: true, name: true, sector: true, industry: true }
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
        const isValid = validateSectorIndustry(correction.sector, correction.industry);
        if (!isValid) {
          console.error(`  ❌ ${symbol}: Invalid combination - ${correction.sector} / ${correction.industry}`);
          errors++;
          continue;
        }

        const normalizedIndustry = normalizeIndustry(correction.sector, correction.industry) || correction.industry;

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

    console.log('\n📊 Verification...\n');
    const updatedTickers = await prisma.ticker.findMany({
      where: { symbol: { in: ['TPL', 'STZ', 'NOW'] } },
      select: { symbol: true, name: true, sector: true, industry: true }
    });

    console.log('Updated values:');
    updatedTickers.forEach(t => {
      console.log(`  ${t.symbol} (${t.name}): ${t.sector || 'N/A'} / ${t.industry || 'N/A'}`);
    });

    console.log(`\n✅ Fix complete! Updated: ${updated}, Errors: ${errors}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixTickers();
EOF

echo "✅ Skript vytvorený v /tmp/fix-tpl-stz-now.ts"
echo "Spustiť: cd /var/www/premarketprice && npx tsx /tmp/fix-tpl-stz-now.ts"

