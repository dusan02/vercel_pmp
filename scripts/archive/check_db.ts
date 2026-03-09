import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['error'] });

async function checkMELI() {
    const meli = await prisma.ticker.findUnique({
        where: { symbol: 'MELI' },
        select: {
            symbol: true,
            latestMoversZScore: true,
            lastChangePct: true,
            avgVolume20d: true,
            avgReturn20d: true,
            stdDevReturn20d: true,
            lastMarketCap: true,
            moversReason: true
        }
    });
    console.log('MELI full stats:', JSON.stringify(meli, null, 2));

    // Check the top 100 by market cap to see if MELI is included
    const top100 = await prisma.ticker.findMany({
        take: 100,
        orderBy: { lastMarketCap: 'desc' },
        select: { symbol: true, lastMarketCap: true }
    });
    const meliRank = top100.findIndex(t => t.symbol === 'MELI');
    console.log('\nMELI market cap rank in top 100:', meliRank === -1 ? 'NOT IN TOP 100' : `#${meliRank + 1}`);

    // Show who is #100
    if (top100.length >= 100) {
        const hundredth = top100[99]!;
        console.log(`#100 is: ${hundredth.symbol} (mcap: ${hundredth.lastMarketCap?.toFixed(0)})`);
    }

    await prisma.$disconnect();
}

checkMELI().catch(console.error);
