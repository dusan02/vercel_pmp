
import { prisma } from '../src/lib/db/prisma';

async function main() {
    console.log('🧹 Cleanup Stale Data...');

    // 1. Find tickers with stale prices (> 24 hours old)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const staleTickers = await prisma.ticker.findMany({
        where: {
            lastPriceUpdated: {
                lt: yesterday
            }
        }
    });

    console.log(`Found ${staleTickers.length} stale tickers.`);

    for (const ticker of staleTickers) {
        console.log(`Fixing stale ticker: ${ticker.symbol} (Last Updated: ${ticker.lastPriceUpdated})`);
        console.log(`  Current Price: ${ticker.lastPrice} -> Resetting to PrevClose: ${ticker.latestPrevClose}`);

        // If we have a previous close, set price to it (0% change). If not, set to 0.
        const newPrice = ticker.latestPrevClose || 0;

        await prisma.ticker.update({
            where: { symbol: ticker.symbol },
            data: {
                lastPrice: newPrice,
                lastChangePct: 0,
                lastMarketCapDiff: 0,
                // Keep lastPriceUpdated as is? Or update it to now? 
                // Updating to now might hide the fact it's not updating. 
                // But leaving it old is fine if we fix the values.
                // Let's update timestamp to avoid re-process loops, but we should know it's a "reset"
                updatedAt: new Date()
            }
        });
    }

    console.log('✅ Cleanup complete.');
}

main().finally(() => prisma.$disconnect());
