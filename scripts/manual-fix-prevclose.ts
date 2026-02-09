
import { loadEnvFromFiles } from './_utils/loadEnv';
// Load envs first
loadEnvFromFiles();

// Force disable Redis for this manual script
process.env.USE_LOCAL_REDIS = 'false';
process.env.REDIS_URL = '';

import { PrismaClient } from '@prisma/client';
import { getPreviousClose } from '../src/lib/utils/marketCapUtils';
import { setPrevClose } from '../src/lib/redis/operations';
import { getDateET, createETDate, nowET } from '../src/lib/utils/dateET';
import { getLastTradingDay } from '../src/lib/utils/timeUtils';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting manual previous close fix...');

    // Get date context
    const etNow = nowET();
    const calendarDateETStr = getDateET(etNow);
    const calendarDateET = createETDate(calendarDateETStr);
    const todayTradingDay = getLastTradingDay(calendarDateET);
    const todayTradingDateStr = getDateET(todayTradingDay);

    console.log(`📅 Context: Today=${calendarDateETStr}, TradingDay=${todayTradingDateStr}`);

    // Fetch all tickers
    const tickers = await prisma.ticker.findMany({
        select: { symbol: true, latestPrevClose: true },
        orderBy: { symbol: 'asc' }
    });

    console.log(`📊 Found ${tickers.length} tickers to check.`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const ticker of tickers) {
        try {
            // Fetch from Polygon
            const prevClose = await getPreviousClose(ticker.symbol);

            if (prevClose && prevClose > 0) {
                // Update DB
                await prisma.ticker.update({
                    where: { symbol: ticker.symbol },
                    data: {
                        latestPrevClose: prevClose,
                        latestPrevCloseDate: todayTradingDay,
                        updatedAt: new Date()
                    }
                });

                // Update DailyRef
                await prisma.dailyRef.upsert({
                    where: {
                        symbol_date: {
                            symbol: ticker.symbol,
                            date: todayTradingDay
                        }
                    },
                    update: { previousClose: prevClose },
                    create: {
                        symbol: ticker.symbol,
                        date: todayTradingDay,
                        previousClose: prevClose
                    }
                });

                // Update Redis (cache) - using calendar date key as per worker logic
                try {
                    // Note: worker uses calendarDateETStr for keys? Check operations.ts?
                    // Usually it uses calendarDateETStr.
                    await setPrevClose(calendarDateETStr, ticker.symbol, prevClose);
                } catch (e) {
                    console.warn(`Redis update failed for ${ticker.symbol}:`, e);
                }

                updated++;
                process.stdout.write(`\r✅ Updated: ${updated} | Skipped: ${skipped} | Errors: ${errors} (${ticker.symbol}: ${prevClose})`);
            } else {
                skipped++;
            }
        } catch (error) {
            errors++;
            console.error(`\n❌ Error processing ${ticker.symbol}:`, error);
        }
    }

    console.log('\n🏁 Finished!');
    console.log(`Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
