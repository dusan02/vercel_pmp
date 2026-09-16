/**
 * Main ingest loop for snapshot mode.
 *
 * Handles:
 * - Session detection (pre/live/after/closed)
 * - Weekend/holiday bootstrap
 * - 04:00 ET weekday self-healing bootstrap
 * - Ticker prioritization (premium 60s vs rest 5min)
 * - TURBO MODE (first-pass after bootstrap or after-hours entry)
 * - Batch ingestion with rate limiting
 */

import { redisClient } from '@/lib/redis';
import { getUniverse, getPrevClose } from '@/lib/redis/operations';
import { recordSuccess, recordFailure } from '../healthMonitor';
import { detectSession, isMarketHoliday, getTradingDay } from '@/lib/utils/timeUtils';
import { nowET, getDateET, isWeekendET, toET, createETDate } from '@/lib/utils/dateET';
import { prisma } from '@/lib/db/prisma';
import { ingestBatch } from './ingestBatch';
import { bootstrapPreviousCloses } from './bootstrapPrevClose';
import { saveRegularClose } from './saveRegularClose';
import { scheduleBulkPreload } from './bulkPreloadScheduler';

const PREMIUM_INTERVAL = 60 * 1000; // 60s for all sessions
const REST_INTERVAL = 5 * 60 * 1000; // 5min for rest

let saveCloseInFlight = false;
let lastSaveCloseAttempt = 0;

/**
 * Self-healing regular close capture.
 *
 * The official daily close (snapshot day.c) becomes final on the Polygon
 * Starter plan ~15 min after the 16:00 ET close. From 16:20 ET onward during
 * the 'after' session, if DailyRef.regularClose is still missing for today's
 * trading day we run saveRegularClose directly — independent of the
 * post-market-reset PM2 cron (which is a fragile external trigger and has
 * silently died before). saveRegularClose is per-ticker idempotent, so
 * retries only process tickers still missing a close.
 *
 * Runs detached so the ~30-60s of batched fetches + writes never stalls the
 * ingest loop; retried at most every 10 min while data is still missing.
 */
async function maybeSaveRegularClose(
  tickers: string[],
  apiKey: string,
  etNow: Date,
  session: string
): Promise<void> {
  if (session !== 'after') return;

  const etParts = toET(etNow);
  const afterSettle = etParts.hour > 16 || (etParts.hour === 16 && etParts.minute >= 20);
  if (!afterSettle) return;

  if (saveCloseInFlight || Date.now() - lastSaveCloseAttempt < 10 * 60 * 1000) return;

  const calendarDateETStr = getDateET(etNow);
  const todayTradingDay = getTradingDay(createETDate(calendarDateETStr));

  // Cheap sample check: if the first few tickers already have regularClose,
  // saveRegularClose already ran today — skip.
  try {
    const sample = tickers.slice(0, 10);
    const withClose = await prisma.dailyRef.count({
      where: { date: todayTradingDay, symbol: { in: sample }, regularClose: { not: null } }
    });
    if (withClose >= sample.length) return;
  } catch (error) {
    console.warn('regularClose sample check failed:', error);
    return;
  }

  console.log('💾 regularClose missing after 16:20 ET — running saveRegularClose (self-heal)...');
  saveCloseInFlight = true;
  lastSaveCloseAttempt = Date.now();
  saveRegularClose(apiKey, calendarDateETStr, `worker-${Date.now().toString(36)}`)
    .catch(err => console.error('❌ self-heal saveRegularClose failed:', err))
    .finally(() => { saveCloseInFlight = false; });
}

/**
 * Update worker status in Redis (1h TTL).
 */
async function updateWorkerStatus(): Promise<void> {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.setEx('worker:last_success_ts', 3600, Date.now().toString());
    }
  } catch (error) {
    console.warn('Failed to update worker status:', error);
  }
}

/**
 * Check if prevClose is missing and bootstrap if needed.
 * Used for weekend/holiday and 04:00 ET weekday self-healing.
 */
async function maybeBootstrap(
  tickers: string[],
  apiKey: string,
  etNow: Date,
  session: string,
  isWeekendOrHoliday: boolean
): Promise<void> {
  // Weekend/holiday: bootstrap if prevCloses missing
  if (session === 'closed' && isWeekendOrHoliday) {
    const today = getDateET(etNow);
    const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 10));
    if (samplePrevCloses.size === 0) {
      console.log(`🔔 Weekend/Holiday: bootstrapping previous closes for % change...`);
      await bootstrapPreviousCloses(tickers, apiKey, today);
    } else {
      console.log(`🔔 Weekend/Holiday: prevCloses ready, proceeding with Redis ingest (DB protected)`);
    }
    return;
  }

  // Weekday 04:00 ET self-healing
  // Window widened to the full 04:00-04:59 hour: the previous 5-minute window
  // (minute < 5) was too narrow — a slow Polygon response, worker restart, or
  // rate-limit burst at 04:00-04:05 left prevCloses missing until late morning,
  // which made premarket % changes appear late on some days. The bootstrap itself
  // is idempotent (skips tickers that already have prevClose), so re-checking
  // every loop within the hour is cheap (one small Redis sample read).
  if (!isWeekendOrHoliday && (session === 'pre' || session === 'closed')) {
    const etParts = toET(etNow);
    if (etParts.hour === 4) {
      const today = getDateET(etNow);
      const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 5));
      if (samplePrevCloses.size === 0) {
        console.log('🌅 04:00 ET weekday bootstrap: prevClose missing — bootstrapping...');
        await bootstrapPreviousCloses(tickers, apiKey, today);
      }
    }
  }
}

/**
 * Determine which tickers need update based on priority intervals.
 * Returns prioritized list (premium first, then rest).
 */
async function getTickersNeedingUpdate(
  tickers: string[],
  session: string
): Promise<{ prioritized: string[]; premium: number; rest: number }> {
  const { getAllProjectTickers } = await import('@/data/defaultTickers');
  const premiumTickers = getAllProjectTickers('pmp').slice(0, 200);
  const lastUpdateMap = new Map<string, number>();

  // Load last update times from Redis hash
  if (redisClient && redisClient.isOpen) {
    try {
      const hashKey = 'freshness:last_update';
      const timestamps = await redisClient.hGetAll(hashKey);
      tickers.forEach((ticker) => {
        const ts = timestamps[ticker];
        if (ts) {
          const timestamp = parseInt(ts, 10);
          if (!isNaN(timestamp)) {
            lastUpdateMap.set(ticker, timestamp);
          }
        }
      });
    } catch (error) {
      console.warn('Failed to load freshness timestamps from Redis:', error);
    }
  }

  const now = Date.now();
  const needingUpdate = tickers.filter(ticker => {
    const lastUpdate = lastUpdateMap.get(ticker) || 0;
    const interval = premiumTickers.includes(ticker) ? PREMIUM_INTERVAL : REST_INTERVAL;
    return (now - lastUpdate) >= interval;
  });

  const premiumNeeding = needingUpdate.filter(t => premiumTickers.includes(t));
  const restNeeding = needingUpdate.filter(t => !premiumTickers.includes(t));

  return {
    prioritized: [...premiumNeeding, ...restNeeding],
    premium: premiumNeeding.length,
    rest: restNeeding.length,
  };
}

/**
 * Apply TURBO MODE: force-update all tickers on first pre-market pass after bootstrap
 * or first after-hours entry (for fast earnings data).
 * Returns the ticker list to process (may be expanded to all tickers).
 */
async function maybeApplyTurboMode(
  tickers: string[],
  prioritized: string[],
  session: string,
  etNow: Date
): Promise<string[]> {
  const now = Date.now();

  const bootstrapTs = parseInt(await redisClient.get('worker:last_bootstrap_ts') || '0', 10);
  const isPostBootstrap = session === 'pre' && (now - bootstrapTs) < 10 * 60 * 1000;
  const isAfterHoursEntry = session === 'after';

  if (!isPostBootstrap && !isAfterHoursEntry) {
    return prioritized;
  }

  const turboKey = isPostBootstrap
    ? `worker:last_turbo_pass:${getDateET(etNow)}`
    : `worker:last_ah_turbo_pass:${getDateET(etNow)}`;
  const lastTurboPass = await redisClient.get(turboKey);

  if (lastTurboPass) {
    return prioritized; // Already did turbo pass today
  }

  console.log(`🚀 TURBO MODE: Performing first-pass ${isPostBootstrap ? 'pre-market' : 'after-hours'} refresh...`);
  await redisClient.setEx(turboKey, 3600, now.toString());
  return tickers; // All tickers
}

/**
 * Main ingest loop. Called every 60 seconds.
 */
export async function ingestLoop(apiKey: string): Promise<void> {
  const loopStartTime = Date.now();
  let totalIngestSuccess = 0;

  try {
    const etNow = nowET();
    const session = detectSession(etNow);

    // Schedule bulk preload (DST-safe, with lock)
    await scheduleBulkPreload();

    // Get tickers from Redis
    const tickers = await getUniverse('sp500');
    if (tickers.length === 0) {
      console.log('⚠️ Universe is empty, waiting...');
      return;
    }

    const isWeekendOrHoliday = isWeekendET(etNow) || isMarketHoliday(etNow);

    // Bootstrap prevCloses if needed
    await maybeBootstrap(tickers, apiKey, etNow, session, isWeekendOrHoliday);

    // Capture today's regular close once it is final (≥16:20 ET, 'after' session)
    await maybeSaveRegularClose(tickers, apiKey, etNow, session);

    // Session logging
    if (session === 'pre' || session === 'after') {
      console.log(`🌅 Pre-market/After-hours mode (session: ${session}) - ingesting prices...`);
    } else if (session === 'closed' && !isWeekendOrHoliday) {
      console.log(`🌙 Off-hours (session: ${session}) - ingesting available prices...`);
    } else {
      console.log(`📊 Market open (session: ${session}), ingesting with prioritization...`);
    }

    // Determine which tickers need update
    const { prioritized, premium, rest } = await getTickersNeedingUpdate(tickers, session);

    if (prioritized.length === 0) {
      console.log('⏭️ No tickers need update yet (within refresh intervals)');
      await recordSuccess('ingestLoop', 0);
      return;
    }

    // Apply turbo mode if applicable
    const processedTickers = await maybeApplyTurboMode(tickers, prioritized, session, etNow);

    if (processedTickers.length > prioritized.length) {
      console.log(`🚀 Processing ${processedTickers.length} tickers (TURBO: all tickers, was ${prioritized.length})`);
    } else {
      console.log(`📊 Processing ${processedTickers.length} tickers: ${premium} premium (60s), ${rest} rest (5min)`);
    }

    // Rate-limit config
    const envLimit = parseInt(process.env.POLYGON_MAX_REQUESTS_PER_MINUTE || '250', 10);
    const envBatchSize = parseInt(process.env.POLYGON_MAX_BATCH_SIZE || '100', 10);
    const batchSize = Math.min(100, Math.max(1, envBatchSize));
    const delayBetweenBatches = Math.ceil((60 * 1000) / (envLimit / batchSize));

    // Batch processing
    for (let i = 0; i < processedTickers.length; i += batchSize) {
      const batch = processedTickers.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(processedTickers.length / batchSize);
      console.log(`📥 Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);

      try {
        const results = await ingestBatch(batch, apiKey);
        const successSymbols = results.filter(r => r.success).map(r => r.symbol);
        totalIngestSuccess += successSymbols.length;

        // Update freshness metrics
        if (redisClient && redisClient.isOpen && successSymbols.length > 0) {
          const { updateFreshnessTimestampsBatch } = await import('@/lib/utils/freshnessMetrics');
          const freshnessUpdates = new Map<string, number>();
          successSymbols.forEach(ticker => freshnessUpdates.set(ticker, Date.now()));
          await updateFreshnessTimestampsBatch(freshnessUpdates).catch(err => {
            console.warn('Failed to update freshness metrics:', err);
          });
        }
      } catch (error) {
        console.error(`Error in batch ${i}:`, error);
      }

      // Delay between batches
      if (i + batchSize < processedTickers.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    const loopDuration = Date.now() - loopStartTime;
    console.log(`✅ ingestLoop completed: ${totalIngestSuccess} tickers updated in ${loopDuration}ms`);

    await recordSuccess('ingestLoop', totalIngestSuccess);

    // Always update worker status on successful loop completion.
    // During off-hours (market closed), 0 tickers may be "updated" because
    // snapshot data is unchanged — the worker is still alive and healthy.
    await updateWorkerStatus();
  } catch (error) {
    console.error('❌ Ingest loop failed:', error);
    await recordFailure('ingestLoop', error instanceof Error ? error.message : String(error));
  }
}
