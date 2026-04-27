import { prisma } from '../src/lib/db/prisma';
import { redisClient } from '../src/lib/redis';
import { getDateET } from '../src/lib/utils/dateET';
import { detectSession, mapToRedisSession } from '../src/lib/utils/timeUtils';

async function checkNflx() {
    try {
        const ticker = await prisma.ticker.findUnique({
            where: { symbol: 'NFLX' },
            select: {
                symbol: true,
                lastPrice: true,
                lastChangePct: true,
                latestMoversZScore: true,
                latestPrevClose: true,
                lastPriceUpdated: true
            }
        });
        console.log('Database NFLX:', JSON.stringify(ticker, null, 2));

        const date = getDateET();
        const session = detectSession(new Date());
        const redisSession = mapToRedisSession(session);

        const zscoreKey = `rank:zscore:${date}:${redisSession}`;
        const rank = await redisClient.zScore(zscoreKey, 'NFLX');
        console.log(`Redis ZSET (${zscoreKey}) NFLX Z-Score Rank:`, rank);

        const heatmapKey = `heatmap:${date}:${redisSession}`;
        const heatmapRank = await redisClient.zScore(heatmapKey, 'NFLX');
        console.log(`Redis Heatmap ZSET (${heatmapKey}) NFLX PCT Rank:`, heatmapRank);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        if (redisClient.isOpen) await redisClient.disconnect();
        process.exit(0);
    }
}

checkNflx();
