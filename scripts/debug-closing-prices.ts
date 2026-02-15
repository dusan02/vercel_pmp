
import { loadEnvFromFiles } from './_utils/loadEnv';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

// Load env
loadEnvFromFiles();

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Debugging Closing Prices...');

    const tickers = ['AAPL', 'SPY', 'NVDA'];

    // Check Ticker table
    console.log('\n--- Ticker Table ---');
    try {
        const tickerArgs = await prisma.ticker.findMany({
            where: { symbol: { in: tickers } },
            select: {
                symbol: true,
                latestPrevClose: true,
                latestPrevCloseDate: true,
                lastPrice: true,
                lastPriceUpdated: true
            }
        });
        console.table(tickerArgs);
    } catch (e) {
        console.error("Error querying Ticker table:", e);
    }

    // Check DailyRef table for last few days
    console.log('\n--- DailyRef Table ---');
    try {
        const dailyRefs = await prisma.dailyRef.findMany({
            where: {
                symbol: { in: tickers },
                date: { gte: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
            },
            orderBy: { date: 'desc' }
        });

        console.table(dailyRefs.map(r => ({
            symbol: r.symbol,
            date: r.date.toISOString().split('T')[0],
            prevClose: r.previousClose,
            regClose: r.regularClose,
            createdAt: r.createdAt.toISOString()
        })));
    } catch (e) {
        console.error("Error querying DailyRef table:", e);
    }

    // Check Redis
    console.log('\n--- Redis Check (Optional) ---');
    const redis = createClient({
        url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
    });

    redis.on('error', (err) => {
        // Suppress initial connection errors
    });

    try {
        await redis.connect();

        for (const ticker of tickers) {
            try {
                const keys = await redis.keys(`stock:pmp:${ticker}`);
                if (keys.length > 0) {
                    for (const key of keys) {
                        const type = await redis.type(key);
                        if (type === 'string') {
                            const val = await redis.get(key);
                            console.log(`${key}:`, val ? val.substring(0, 100) + '...' : 'null');
                        } else if (type === 'hash') {
                            const val = await redis.hGetAll(key);
                            console.log(`${key}:`, val);
                        } else {
                            console.log(`${key}: [${type}]`);
                        }
                    }
                } else {
                    console.log(`No keys found for stock:pmp:${ticker}`);
                }
            } catch (e) {
                console.log(`Error checking keys for ${ticker}:`, e.message);
            }
        }
        await redis.disconnect();
    } catch (e) {
        console.log("Redis connection failed (skipping Redis check).");
    }

}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
