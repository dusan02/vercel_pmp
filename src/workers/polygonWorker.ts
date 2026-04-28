/**
 * Polygon Worker - Batch ingest stock data
 * 
 * This worker:
 * 1. Fetches snapshot/aggs from Polygon API (batch 60-80 tickers)
 * 2. Normalizes data
 * 3. Upserts to DB (only if newer timestamp)
 * 4. Writes to Redis (hot cache)
 * 5. Publishes to Redis Pub/Sub for WebSocket updates
 */

import {
  setPrevClose,
  getPrevClose,
  publishTick,
  getUniverse,
  addToUniverse,
  atomicUpdatePrice
} from '@/lib/redis/operations';
import { redisClient } from '@/lib/redis';
import { recordSuccess, recordFailure } from './healthMonitor';
import { PriceData } from '@/lib/types';
import { detectSession, isMarketOpen, isMarketHoliday, mapToRedisSession, getLastTradingDay, getTradingDay } from '@/lib/utils/timeUtils';
import { nowET, getDateET, createETDate, isWeekendET, toET } from '@/lib/utils/dateET';
import { resolveEffectivePrice, calculatePercentChange } from '@/lib/utils/priceResolver';
import { getPricingState, canOverwritePrice, getPreviousCloseTTL, PriceState } from '@/lib/utils/pricingStateMachine';
import { withRetry, circuitBreaker } from '@/lib/api/rateLimiter';
// DLQ import - commented out to avoid startup issues
// import { addToDLQ } from '@/lib/dlq';
import { updateRankIndexes, updateStatsCache, getRankMinMax } from '@/lib/redis/ranking';
import { computeMarketCap, computeMarketCapDiff, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { getPolygonClient } from '@/lib/clients/polygonClient';
import { prisma } from '@/lib/db/prisma';
import { processBatchWithConcurrency } from '@/lib/batchProcessor';
import type { MarketSession } from '@/lib/types';

// Circuit breaker for Polygon API
import { polygonCircuitBreaker, __IS_TEST__, sleep, PolygonSnapshot } from './polygon/shared';
import { fetchPolygonSnapshot, normalizeSnapshot, upsertToDB } from './polygon/core';
import { saveRegularClose } from './polygon/saveRegularClose';
import { ingestBatch } from './polygon/ingestBatch';
import { bootstrapPreviousCloses } from './polygon/bootstrapPrevClose';
export { saveRegularClose, ingestBatch, bootstrapPreviousCloses };
async function main() {
  const mode = process.env.MODE || 'snapshot';
  const apiKey = process.env.POLYGON_API_KEY;

  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }

  if (mode === 'refs') {
    // Daily reference tasks
    console.log('🔄 Starting refs worker...');

    // Schedule tasks based on ET time
    const scheduleTask = async () => {
      const now = new Date(); // real instant
      const et = toET(now);
      const hours = et.hour;
      const minutes = et.minute;

      // 03:30 ET - Refresh universe
      if (hours === 3 && minutes === 30) {
        console.log('🔄 Refreshing universe...');
        try {
          const { getAllProjectTickers } = await import('@/data/defaultTickers');
          const tickers = getAllProjectTickers('pmp');
          console.log(`📊 Adding ${tickers.length} tickers to universe:sp500...`);

          for (const ticker of tickers) {
            await addToUniverse('sp500', [ticker]);
          }

          console.log(`✅ Universe refreshed: ${tickers.length} tickers added to universe:sp500`);
        } catch (error) {
          console.error('❌ Error refreshing universe:', error);
        }
      }

      // Bootstrap previous closes (04:00 ET or if missing)
      const today = getDateET(now);
      const tickers = await getUniverse('sp500');

      if (tickers.length > 0 && today) {
        const { getPrevClose } = await import('@/lib/redis/operations');
        const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 10));

        // Bootstrap if:
        // 1) It's 04:00 ET (normal daily bootstrap)
        // 2) Previous closes are missing (any time before market close)
        // 3) Previous closes are present but STALE vs expected trading day (self-heal)
        //
        // NOTE: Our Redis prevClose cache doesn't store the trading-day date, only the number.
        // To detect staleness we sample the DB `latestPrevCloseDate` for a small set of tickers.
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
          const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
          if (mode && expectedPrevYMD && mode < expectedPrevYMD) {
            isStale = true;
          }
        } catch {
          // Non-fatal: if DB is unavailable we fall back to missing-cache logic.
        }

        // Rate-limit stale-trigger bootstraps to every 30 minutes to avoid Polygon spam
        const staleWindowOk = minutes % 30 === 0;

        const shouldBootstrap =
          (hours === 4 && minutes === 0) ||
          (samplePrevCloses.size === 0 && hours >= 0 && hours < 16) ||
          (isStale && hours >= 0 && hours < 16 && staleWindowOk);

        if (shouldBootstrap) {
          console.log('🔄 Bootstrapping previous closes...');
          await bootstrapPreviousCloses(tickers, apiKey, today);
          // NEW: Track bootstrap time for cold-start turbo mode
          if (redisClient && redisClient.isOpen) {
            await redisClient.set('worker:last_bootstrap_ts', Date.now().toString());
          }
        }
      }

      // 16:00-17:00 ET - Save regular close (with retry logic for early closes)
      // Retry every 5 minutes until 17:00 ET or until all tickers have regular close
      if (hours >= 16 && hours < 17) {
        // Check if we need to save regular close
        const { redisClient } = await import('@/lib/redis');
        if (redisClient && redisClient.isOpen) {
          const lastRegularCloseSave = await redisClient.get(`regular_close:last_save:${today}`);
          const now = Date.now();
          const fiveMinAgo = now - (5 * 60 * 1000);

          // Save/retry if: (1) first time (16:00), or (2) last save was > 5 min ago
          const shouldSave = !lastRegularCloseSave || parseInt(lastRegularCloseSave, 10) < fiveMinAgo;

          if (shouldSave) {
            // Check if regular close is missing for any tickers
            // Use stratified sample: top 50 (premium) + random 50 (to catch batch failures)
            const tickers = await getUniverse('sp500');
            const { getAllProjectTickers } = await import('@/data/defaultTickers');
            const premiumTickers = getAllProjectTickers('pmp').slice(0, 50);
            // Reservoir sampling for random 50 (O(n) instead of O(n log n), more uniform distribution)
            const remainingTickers = tickers.filter(t => !premiumTickers.includes(t));
            const randomTickers: string[] = [];
            const randomCount = Math.min(50, remainingTickers.length);

            // Fisher-Yates shuffle for first N elements (more efficient than full sort)
            for (let i = 0; i < randomCount; i++) {
              const j = Math.floor(Math.random() * (remainingTickers.length - i)) + i;
              const temp = remainingTickers[i];
              if (temp && remainingTickers[j]) {
                remainingTickers[i] = remainingTickers[j];
                remainingTickers[j] = temp;
                randomTickers.push(temp);
              }
            }

            const sampleTickers = [...premiumTickers, ...randomTickers];

            const { prisma } = await import('@/lib/db/prisma');
            const dateObj = createETDate(today);

            const missingCount = await prisma.dailyRef.count({
              where: {
                symbol: { in: sampleTickers },
                date: dateObj,
                regularClose: null
              }
            });

            if (missingCount > 0 || !lastRegularCloseSave) {
              const runId = Date.now().toString(36);
              console.log(`🔄 [runId:${runId}] Saving regular close (retry: ${!!lastRegularCloseSave})...`);
              await saveRegularClose(apiKey, today, runId);
              await redisClient.setEx(`regular_close:last_save:${today}`, 3600, now.toString());
            }
          }
        } else {
          // Fallback: save at 16:00 ET if Redis unavailable
          // Guard: check if already saved for today (safe by design)
          if (hours === 16 && minutes === 0) {
            try {
              const { prisma } = await import('@/lib/db/prisma');
              const { createETDate } = await import('@/lib/utils/dateET');
              const { getLastTradingDay } = await import('@/lib/utils/timeUtils');
              const todayDate = createETDate(today);
              const todayTradingDay = getLastTradingDay(todayDate);

              // Check if regular close already saved for today
              const existingDailyRef = await prisma.dailyRef.findFirst({
                where: {
                  date: todayTradingDay,
                  regularClose: { not: null }
                },
                select: { symbol: true }
              });

              if (!existingDailyRef) {
                // Not saved yet - safe to save
                const runId = Date.now().toString(36);
                console.log(`🔄 [runId:${runId}] Saving regular close (Redis unavailable, fallback - not saved yet)...`);
                await saveRegularClose(apiKey, today, runId);
              } else {
                console.log(`⏭️  Skipping fallback saveRegularClose - already saved for ${todayTradingDay.toISOString().split('T')[0]}`);
              }
            } catch (fallbackError) {
              console.warn('⚠️  Failed to check if regular close already saved (fallback):', fallbackError);
              // Continue anyway - better to save twice than not at all
              const runId = Date.now().toString(36);
              console.log(`🔄 [runId:${runId}] Saving regular close (Redis unavailable, fallback - check failed)...`);
              await saveRegularClose(apiKey, today, runId);
            }
          }
        }
      }
    };

    // Check every minute
    setInterval(scheduleTask, 60000);
    scheduleTask(); // Run immediately

  } else if (mode === 'snapshot') {
    // Continuous snapshot ingest
    console.log('🔄 Starting snapshot worker...');

    // Update worker status in Redis
    const updateWorkerStatus = async () => {
      try {
        const { redisClient } = await import('@/lib/redis');
        if (redisClient && redisClient.isOpen) {
          await redisClient.setEx('worker:last_success_ts', 3600, Date.now().toString()); // 1 hour TTL
        }
      } catch (error) {
        console.warn('Failed to update worker status:', error);
      }
    };

    // DST-safe bulk preloader scheduler
    const scheduleBulkPreload = async () => {
      const etNow = nowET();
      const et = toET(etNow);
      const hours = et.hour;
      const minutes = et.minute;
      const dayOfWeek = et.weekday;

      // Pre-market + live trading: 07:30-15:55 ET (DST-safe via toET())
      // Stop at 15:55 to avoid overlap with regular close save at 16:00
      const isPreMarketOrLive = (hours >= 7 && hours < 15) ||
        (hours === 7 && minutes >= 30) ||
        (hours === 15 && minutes < 55);

      // Only on weekdays (1-5 = Monday-Friday)
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

      if (!isPreMarketOrLive || !isWeekday) {
        return; // Outside bulk preload window
      }

      // Check if last bulk preload was > 5 min ago
      const { redisClient } = await import('@/lib/redis');
      if (!redisClient || !redisClient.isOpen) {
        return;
      }

      const lastPreloadKey = 'bulk:last_preload_ts';
      const lastPreloadStr = await redisClient.get(lastPreloadKey);
      const now = Date.now();
      const fiveMinAgo = now - (5 * 60 * 1000);

      // Check timestamp (not TTL-based gating)
      if (lastPreloadStr && parseInt(lastPreloadStr, 10) >= fiveMinAgo) {
        return; // Too soon since last preload
      }

      // Acquire lock to prevent parallel execution
      const { withLock } = await import('@/lib/utils/redisLocks');
      const { preloadBulkStocks } = await import('./backgroundPreloader');

      const result = await withLock(
        'bulk_preload',
        8 * 60, // 8 min TTL (2x typical runtime ~3-4 min, prevents expiration during run)
        async () => {
          console.log('🔄 Running DST-safe bulk preload...');
          const apiKey = process.env.POLYGON_API_KEY;
          if (!apiKey) {
            console.warn('⚠️ POLYGON_API_KEY not set, skipping bulk preload');
            return;
          }

          // Import and run bulk preload logic
          const { preloadBulkStocks } = await import('./backgroundPreloader');
          const tickers = await getUniverse('sp500');
          if (tickers.length === 0) {
            return;
          }

          // Generate correlation ID for this run
          const runId = Date.now().toString(36);

          // Run bulk preload with duration tracking
          const preloadStartTime = Date.now();
          let preloadSuccess = true;
          let preloadError: string | null = null;

          console.log(`🔄 [runId:${runId}] Starting bulk preload...`);

          try {
            await preloadBulkStocks(apiKey);
            const preloadDuration = Date.now() - preloadStartTime;
            const preloadDurationMin = preloadDuration / (60 * 1000);

            // Max runtime alarms (warn at 6 min, error at 10 min)
            if (preloadDurationMin > 10) {
              const errorMsg = `Bulk preload took ${preloadDurationMin.toFixed(1)}min (exceeds 10min threshold) - possible Polygon/Redis/DB slowdown`;
              console.error(`❌ [runId:${runId}] ${errorMsg}`);
              await redisClient.set('bulk:last_error', errorMsg);
            } else if (preloadDurationMin > 6) {
              console.warn(`⚠️ [runId:${runId}] Bulk preload took ${preloadDurationMin.toFixed(1)}min (exceeds 6min threshold) - monitoring for slowdown`);
            }

            // Update last preload timestamp and metrics (no TTL - persistent, not TTL-based gating)
            await redisClient.set(lastPreloadKey, now.toString());
            await redisClient.set('bulk:last_duration_ms', preloadDuration.toString());
            await redisClient.set('bulk:last_success_ts', now.toString());
            if (preloadDurationMin <= 10) {
              await redisClient.del('bulk:last_error'); // Clear error on success (unless exceeded 10min)
            }

            // Check for stale bulk preload (alert if age > 10 min during window 07:30-15:55)
            const etNow = nowET();
            const et = toET(etNow);
            const hours = et.hour;
            const minutes = et.minute;
            const isPreMarketOrLive = (hours >= 7 && hours < 15) ||
              (hours === 7 && minutes >= 30) ||
              (hours === 15 && minutes < 55);

            if (isPreMarketOrLive) {
              const bulkAgeMinutes = Math.floor((now - parseInt(await redisClient.get('bulk:last_success_ts') || '0', 10)) / 60000);
              if (bulkAgeMinutes > 10) {
                console.error(`ALERT: [runId:${runId}] Bulk preload stale - last success ${bulkAgeMinutes}min ago (threshold: 10min) during market hours`);
              }
            }

            console.log(`✅ [runId:${runId}] Bulk preload completed in ${preloadDuration}ms (${preloadDurationMin.toFixed(1)}min)`);
          } catch (error) {
            preloadSuccess = false;
            preloadError = error instanceof Error ? error.message : String(error);
            const preloadDuration = Date.now() - preloadStartTime;

            await redisClient.set('bulk:last_duration_ms', preloadDuration.toString());
            await redisClient.set('bulk:last_error', preloadError);

            console.error(`❌ Bulk preload failed after ${preloadDuration}ms:`, error);
            throw error; // Re-throw to let withLock handle it
          }
        }
      );

      if (result === null) {
        // Lock acquisition failed (another process is running it)
        console.log('⏸️ Bulk preload already running, skipping...');
      }
    };

    const ingestLoop = async () => {
      const loopStartTime = Date.now();
      let totalIngestSuccess = 0;

      try {
        const etNow = nowET();
        const session = detectSession(etNow);

      // --- Regular close + next-day prevClose (CRITICAL) ---
      // In production we run the worker in MODE=snapshot (see PM2 ecosystem).
      // Previously, regular close saving (and preparing nextTradingDay prevClose) only ran in MODE=refs,
      // which meant "previous close available shortly after market close" was not guaranteed.
      //
      // Goal: have regularClose/prevClose available ASAP after 16:00 ET (target: ~5 minutes).
      // Strategy: attempt at 16:05 ET and retry every 5 minutes until 17:00 ET, with Redis throttling + DB idempotency.
      try {
        const et = toET(etNow);
        const hours = et.hour;
        const minutes = et.minute;

        // Window 16:05 - 16:59 ET (retry every 5 minutes)
        const inCloseWindow = hours === 16 && minutes >= 5;
        const isRetryMinute = (minutes % 5) === 0;

        if (inCloseWindow && isRetryMinute) {
          const today = getDateET(etNow);

          const throttleKey = `regular_close:last_save:${today}`;
          const nowMs = Date.now();

          // Throttle: don't run more often than every ~4 minutes even if loop timing jitters
          const lastStr = (redisClient && redisClient.isOpen) ? await redisClient.get(throttleKey) : null;
          const lastMs = lastStr ? parseInt(lastStr, 10) : 0;
          const tooSoon = lastMs && (nowMs - lastMs) < (4 * 60 * 1000);

          if (!tooSoon) {
            const runId = nowMs.toString(36);
            console.log(`🔔 [runId:${runId}] Snapshot worker: attempting saveRegularClose (ET ${hours}:${String(minutes).padStart(2, '0')})...`);
            await saveRegularClose(apiKey, today, runId);
            if (redisClient && redisClient.isOpen) {
              await redisClient.setEx(throttleKey, 3600, nowMs.toString());
            }
          }
        }
      } catch (e) {
        // Non-fatal: regular close save failures should not stop ingest loop
        console.warn('⚠️ Snapshot worker: saveRegularClose attempt failed:', e);
      }

      // Schedule bulk preload (DST-safe, with lock)
      await scheduleBulkPreload();

      // Always try to ingest (even when market closed, we can get previous close)
      const tickers = await getUniverse('sp500'); // Get from Redis

      if (tickers.length === 0) {
        console.log('⚠️ Universe is empty, waiting...');
        return;
      }

      // CRITICAL: For premarketprice.com, we MUST ingest pre-market and after-hours data!
      // Only skip on weekends/holidays (true closed days)
      const isWeekendOrHoliday = isWeekendET(etNow) || isMarketHoliday(etNow);

      if (session === 'closed' && isWeekendOrHoliday) {
        // Weekend/holiday: bootstrap prevCloses if missing (needed for % change calculation),
        // then fall through to normal ingest. State machine has canOverwrite:false so DB is safe.
        const today = getDateET(etNow);
        const { getPrevClose } = await import('@/lib/redis/operations');
        const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 10));

        if (samplePrevCloses.size === 0) {
          console.log(`🔔 Weekend/Holiday: bootstrapping previous closes for % change...`);
          await bootstrapPreviousCloses(tickers, apiKey, today);
        } else {
          console.log(`🔔 Weekend/Holiday: prevCloses ready, proceeding with Redis ingest (DB protected)`);
        }
        // Fall through to normal ingest below — canOverwrite:false prevents DB overwrites
      }

      // Weekday 04:00 ET bootstrap (self-healing for snapshot mode — MODE=refs never runs)
      // If post-market-daily-reset failed the previous evening, prevClose stays stale until this runs.
      if (!isWeekendOrHoliday && session === 'closed') {
        const etParts = toET(etNow);
        if (etParts.hour === 4 && etParts.minute < 5) {
          const today = getDateET(etNow);
          const { getPrevClose } = await import('@/lib/redis/operations');
          const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 5));
          if (samplePrevCloses.size === 0) {
            console.log('🌅 04:00 ET weekday bootstrap: prevClose missing — bootstrapping...');
            await bootstrapPreviousCloses(tickers, apiKey, today);
          }
        }
      }

      // For pre-market, after-hours, live, or closed (but not weekend/holiday) - INGEST DATA!
      // This is critical for premarketprice.com - we need pre-market prices!
      if (session === 'pre' || session === 'after') {
        console.log(`🌅 Pre-market/After-hours mode (session: ${session}) - ingesting pre-market prices...`);
      } else if (session === 'closed' && !isWeekendOrHoliday) {
        // Closed but not weekend/holiday (e.g., before 4:00 AM or after 8:00 PM) - still ingest
        console.log(`🌙 Off-hours (session: ${session}) - ingesting available prices...`);
      } else {
        console.log(`📊 Market open (session: ${session}), ingesting with prioritization...`);
      }

      // Prioritize tickers: top 200 get frequent updates (60s), rest less frequent (5min)
      // For pre-market/after-hours, use longer intervals (5min for all)
      const { getAllProjectTickers } = await import('@/data/defaultTickers');
      // Load last update times from Redis (persistent across restarts)
      const lastUpdateMap = new Map<string, number>();
      const premiumTickers = getAllProjectTickers('pmp').slice(0, 200); // Top 200



      // Adjust intervals based on session
      // Goal: keep major tickers highly fresh even in pre-market, while keeping overall API load reasonable.
      const isPreMarket = session === 'pre';
      const isOffHours = session === 'after' || (session === 'closed' && !isWeekendOrHoliday);
      const PREMIUM_INTERVAL = isPreMarket ? 60 * 1000 : isOffHours ? 2 * 60 * 1000 : 60 * 1000; // pre: 60s, off-hours: 2min, live: 60s
      const REST_INTERVAL = 5 * 60 * 1000; // keep rest at 5min to avoid rate-limit pressure

      // Load last update times from Redis (using freshness metrics hash - O(1))
      if (redisClient && redisClient.isOpen) {
        try {
          const { getFreshnessMetrics } = await import('@/lib/utils/freshnessMetrics');
          const hashKey = 'freshness:last_update';
          const timestamps = await redisClient.hGetAll(hashKey);

          tickers.forEach((ticker) => {
            const timestampStr = timestamps[ticker];
            if (timestampStr) {
              const timestamp = parseInt(timestampStr, 10);
              if (!isNaN(timestamp)) {
                lastUpdateMap.set(ticker, timestamp);
              }
            }
          });
        } catch (error) {
          console.warn('Failed to load freshness timestamps from Redis:', error);
        }
      }

      // Get tickers that need update based on priority
      const now = Date.now();
      const tickersNeedingUpdate = tickers.filter(ticker => {
        const lastUpdate = lastUpdateMap.get(ticker) || 0;
        const interval = premiumTickers.includes(ticker) ? PREMIUM_INTERVAL : REST_INTERVAL;
        return (now - lastUpdate) >= interval;
      });

      if (tickersNeedingUpdate.length === 0) {
        console.log('⏭️ No tickers need update yet (within refresh intervals)');
        // Still record success if we are just idling between intervals
        await recordSuccess('ingestLoop', 0);
        return;
      }

      // Prioritize: process premium tickers first, then rest
      const premiumNeedingUpdate = tickersNeedingUpdate.filter(t => premiumTickers.includes(t));
      const restNeedingUpdate = tickersNeedingUpdate.filter(t => !premiumTickers.includes(t));
      const prioritizedTickers = [...premiumNeedingUpdate, ...restNeedingUpdate];

      const intervalDesc = isPreMarket ? '60s' : isOffHours ? '2min' : '60s';
      console.log(`📊 Processing ${prioritizedTickers.length} tickers: ${premiumNeedingUpdate.length} premium (${intervalDesc}), ${restNeedingUpdate.length} rest (5min)`);

      // Rate-limit logic
      const envLimit = parseInt(process.env.POLYGON_MAX_REQUESTS_PER_MINUTE || '250', 10);
      const MAX_REQUESTS_PER_MINUTE = envLimit;
      const envBatchSize = parseInt(process.env.POLYGON_MAX_BATCH_SIZE || '100', 10);
      const batchSize = Math.min(100, Math.max(1, envBatchSize));
      
      const delayBetweenBatches = Math.ceil((60 * 1000) / (MAX_REQUESTS_PER_MINUTE / batchSize));

      // --- COLD START TURBO MODE ---
      // If we just entered 'pre' session, we force-update all tickers once as fast as possible
      let usedBatchSize = batchSize;
      let usedDelay = delayBetweenBatches;
      let processedTickers = prioritizedTickers;

      if (isPreMarket && (now - (parseInt(await redisClient.get('worker:last_bootstrap_ts') || '0', 10))) < 10 * 60 * 1000) {
        // If bootstrap ran within last 10 minutes and we are in pre-market,
        // it's likely a fresh start. We can trigger a full pass.
        // We'll use the full 'tickers' list but keep within rate limits.
        const lastTurboPass = await redisClient.get(`worker:last_turbo_pass:${getDateET(etNow)}`);
        if (!lastTurboPass) {
          console.log('🚀 TURBO MODE: Performing first-pass pre-market refresh...');
          processedTickers = tickers; // All tickers
          await redisClient.setEx(`worker:last_turbo_pass:${getDateET(etNow)}`, 3600, now.toString());
        }
      }

      for (let i = 0; i < processedTickers.length; i += usedBatchSize) {
        const batch = processedTickers.slice(i, i + usedBatchSize);
        const batchNum = Math.floor(i / usedBatchSize) + 1;
        const totalBatches = Math.ceil(processedTickers.length / usedBatchSize);
        console.log(`📥 Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);

        try {
          const results = await ingestBatch(batch, apiKey);
          const successSymbols = results.filter(r => r.success).map(r => r.symbol);
          totalIngestSuccess += successSymbols.length;

          // Update freshness metrics
          if (redisClient && redisClient.isOpen && successSymbols.length > 0) {
            const { updateFreshnessTimestampsBatch } = await import('@/lib/utils/freshnessMetrics');
            const freshnessUpdates = new Map<string, number>();
            successSymbols.forEach(ticker => freshnessUpdates.set(ticker, now));
            await updateFreshnessTimestampsBatch(freshnessUpdates).catch(err => {
              console.warn('Failed to update freshness metrics:', err);
            });
          }
        } catch (error) {
          console.error(`Error in batch ${i}:`, error);
        }

        // Delay between batches
        if (i + usedBatchSize < processedTickers.length) {
          await new Promise(resolve => setTimeout(resolve, usedDelay));
        }
      }

        const loopDuration = Date.now() - loopStartTime;
        console.log(`✅ ingestLoop completed: ${totalIngestSuccess} tickers updated in ${loopDuration}ms`);

        // Update health monitor status
        await recordSuccess('ingestLoop', totalIngestSuccess);

        if (totalIngestSuccess > 0) {
          await updateWorkerStatus();
        }
      } catch (error) {
        console.error('❌ Ingest loop failed:', error);
        await recordFailure('ingestLoop', error instanceof Error ? error.message : String(error));
      }
    };

    // Run every 60 seconds to check for updates (optimized from 30s)
    // During live trading: Premium tickers updated every 60s, rest every 5min
    // During pre-market/after-hours: All tickers updated every 5min (critical for premarketprice.com!)
    // Note: 60s check interval matches premium ticker update interval, reducing unnecessary checks
    setInterval(ingestLoop, 60000); // 60s check interval (optimized - matches premium update interval)
    ingestLoop(); // Run immediately
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Worker error:', error);
    process.exit(1);
  });
}

