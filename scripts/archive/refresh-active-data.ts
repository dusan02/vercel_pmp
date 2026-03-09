import { statsService } from './src/lib/server/statsService';
import { aiMoversService } from './src/lib/server/aiMoversService';
import { prisma } from './src/lib/db/prisma';
import { preloadBulkStocks } from './src/workers/backgroundPreloader';

// Suppress noisy logs
const originalError = console.error;
console.error = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('Redis') || msg.includes('ECONNREFUSED')) return;
    originalError(...args);
};

async function refreshAll() {
    console.log('🚀 Starting global data refresh...');

    // 1. Get tickers to refresh (Top 100 by market cap or all tracked)
    const tickers = await prisma.ticker.findMany({
        take: 150,
        orderBy: { lastMarketCap: 'desc' },
        select: { symbol: true }
    });
    const symbols = tickers.map(t => t.symbol);
    console.log(`📋 refreshing stats for ${symbols.length} tickers...`);

    // 2. Refresh 20d Stats
    try {
        const statsResult = await statsService.updateHistoricalStats(symbols);
        console.log('📊 Stats updated:', statsResult);
    } catch (err) {
        console.warn('⚠️ Stats update had some issues, continuing...');
    }

    // 3. Perform Live Ingestion (Bulk)
    console.log('📥 starting live data ingestion...');
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
        console.error('❌ POLYGON_API_KEY not found in environment');
        return;
    }

    try {
        await preloadBulkStocks(apiKey);
        console.log('✅ Ingestion complete.');
    } catch (err) {
        console.error('❌ Ingestion failed:', err);
    }

    // 4. Generate AI Insights
    console.log('🤖 generating AI insights...');
    // Selektívne mazanie: mažeme len tickere, ktoré už nie sú signifikantné movers (|Z| < 1.0)
    // Tým sa zabraňuje, aby web bol "prázdny" počas regeneorácie AI textov
    await prisma.ticker.updateMany({
        where: {
            AND: [
                { latestMoversZScore: { gt: -1.0 } },
                { latestMoversZScore: { lt: 1.0 } },
                { moversReason: { not: null } }
            ]
        },
        data: { moversReason: null, moversCategory: null, socialCopy: null }
    });
    console.log('🧹 Cleared stale movers insights (Z-score below threshold).');

    // Wait for ingestion to settle in DB
    await new Promise(r => setTimeout(r, 2000));

    try {
        const aiResult = await aiMoversService.processMoversInsights();
        console.log('✨ AI insights generated:', aiResult);
    } catch (err) {
        console.error('❌ AI insight generation failed:', err);
    }

    console.log('🏁 Refresh process finished.');
    await prisma.$disconnect();
    process.exit(0);
}

refreshAll().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});
