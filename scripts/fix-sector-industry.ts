import { prisma } from '../src/lib/db/prisma.js';

// Correct sector/industry mappings based on actual company data
const CORRECTIONS: Record<string, { sector: string; industry: string }> = {
    'PBR': {
        sector: 'Energy',
        industry: 'Oil & Gas Integrated'
    },
    'VALE': {
        sector: 'Basic Materials',
        industry: 'Other Industrial Metals & Mining'
    },
    'ABEV': {
        sector: 'Consumer Defensive',
        industry: 'Beverages - Brewers'
    },
    'TSM': {
        sector: 'Technology',
        industry: 'Semiconductors'
    },
    'BABA': {
        sector: 'Consumer Cyclical',
        industry: 'Internet Retail'
    },
    'ASML': {
        sector: 'Technology',
        industry: 'Semiconductor Equipment & Materials'
    },
    'NESN': {
        sector: 'Consumer Defensive',
        industry: 'Packaged Foods'
    },
    'NVO': {
        sector: 'Healthcare',
        industry: 'Drug Manufacturers - General'
    }
};

async function fixSectorIndustry() {
    console.log('Fixing sector/industry data for international stocks...\n');

    for (const [ticker, data] of Object.entries(CORRECTIONS)) {
        try {
            const result = await prisma.ticker.update({
                where: { symbol: ticker },
                data: {
                    sector: data.sector,
                    industry: data.industry
                }
            });

            console.log(`✅ ${ticker}: ${data.sector} - ${data.industry}`);
        } catch (error) {
            console.error(`❌ Failed to update ${ticker}:`, error);
        }
    }

    console.log('\n✅ Sector/industry corrections completed!');

    // Verify the changes
    console.log('\nVerifying updates:');
    const updated = await prisma.ticker.findMany({
        where: { symbol: { in: Object.keys(CORRECTIONS) } },
        select: { symbol: true, name: true, sector: true, industry: true }
    });

    console.log(JSON.stringify(updated, null, 2));

    await prisma.$disconnect();
}

fixSectorIndustry().catch(console.error);
