/**
 * Polygon Worker — entry point / orchestrator.
 *
 * Two modes:
 * - MODE=refs:    Daily Reference tasks (universe refresh, bootstrap prevCloses)
 * - MODE=snapshot: Continuous snapshot ingestion (default, production)
 *
 * Re-exports for cron routes:
 *   saveRegularClose, ingestBatch, bootstrapPreviousCloses
 */

import { getUniverse, getPrevClose } from '@/lib/redis/operations';
import { redisClient } from '@/lib/redis';
import { getDateET, createETDate, toET, isWeekendET, nowET } from '@/lib/utils/dateET';
import { getLastTradingDay, getTradingDay, isMarketHoliday } from '@/lib/utils/timeUtils';

import { saveRegularClose } from './polygon/saveRegularClose';
import { ingestBatch } from './polygon/ingestBatch';
import { bootstrapPreviousCloses } from './polygon/bootstrapPrevClose';
import { refreshUniverseAtStartup, refreshUniverseFromDB } from './polygon/universeManager';
import { ingestLoop } from './polygon/ingestLoop';

export { saveRegularClose, ingestBatch, bootstrapPreviousCloses };

async function main() {
  const mode = process.env.MODE || 'snapshot';
  const apiKey = process.env.POLYGON_API_KEY;

  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }

  // Startup: refresh universe from DB
  await refreshUniverseAtStartup();

  if (mode === 'refs') {
    console.log('🔄 Starting refs worker...');
    await runRefsScheduler(apiKey);
  } else {
    console.log('🔄 Starting snapshot worker...');
    runSnapshotLoop(apiKey);
  }
}

/**
 * Refs mode: periodic daily reference tasks (every 60s check).
 * - 03:30 ET: refresh universe from DB
 * - 04:00 ET or if missing/stale: bootstrap previous closes
 */
async function runRefsScheduler(apiKey: string): Promise<void> {
  const scheduleTask = async () => {
    const now = new Date();
    const et = toET(now);
    const hours = et.hour;
    const minutes = et.minute;

    // 03:30 ET — refresh universe
    if (hours === 3 && minutes === 30) {
      console.log('🔄 Refreshing universe from DB...');
      await refreshUniverseFromDB();
    }

    // Bootstrap previous closes (04:00 ET or if missing/stale)
    const today = getDateET(now);
    const tickers = await getUniverse('sp500');

    if (tickers.length > 0 && today) {
      const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 10));

      let isStale = false;
      try {
        const { prisma } = await import('@/lib/db/prisma');
        const expectedPrevYMD = getDateET(getLastTradingDay(getTradingDay(createETDate(today))));
        const sampleSymbols = tickers.slice(0, 25);
        const rows = await prisma.ticker.findMany({
          where: { symbol: { in: sampleSymbols } },
          select: { latestPrevCloseDate: true }
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (!r.latestPrevCloseDate) continue;
          const ymd = r.latestPrevCloseDate.toISOString().slice(0, 10);
          counts.set(ymd, (counts.get(ymd) || 0) + 1);
        }
        const modeDate = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (modeDate && expectedPrevYMD && modeDate < expectedPrevYMD) {
          isStale = true;
        }
      } catch {
        // Non-fatal
      }

      const staleWindowOk = minutes % 30 === 0;
      const shouldBootstrap =
        (hours === 4 && minutes === 0) ||
        (samplePrevCloses.size === 0 && hours >= 0 && hours < 16) ||
        (isStale && hours >= 0 && hours < 16 && staleWindowOk);

      if (shouldBootstrap) {
        console.log('🔄 Bootstrapping previous closes...');
        await bootstrapPreviousCloses(tickers, apiKey, today);
        if (redisClient && redisClient.isOpen) {
          await redisClient.set('worker:last_bootstrap_ts', Date.now().toString());
        }
      }
    }
  };

  const runTask = async () => {
    try {
      await scheduleTask();
    } catch (error) {
      console.error('Error in scheduleTask:', error);
    } finally {
      setTimeout(runTask, 60000);
    }
  };
  runTask();
}

/**
 * Snapshot mode: continuous ingestion loop (every 60s).
 */
function runSnapshotLoop(apiKey: string): void {
  const runIngestLoop = async () => {
    const loopStartTime = Date.now();
    try {
      await ingestLoop(apiKey);
    } catch (error) {
      console.error('Unhandled error in ingestLoop:', error);
    } finally {
      const elapsed = Date.now() - loopStartTime;
      const etNow = nowET();
      const etParts = toET(etNow);

      let waitMs = Math.max(5000, 60000 - elapsed);

      // If market is closed on a weekday morning within 2 minutes of 04:00 ET premarket open,
      // target waking up right at 04:00:02 ET so the first premarket batch runs immediately.
      if (!isWeekendET(etNow) && !isMarketHoliday(etNow) && etParts.hour === 3 && etParts.minute >= 58) {
        const msUntil4am = ((59 - etParts.minute) * 60 + (60 - etParts.second) + 2) * 1000;
        if (msUntil4am > 1000 && msUntil4am < 130000) {
          waitMs = msUntil4am;
          console.log(`⏰ Scheduled next ingest pass in ${(waitMs / 1000).toFixed(0)}s to align with 04:00:02 ET premarket open`);
        }
      }

      setTimeout(runIngestLoop, waitMs);
    }
  };
  runIngestLoop();
}

// Prevent crashes from unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection (non-fatal):', reason);
});
process.on('uncaughtException', (error) => {
  console.error('⚠️ Uncaught Exception (non-fatal):', error.message);
});

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Worker error:', error);
    process.exit(1);
  });
}
