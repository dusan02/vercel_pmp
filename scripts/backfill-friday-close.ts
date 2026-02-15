
import { loadEnvFromFiles } from './_utils/loadEnv';
// import { saveRegularClose, bootstrapPreviousCloses } from '../src/workers/polygonWorker';
import { getDateET, createETDate } from '../src/lib/utils/dateET';
import { getTradingDay } from '../src/lib/utils/timeUtils';
import { prisma } from '../src/lib/db/prisma';

// Disable Redis for this script to avoid connection errors if not running
process.env.USE_LOCAL_REDIS = 'false';
process.env.REDIS_URL = '';
process.env.UPSTASH_REDIS_REST_URL = '';

// Load env
loadEnvFromFiles();

async function main() {
    console.log('🚀 Starting Ticker Fix for Friday...');

    // 1. Determine target date (Friday)
    const todayET = getDateET();
    const todayDate = createETDate(todayET);
    const tradingDay = getTradingDay(todayDate);
    const tradingDayStr = getDateET(tradingDay); // Should be Friday 2026-02-13

    console.log(`📅 Target Trading Day: ${tradingDayStr}`);

    // 2. Fetch all DailyRefs for this day which have regularClose
    console.log('📊 Fetching DailyRefs for Friday...');
    const dailyRefs = await prisma.dailyRef.findMany({
        where: {
            date: tradingDay,
            regularClose: { not: null }
        },
        select: {
            symbol: true,
            regularClose: true
        }
    });

    console.log(`✅ Found ${dailyRefs.length} DailyRefs with regularClose.`);

    // 3. Update Ticker table
    // Set latestPrevClose = regularClose (Friday Close)
    // Set latestPrevCloseDate = Friday
    console.log('🔄 Updating Ticker table...');

    let updated = 0;
    for (const ref of dailyRefs) {
        if (!ref.regularClose) continue;

        await prisma.ticker.update({
            where: { symbol: ref.symbol },
            data: {
                latestPrevClose: ref.regularClose,
                latestPrevCloseDate: tradingDay
            }
        });
        updated++;
        if (updated % 50 === 0) process.stdout.write('.');
    }

    console.log(`\n✅ Updated ${updated} tickers.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
