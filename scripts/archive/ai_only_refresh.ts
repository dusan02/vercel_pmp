import { prisma } from './src/lib/db/prisma';
import { aiMoversService } from './src/lib/server/aiMoversService';

async function runAIOnly() {
    console.log('🤖 Running AI-only insights refresh...');

    // Check MELI Z-score first
    const meli = await prisma.ticker.findUnique({
        where: { symbol: 'MELI' },
        select: { symbol: true, latestMoversZScore: true, lastChangePct: true, moversReason: true }
    });
    console.log('MELI status:', JSON.stringify(meli));

    // Top movers by abs Z-score
    const topG = await prisma.ticker.findMany({
        where: { latestMoversZScore: { gte: 2.0 } },
        orderBy: { latestMoversZScore: 'desc' },
        take: 5,
        select: { symbol: true, latestMoversZScore: true, lastChangePct: true, moversReason: true }
    });
    const topL = await prisma.ticker.findMany({
        where: { latestMoversZScore: { lte: -2.0 } },
        orderBy: { latestMoversZScore: 'asc' },
        take: 5,
        select: { symbol: true, latestMoversZScore: true, lastChangePct: true, moversReason: true }
    });
    console.log('\nTop gainers (Z≥2):', JSON.stringify(topG, null, 2));
    console.log('\nTop losers (Z≤-2):', JSON.stringify(topL, null, 2));

    // Clear old reasons for non-movers
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

    // Generate AI insights (will use buildNoNewsFallback when no API key)
    const result = await aiMoversService.processMoversInsights();
    console.log('\n✨ AI insights result:', result);

    // Verify results
    const withReason = await prisma.ticker.findMany({
        where: { moversReason: { not: null } },
        select: { symbol: true, latestMoversZScore: true, lastChangePct: true, moversReason: true }
    });
    console.log('\nTickers with moversReason now:', withReason.length);
    withReason.forEach(t => console.log(`  ${t.symbol} (Z=${t.latestMoversZScore?.toFixed(2)}, ${t.lastChangePct?.toFixed(2)}%): "${t.moversReason}"`));

    await prisma.$disconnect();
}

runAIOnly().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
