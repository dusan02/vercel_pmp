/**
 * Master script to manage market data
 * Replaces:
 * - reset-and-reload-closing-prices.ts
 * - refresh-close-prices-now.ts
 * - manual-ingest.ts
 * - force-ingest.ts
 *
 * Usage:
 * npx tsx scripts/manage-market-data.ts <command> [flags]
 *
 * Commands:
 *   reset       - Hard reset: Clears DB prices (set to 0/null), clears Redis, bootstraps Prev Close.
 *   fill        - Soft fill: Checks for missing regularClose/previousClose and fetches them (no reset).
 *   ingest      - Ingest Current: Forces an ingestion of current market prices.
 *   full-reset  - Combines reset + ingest (Reset -> Bootstrap -> Ingest).
 *
 * Flags:
 *   --force       - Bypass safety checks / timestamps (where applicable)
 *   --batch-size  - Custom batch size (default: 60)
 */

import { loadEnvFromFiles } from './_utils/loadEnv';

// Load env BEFORE importing modules
loadEnvFromFiles();

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        console.error(`❌ ${key} not configured`);
        throw new Error(`${key} is required`);
    }
    return value;
}

// Types
type Command = 'reset' | 'fill' | 'ingest' | 'full-reset';

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] as Command;
    const force = args.includes('--force');

    // Parse batch size
    const batchSizeIdx = args.indexOf('--batch-size');
    const batchSize = batchSizeIdx !== -1 && args[batchSizeIdx + 1]
        ? parseInt(args[batchSizeIdx + 1], 10)
        : 60;

    if (!['reset', 'fill', 'ingest', 'full-reset'].includes(command)) {
        console.error(`
❌ Invalid command: ${command || '(none)'}

Usage: npx tsx scripts/manage-market-data.ts <command> [flags]

Commands:
  reset       - Hard reset: Clears DB prices (set to 0/null), clears Redis, bootstraps Prev Close.
  fill        - Soft fill: Checks missing data and fills it (no reset).
  ingest      - Ingest Current: Forces ingestion of current market prices.
  full-reset  - Combines reset + ingest (The "Fresh Start" mode).

Flags:
  --force       - Bypass checks
  --batch-size  - Set batch size (default: 60)
    `);
        process.exit(1);
    }

    console.log(`🚀 Starting Market Data Manager`);
    console.log(`📝 Command: ${command.toUpperCase()}`);
    console.log(`⚙️  Flags: force=${force}, batchSize=${batchSize}`);

    const apiKey = requireEnv('POLYGON_API_KEY');

    // Lazy-load modules
    const [
        { prisma },
        redisOps,
        worker,
        dateET,
        timeUtils,
        closingPricesUtils,
        redisCacheUtils,
        rateLimiter
    ] = await Promise.all([
        import('../src/lib/db/prisma'),
        import('@/lib/redis/operations'),
        import('@/workers/polygonWorker'),
        import('@/lib/utils/dateET'),
        import('@/lib/utils/timeUtils'),
        import('@/lib/utils/closingPricesUtils'),
        import('@/lib/utils/redisCacheUtils'),
        import('@/lib/api/rateLimiter'),
    ]);

    const { getUniverse, deleteCachedData, deleteCachedDataByPattern, setPrevClose } = redisOps;
    const { bootstrapPreviousCloses, ingestBatch } = worker;
    const { getDateET, createETDate } = dateET;
    const { getLastTradingDay, getTradingDay } = timeUtils;
    const { refreshClosingPricesInDB } = closingPricesUtils;
    const { clearRedisPrevCloseCache } = redisCacheUtils;
    const { withRetry } = rateLimiter;

    try {
        // Shared: Get Tickers
        // We use PMP universe (all tiers) or DB fallback
        console.log('\n📊 getting ticker universe...');
        let tickers = await getUniverse('pmp');
        if (tickers.length === 0) {
            console.log('⚠️  Universe is empty, using tickers from database...');
            const dbTickers = await prisma.ticker.findMany({ select: { symbol: true } });
            tickers = dbTickers.map(t => t.symbol);
        }

        if (tickers.length === 0) {
            console.error('❌ No tickers found. Please populate universe first.');
            process.exit(1);
        }
        console.log(`✅ Found ${tickers.length} tickers.`);

        // ==========================================
        // EXECUTE COMMANDS
        // ==========================================

        if (command === 'reset' || command === 'full-reset') {
            console.log('\n--- 🗑️  STEP: HARD RESET ---');

            // 1. Clear Redis
            console.log('🧹 Clearing Redis cache...');
            await clearRedisPrevCloseCache();

            // Clear specific caches
            try {
                await deleteCachedData('heatmap-data');
                // If we have a pattern for stock:* we should clear it too, 
                // but exact pattern logic might vary. Using a known pattern if strictly needed.
                // For now, clearRedisPrevCloseCache handles the main daily refs.
                // Also allow clearing stock specific data?
                // Assuming 'stock:pmp:*' based on previous script analysis
                const keys = await redisOps.redis.keys('stock:pmp:*');
                if (keys.length > 0) {
                    await redisOps.redis.del(keys);
                    console.log(`🧹 Deleted ${keys.length} stock:pmp:* keys`);
                }
            } catch (e) {
                console.warn('⚠️ Non-fatal error clearing extra caches:', e);
            }

            // 2. Reset DB
            console.log('📉 Resetting closing prices in Database (setting to null/zero)...');
            await refreshClosingPricesInDB(true); // hardReset=true

            // 3. Bootstrap Prev Closes
            console.log('🔄 Bootstrapping previous closes from Polygon...');
            const today = getDateET();
            await bootstrapPreviousCloses(tickers, apiKey, today);
            console.log('✅ Bootstrap complete.');
        }

        if (command === 'fill') {
            console.log('\n--- 💉 STEP: FILL MISSING DATA ---');
            // Logic adapted from refresh-close-prices-now.ts

            const today = getDateET();
            const todayDate = createETDate(today);
            const todayTradingDay = getTradingDay(todayDate);
            const yesterdayTradingDay = getLastTradingDay(todayTradingDay);
            const yesterdayDateStr = getDateET(yesterdayTradingDay);
            const todayDateStr = getDateET(todayTradingDay);

            console.log(`📅 Today Trading Day: ${todayDateStr}`);
            console.log(`📅 Prev Trading Day: ${yesterdayDateStr}`);

            // Identify missing
            const tickersNeedingRefresh: string[] = [];
            console.log('🔍 Scanning for missing data...');

            for (const ticker of tickers) {
                // We could batch this DB query for performance, but for a script it's okay-ish 
                // or we could select all DailyRefs and filter in memory if strict on perf.
                // Keeping it simple/safe for now.
                const [yesterdayRef, todayRef] = await Promise.all([
                    prisma.dailyRef.findUnique({
                        where: { symbol_date: { symbol: ticker, date: yesterdayTradingDay } },
                        select: { regularClose: true }
                    }),
                    prisma.dailyRef.findUnique({
                        where: { symbol_date: { symbol: ticker, date: todayTradingDay } },
                        select: { previousClose: true }
                    })
                ]);

                if (!yesterdayRef?.regularClose || !todayRef?.previousClose) {
                    tickersNeedingRefresh.push(ticker);
                }
            }

            console.log(`⚠️  Found ${tickersNeedingRefresh.length} tickers with missing data.`);

            if (tickersNeedingRefresh.length > 0) {
                console.log('🔄 Bootstrapping missing data...');
                await bootstrapPreviousCloses(tickersNeedingRefresh, apiKey, today);
                console.log('✅ Fill complete.');
            } else {
                console.log('✅ No missing data found.');
            }
        }

        if (command === 'ingest' || command === 'full-reset') {
            console.log('\n--- 📥 STEP: INGEST CURRENT PRICES ---');

            let totalIngested = 0;

            for (let i = 0; i < tickers.length; i += batchSize) {
                const batch = tickers.slice(i, i + batchSize);
                const batchNum = Math.floor(i / batchSize) + 1;
                const totalBatches = Math.ceil(tickers.length / batchSize);

                console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);

                try {
                    // Force=true if requested or if we are in full-reset mode (to ensure we get fresh data)
                    // Actually, for 'ingest' command, force defaults to false unless flag passed.
                    // For 'full-reset', we probably want force=true to ensure we populate even if "market closed" logic might skip?
                    // The previous scripts: force-ingest used force=true. manual-ingest used force=false (default).
                    // We'll trust the user flag, but maybe default to true for full-reset?
                    // Let's stick to user flag for consistency, but if full-reset, we explicitly want data.
                    // Let's use `force || command === 'full-reset'` to be safe/thorough for full-reset.

                    const useForce = force || command === 'full-reset';

                    const results = await ingestBatch(batch, apiKey, useForce);
                    const successCount = results.filter(r => r.success).length;
                    totalIngested += successCount;

                    console.log(`  ✅ Success: ${successCount}/${batch.length}`);

                    // Rate limiting (Polygon 5 calls/min on free tier, but assuming tiered key if using this often)
                    // Previous scripts waited 15s or 2s. Let's use a safe 2s if big batch, or 15s if conservative.
                    // Let's stick to a dynamic wait.
                    if (i + batchSize < tickers.length) {
                        const waitMs = 2000;
                        await new Promise(r => setTimeout(r, waitMs));
                    }

                } catch (error) {
                    console.error(`❌ Error in batch ${batchNum}:`, error);
                }
            }
            console.log(`✅ Ingest complete. Processed ${totalIngested} updates.`);
        }

        console.log('\n✅ All operations completed successfully.');

    } catch (error) {
        console.error('\n❌ Fatal Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
