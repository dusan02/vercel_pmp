import { prisma } from './src/lib/db/prisma';

async function checkMovers() {
    const totalTickers = await prisma.ticker.count();
    const withZScore = await prisma.ticker.count({
        where: { latestMoversZScore: { not: null } }
    });
    const withRVOL = await prisma.ticker.count({
        where: { latestMoversRVOL: { gte: 2.0 } }
    });
    const withInsights = await prisma.ticker.count({
        where: { moversReason: { not: null } }
    });
    const validMovers = await prisma.ticker.count({
        where: {
            latestMoversZScore: { not: null },
            latestMoversRVOL: { gte: 2.0 },
            OR: [
                { latestMoversZScore: { gte: 3.0 } },
                { latestMoversZScore: { lte: -3.0 } }
            ]
        }
    });

    console.log('--- DB Status ---');
    console.log(`Total Tickers: ${totalTickers}`);
    console.log(`With Z-Score: ${withZScore}`);
    console.log(`With RVOL >= 2.0: ${withRVOL}`);
    console.log(`With AI Insights: ${withInsights}`);
    console.log(`Valid Movers (Z > 3 or Z < -3 AND RVOL > 2): ${validMovers}`);

    if (validMovers > 0) {
        const sample = await prisma.ticker.findMany({
            where: {
                latestMoversZScore: { not: null },
                latestMoversRVOL: { gte: 2.0 }
            },
            take: 5,
            select: { symbol: true, latestMoversZScore: true, latestMoversRVOL: true, moversReason: true, socialCopy: true }
        });
        console.log('Sample Movers:', JSON.stringify(sample, null, 2));
    }
}

checkMovers()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
