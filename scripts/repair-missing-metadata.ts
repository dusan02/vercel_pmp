import { prisma } from '../src/lib/db/prisma';
import { AnalysisService } from '../src/services/analysisService';

async function repairMissing() {
    console.log('🔍 Identifying tickers with missing sector, industry, or market cap...');
    
    const missingTickers = await prisma.ticker.findMany({
        where: {
            OR: [
                { sector: null },
                { sector: '' },
                { industry: null },
                { industry: '' },
                { lastMarketCap: { equals: 0 } },
                { lastMarketCap: null }
            ]
        },
        select: { symbol: true, sector: true, industry: true, lastMarketCap: true }
    });

    console.log(`🚀 Found ${missingTickers.length} tickers needing repair.`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < missingTickers.length; i++) {
        const symbol = missingTickers[i].symbol;
        process.stdout.write(`[${i + 1}/${missingTickers.length}] Repairing ${symbol}... `);
        
        try {
            await AnalysisService.syncTickerDetails(symbol);
            console.log('✅ Done');
            success++;
        } catch (error) {
            console.log('❌ Failed');
            console.error(`   Error repairing ${symbol}:`, error instanceof Error ? error.message : error);
            failed++;
        }

        // Wait to respect rate limits (4 requests per second)
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n🎉 Repair complete!`);
    console.log(`✅ Successfully repaired: ${success}`);
    console.log(`❌ Failed: ${failed}`);
}

repairMissing()
    .catch(err => {
        console.error('Fatal error during repair:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
