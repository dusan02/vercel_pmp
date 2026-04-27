import { prisma } from '../src/lib/db/prisma.js';
import { normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator.js';

// Fix sectors for specific tickers that are in "Other" or NULL sector
const CORRECTIONS: Record<string, { sector: string; industry: string }> = {
    'LNG': {
        sector: 'Energy',
        industry: 'Oil & Gas Midstream'
    },
    'SE': {
        sector: 'Technology',
        industry: 'Internet Content & Information'
    },
    'B': {
        sector: 'Industrials',
        industry: 'Specialty Industrial Machinery'
    },
    'ING': {
        sector: 'Financial Services',
        industry: 'Banks'
    },
    'HEI': {
        sector: 'Industrials',
        industry: 'Aerospace & Defense'
    },
    'E': {
        sector: 'Energy',
        industry: 'Oil & Gas Integrated'
    },
    'NU': {
        sector: 'Financial Services',
        industry: 'Credit Services'
    },
    'HLN': {
        sector: 'Healthcare',
        industry: 'Drug Manufacturers - General'
    },
    'NGG': {
        sector: 'Utilities',
        industry: 'Utilities - Regulated Electric'
    }
};

async function fixOtherSectorTickers() {
    console.log('🔧 Fixing sectors for tickers in "Other" or NULL sector...\n');

    // First, find all tickers with "Other" or NULL sector
    const tickersWithOtherSector = await prisma.ticker.findMany({
        where: {
            OR: [
                { sector: 'Other' },
                { sector: null },
                { sector: 'Unrecognized' }
            ],
            symbol: { in: Object.keys(CORRECTIONS) }
        },
        select: { symbol: true, name: true, sector: true, industry: true }
    });

    console.log(`Found ${tickersWithOtherSector.length} tickers with "Other"/NULL/Unrecognized sector:\n`);
    
    // Also find all tickers by symbol (regardless of sector) to ensure we fix them all
    const allTickersToFix = await prisma.ticker.findMany({
        where: {
            symbol: { in: Object.keys(CORRECTIONS) }
        },
        select: { symbol: true, name: true, sector: true, industry: true }
    });
    
    console.log(`Total tickers to check: ${allTickersToFix.length}\n`);

    let fixed = 0;
    let notFound = 0;
    let errors = 0;

    for (const ticker of tickersWithOtherSector) {
        const correction = CORRECTIONS[ticker.symbol];
        if (!correction) {
            console.log(`⚠️  ${ticker.symbol}: No correction mapping available`);
            notFound++;
            continue;
        }

        try {
            // Normalize industry
            const normalizedIndustry = normalizeIndustry(correction.sector, correction.industry) || correction.industry;

            // Update sector and industry
            await prisma.ticker.update({
                where: { symbol: ticker.symbol },
                data: {
                    sector: correction.sector,
                    industry: normalizedIndustry,
                    updatedAt: new Date()
                }
            });

            console.log(`✅ ${ticker.symbol}:`);
            console.log(`   Before: ${ticker.sector || 'NULL'} / ${ticker.industry || 'NULL'}`);
            console.log(`   After:  ${correction.sector} / ${normalizedIndustry}`);
            console.log('');

            fixed++;
        } catch (error: any) {
            console.error(`❌ Error fixing ${ticker.symbol}:`, error.message);
            errors++;
        }
    }

    // Also try to fix by symbol directly (in case they exist but weren't found by sector filter)
    for (const [symbol, correction] of Object.entries(CORRECTIONS)) {
        if (tickersWithOtherSector.find(t => t.symbol === symbol)) {
            continue; // Already processed
        }

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

            // Update regardless of current sector (force update to ensure correct sector)
            // But log if it's already correct
            if (ticker.sector === correction.sector && ticker.industry === correction.industry) {
                console.log(`ℹ️  ${symbol}: Already has correct sector "${ticker.sector}", skipping...`);
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

fixOtherSectorTickers().catch(console.error);
