/**
 * Script to repair ticker metadata (name, sector, industry, sharesOutstanding)
 * for a list of top tickers by syncing with Polygon.io.
 * 
 * Usage: npx tsx scripts/repair-ticker-metadata.ts --tickers="NVDA,AAPL,MSFT,GOOG,AMZN,TSLA"
 *    or: npx tsx scripts/repair-ticker-metadata.ts --top=50
 */

import { prisma } from '../src/lib/db/prisma';
import { AnalysisService } from '../src/services/analysisService';

async function repairMetadata() {
    const args = process.argv.slice(2);
    let tickersToRepair: string[] = [];

    const tickersArg = args.find(a => a.startsWith('--tickers='));
    const topArg = args.find(a => a.startsWith('--top='));

    if (tickersArg && tickersArg.includes('=')) {
        tickersToRepair = (tickersArg.split('=')[1] ?? '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    } else if (topArg) {
        const count = parseInt(topArg.split('=')[1] || '50', 10) || 50;
        console.log(`🔍 Fetching top ${count} tickers from DB...`);
        const topTickers = await prisma.ticker.findMany({
            orderBy: { lastMarketCap: 'desc' },
            take: count,
            select: { symbol: true }
        });
        tickersToRepair = topTickers.map(t => t.symbol);
    } else {
        // Default to a set of high-impact tickers if no args provided
        tickersToRepair = ['NVDA', 'AAPL', 'MSFT', 'GOOG', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'BRK.B', 'LLY', 'V', 'MA', 'TSM', 'UNH'];
    }

    console.log(`🚀 Starting metadata repair for ${tickersToRepair.length} tickers...`);

    let success = 0;
    let failed = 0;

    for (const [index, symbol] of tickersToRepair.entries()) {
        process.stdout.write(`[${index + 1}/${tickersToRepair.length}] Repairing ${symbol}... `);
        
        try {
            await AnalysisService.syncTickerDetails(symbol);
            console.log('✅ Done');
            success++;
        } catch (error) {
            console.log('❌ Failed');
            console.error(`   Error repairing ${symbol}:`, error);
            failed++;
        }

        // Wait to respect rate limits (4 requests per second)
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n🎉 Repair complete!`);
    console.log(`✅ Successfully repaired: ${success}`);
    console.log(`❌ Failed: ${failed}`);
}

repairMetadata()
    .catch(err => {
        console.error('Fatal error during repair:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
