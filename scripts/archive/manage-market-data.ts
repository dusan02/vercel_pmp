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
        ? parseInt(args[batchSizeIdx + 1]!, 10)
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
    ] = await Promise.all([
        import('../src/lib/db/prisma'),
        import('@/lib/redis/operations'),
        import('@/workers/polygonWorker'),
        import('@/lib/utils/dateET'),
        import('@/lib/utils/timeUtils'),
        import('@/lib/utils/closingPricesUtils'),
        import('@/lib/utils/redisCacheUtils'),
    ]);

    const { getUniverse } = redisOps;
    const { bootstrapPreviousCloses, ingestBatch } = worker;
    const { getDateET, createETDate } = dateET;
    const { getLastTradingDay, getTradingDay } = timeUtils;
    const { refreshClosingPricesInDB } = closingPricesUtils;
    const { clearRedisPrevCloseCache } = redisCacheUtils;

    try {
        // Shared: Get Tickers
        // We use PMP universe (all tiers) or DB fallback
        console.log('\n📊 getting ticker universe...');
        let tickers: string[] = []; try { tickers = await getUniverse('pmp'); } catch (e) { console.warn(' Redis universe fetch failed, falling back to DB...'); }
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

            // Clear all relevant Redis key patterns using SCAN (never KEYS — blocks Redis)
            try {
                const { redisClient: redisC } = await import('../src/lib/redis/client');
                if (redisC && redisC.isOpen) {
                    const scanAndDelete = async (pattern: string): Promise<number> => {
                        const toDelete: string[] = [];
                        for await (const key of (redisC as any).scanIterator({ MATCH: pattern, COUNT: 200 })) {
                            toDelete.push(key);
                        }
                        if (toDelete.length > 0) await redisC.del(toDelete);
                        return toDelete.length;
                    };

                    const patterns: [string, string][] = [
                        ['stock:pmp:*',       'stock price cache'],
                        ['rank:*',            'rank indexes'],
                        ['stats:*',           'stats cache'],
                        ['heatmap:*',         'heatmap cache'],
                        ['last:*',            'live price cache'],
                        ['freshness:*',       'freshness metrics'],
                    ];

                    for (const [pattern, label] of patterns) {
                        const n = await scanAndDelete(pattern);
                        if (n > 0) console.log(`🧹 Deleted ${n} ${label} (${pattern})`);
                    }

                    // Single key deletes
                    await redisC.del('bulk:last_success_ts').catch(() => {});
                } else {
                    console.warn('⚠️ Redis not available — skipping key-pattern clearing');
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

            const today = getDateET();
            const todayDate = createETDate(today);
            const todayTradingDay = getTradingDay(todayDate);
            const yesterdayTradingDay = getLastTradingDay(todayTradingDay);

            console.log(`📅 Today Trading Day:  ${getDateET(todayTradingDay)}`);
            console.log(`📅 Prev Trading Day:   ${getDateET(yesterdayTradingDay)}`);
            console.log('🔍 Scanning for missing data (batch query)...');

            // Batch query instead of N+1 per-ticker queries
            const [yesterdayRefs, todayRefs] = await Promise.all([
                prisma.dailyRef.findMany({
                    where: { date: yesterdayTradingDay, symbol: { in: tickers } },
                    select: { symbol: true, regularClose: true }
                }),
                prisma.dailyRef.findMany({
                    where: { date: todayTradingDay, symbol: { in: tickers } },
                    select: { symbol: true, previousClose: true }
                })
            ]);

            const prevCloseBySymbol = new Map(yesterdayRefs.map(r => [r.symbol, r.regularClose]));
            const todayPrevBySymbol = new Map(todayRefs.map(r => [r.symbol, r.previousClose]));

            const tickersNeedingRefresh = tickers.filter(t =>
                !prevCloseBySymbol.get(t) || !todayPrevBySymbol.get(t)
            );

            console.log(`⚠️  Found ${tickersNeedingRefresh.length} / ${tickers.length} tickers with missing data.`);

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
        // Disconnect Redis — without this the process hangs indefinitely
        try {
            const { redisClient: rc } = await import('../src/lib/redis/client');
            if (rc && rc.isOpen) await rc.disconnect();
        } catch (_) {}
        process.exit(0);
    }
}

main();
