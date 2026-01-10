import { prisma } from '../src/lib/db/prisma.js';
import { normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator.js';

// Fix sectors for tickers that are currently in "Other" or "Unrecognized" sector
const CORRECTIONS: Record<string, { sector: string; industry: string }> = {
    'NU': {
        sector: 'Financial Services',
        industry: 'Credit Services'
    },
    'ING': {
        sector: 'Financial Services',
        industry: 'Banks'
    },
    'B': {
        sector: 'Industrials',
        industry: 'Specialty Industrial Machinery'
    },
    'SE': {
        sector: 'Technology',
        industry: 'Internet Content & Information'
    },
    'NGG': {
        sector: 'Utilities',
        industry: 'Utilities - Regulated Electric'
    }
};

async function fixSectors() {
    console.log('🔧 Fixing sectors for NU, ING, B, SE, NGG...\n');

    let fixed = 0;
    let notFound = 0;
    let errors = 0;

    for (const [symbol, correction] of Object.entries(CORRECTIONS)) {
        try {
            // Find ticker by symbol
            const ticker = await prisma.ticker.findUnique({
                where: { symbol },
                select: { symbol: true, name: true, sector: true, industry: true }
            });

            if (!ticker) {
                console.log(`⚠️  ${symbol}: Not found in database`);
                notFound++;
                continue;
            }

            // Normalize industry
            const normalizedIndustry = normalizeIndustry(correction.sector, correction.industry) || correction.industry;

            // Update sector and industry
            await prisma.ticker.update({
                where: { symbol },
                data: {
                    sector: correction.sector,
                    industry: normalizedIndustry,
                    updatedAt: new Date()
                }
            });

            console.log(`✅ ${symbol}:`);
            console.log(`   Before: ${ticker.sector || 'NULL'} / ${ticker.industry || 'NULL'}`);
            console.log(`   After:  ${correction.sector} / ${normalizedIndustry}`);
            console.log('');

            fixed++;
        } catch (error: any) {
            console.error(`❌ Error fixing ${symbol}:`, error.message);
            errors++;
        }
    }

    console.log('\n📊 Summary:');
    console.log(`   Fixed: ${fixed}`);
    console.log(`   Not found: ${notFound}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${Object.keys(CORRECTIONS).length}`);

    // Verify the changes
    console.log('\n🔍 Verifying updates:');
    const updated = await prisma.ticker.findMany({
        where: { symbol: { in: Object.keys(CORRECTIONS) } },
        select: { symbol: true, name: true, sector: true, industry: true }
    });

    console.log(JSON.stringify(updated, null, 2));

    await prisma.$disconnect();
}

fixSectors().catch(console.error);
