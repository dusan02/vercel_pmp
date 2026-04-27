import { prisma } from '../src/lib/db/prisma';

async function main() {
    console.log('🔍 Checking heatmap API logic for AAPL...');
    
    // Simulate what the API does
    const ticker = await prisma.ticker.findUnique({
        where: { symbol: 'AAPL' },
        select: {
            symbol: true,
            sharesOutstanding: true,
            lastMarketCap: true,
            lastPrice: true
        }
    });

    const sp = await prisma.sessionPrice.findFirst({
        where: { symbol: 'AAPL' },
        orderBy: { date: 'desc' }
    });

    const dr = await prisma.dailyRef.findFirst({
        where: { symbol: 'AAPL' },
        orderBy: { date: 'desc' }
    });

    console.log('Ticker:', ticker);
    console.log('SessionPrice:', sp);
    console.log('DailyRef:', dr);

    // Percent change logic (Simplified from route.ts)
    const currentPrice = sp?.lastPrice || ticker?.lastPrice || 0;
    const previousClose = dr?.previousClose || 0;
    
    const changePct = ((currentPrice / (previousClose || currentPrice)) - 1) * 100;
    console.log('Calculated Change %:', changePct);
}

main().catch(console.error);
