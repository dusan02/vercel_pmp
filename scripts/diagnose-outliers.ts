
import { prisma } from '../src/lib/db/prisma';

async function main() {
    const tickers = ['GLCNF', 'GMBXF', 'NPSNY'];
    console.log('🔍 Diagnosing outliers:', tickers);
    const apiKey = process.env.POLYGON_API_KEY;

    for (const symbol of tickers) {
        console.log(`\n--- ${symbol} ---`);
        // DB Data
        const dbTicker = await prisma.ticker.findUnique({ where: { symbol } });
        const dbDaily = await prisma.dailyRef.findFirst({
            where: { symbol },
            orderBy: { date: 'desc' }
        });

        console.log('DB Ticker:', dbTicker);
        console.log('DB DailyRef:', dbDaily);

        // Polygon Data
        try {
            // Current Snapshot
            const snapRes = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbol}&apiKey=${apiKey}`);
            const snapData = await snapRes.json();
            const snap = snapData.tickers?.[0];
            console.log('Poly Snapshot:', JSON.stringify(snap, null, 2));

            // Prev Close Agg
            const prevRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`);
            const prevData = await prevRes.json();
            console.log('Poly PrevClose:', JSON.stringify(prevData.results?.[0], null, 2));
        } catch (e) {
            console.error('Fetch error:', e);
        }
    }
}

main().finally(() => prisma.$disconnect());
