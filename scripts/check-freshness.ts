import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const topTickers = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN'];

    console.log('--- Ticker Table ---');
    const tickers = await prisma.ticker.findMany({
        where: { symbol: { in: topTickers } },
        select: {
            symbol: true,
            lastPrice: true,
            lastPriceUpdated: true,
            latestPrevClose: true,
            latestPrevCloseDate: true
        }
    });
    console.log(JSON.stringify(tickers, null, 2));

    console.log('\n--- SessionPrice Table (Latest for each) ---');
    const sessionPrices = await prisma.sessionPrice.findMany({
        where: { symbol: { in: topTickers } },
        orderBy: { lastTs: 'desc' },
    });

    // Group by symbol and take latest
    const latestSP = new Map();
    for (const sp of sessionPrices) {
        if (!latestSP.has(sp.symbol)) {
            latestSP.set(sp.symbol, sp);
        }
    }

    const result = Array.from(latestSP.values()).map(sp => ({
        symbol: sp.symbol,
        session: sp.session,
        lastPrice: sp.lastPrice,
        lastTs: sp.lastTs,
        updatedAt: sp.updatedAt
    }));

    console.log(JSON.stringify(result, null, 2));

    await prisma.$disconnect();
}

main().catch(console.error);
