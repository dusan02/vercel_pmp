import { prisma } from '../src/lib/db/prisma';
import { aiMoversService } from '../src/lib/server/aiMoversService';
import { ingestBatch } from '../src/workers/polygonWorker';

async function quickMoversRefresh() {
    console.log('🚀 Quick Movers Refresh Started...');

    // 1. Get Top 150 tickers
    const tickers = await prisma.ticker.findMany({
        take: 150,
        orderBy: { lastMarketCap: 'desc' },
        select: { symbol: true }
    });
    const symbols = tickers.map(t => t.symbol);
    console.log(`📋 Found ${symbols.length} tickers.`);

    // 2. Fetch directly from Polygon & Upsert
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) throw new Error('No API key');

    console.log('📥 Fetching live data...');
    // Nastavíme force=true, aby preskočilo checky stavu trhu, ak je třeba
    const results = await ingestBatch(symbols, apiKey, true);
    console.log(`✅ Ingested ${results.filter(r => r.success).length} successfully.`);

    // Wait a sec for DB
    await new Promise(r => setTimeout(r, 1000));

    // 3. Generate Insights
    console.log('🤖 Regenerating AI Insights...');
    await aiMoversService.processMoversInsights();
    console.log('✨ All done.');

    await prisma.$disconnect();
    process.exit(0);
}

quickMoversRefresh().catch(console.error);
