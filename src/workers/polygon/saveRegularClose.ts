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
import { recordSuccess, recordFailure } from '../healthMonitor';
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
import { polygonCircuitBreaker, __IS_TEST__, sleep, PolygonSnapshot } from './shared';
import { fetchPolygonSnapshot, normalizeSnapshot, upsertToDB } from './core';
import { writePrevClose, writeRegularClose } from '@/lib/heatmap/prevCloseService';
export async function saveRegularClose(apiKey: string, date: string, runId?: string): Promise<void> {
  const correlationId = runId || Date.now().toString(36);
  try {
    console.log(`💾 [runId:${correlationId}] Starting regular close save...`);

    // IDEMPOTENCY: Check which tickers already have regularClose for today
    const calendarDateETStr = getDateET();
    const calendarDateET = createETDate(calendarDateETStr);
    const todayTradingDay = getTradingDay(calendarDateET);

    const tickers = await getUniverse('sp500');

    if (tickers.length === 0) {
      console.warn('⚠️ No tickers in universe, skipping regular close save');
      return;
    }

    // Find tickers that already have regularClose set for today
    const existingRegularCloses = await prisma.dailyRef.findMany({
      where: {
        date: todayTradingDay,
        symbol: { in: tickers },
        regularClose: { not: null }
      },
      select: { symbol: true }
    });
    const alreadySavedSymbols = new Set(existingRegularCloses.map(r => r.symbol));
    const tickersToSave = tickers.filter(t => !alreadySavedSymbols.has(t));

    if (tickersToSave.length === 0) {
      console.log(`⏭️  [runId:${correlationId}] Skipping saveRegularClose - all ${tickers.length} tickers already saved for ${getDateET(todayTradingDay)}`);
      return;
    }

    console.log(`📊 [runId:${correlationId}] ${tickersToSave.length}/${tickers.length} tickers need regular close (already saved: ${alreadySavedSymbols.size})`);

    console.log(`📊 [runId:${correlationId}] Fetching regular close for ${tickersToSave.length} tickers...`);
    const snapshots = await fetchPolygonSnapshot(tickersToSave, apiKey);
    console.log(`✅ [runId:${correlationId}] Received ${snapshots.length} snapshots`);

    // DST-safe date creation (reuse variables from idempotency check above)
    // calendarDateETStr, calendarDateET, todayTradingDay already defined above

    // CRITICAL: Use nextTradingDay, not calendar tomorrow!
    // This handles weekends/holidays correctly (Friday -> Monday, not Friday -> Saturday)
    const { getNextTradingDay } = await import('@/lib/utils/pricingStateMachine');
    const nextTradingDay = getNextTradingDay(todayTradingDay);
    const nextTradingDateStr = getDateET(nextTradingDay);
    const nextTradingDateObj = createETDate(nextTradingDateStr);

    let saved = 0;
    let prevCloseUpdated = 0;
    for (const snapshot of snapshots) {
      try {
        const symbol = snapshot.ticker;
        // Skip tickers that already have regularClose (idempotency)
        if (alreadySavedSymbols.has(symbol)) continue;
        // Get regular close from snapshot (day.c is the regular session close)
        // Polygon snapshot day.c is already adjusted (split-adjusted)
        const regularClose = snapshot.day?.c;

        // INVARIANT: Only save valid prices
        if (regularClose && regularClose > 0) {
          // 1. Write regularClose for today's trading day
          await writeRegularClose(todayTradingDay, symbol, regularClose);
          saved++;

          // 2. Write prevClose for nextTradingDay (Model A: prevClose(next) = close(today))
          // skipTickerUpdate: true — after-hours needs latestPrevClose to remain as D-1
          try {
            const nextTradingDayET = toET(nextTradingDay);
            const isNextTradingDayValid = nextTradingDayET.weekday !== 0 &&
              nextTradingDayET.weekday !== 6 &&
              !isMarketHoliday(nextTradingDay);

            if (!isNextTradingDayValid) {
              console.error(`❌ INVARIANT VIOLATION: nextTradingDay ${nextTradingDateStr} is not a valid trading day!`);
              throw new Error(`nextTradingDay ${nextTradingDateStr} is not a valid trading day`);
            }

            await writePrevClose(nextTradingDateStr, nextTradingDateObj, symbol, regularClose, { skipTickerUpdate: true });
            prevCloseUpdated++;
          } catch (prevCloseError) {
            console.warn(`⚠️ Failed to update previousClose for ${symbol} (nextTradingDay: ${nextTradingDateStr}):`, prevCloseError);
          }
        }
      } catch (error) {
        console.error(`Error saving regular close for ${snapshot.ticker}:`, error);
      }
    }

    console.log(`✅ [runId:${correlationId}] Saved regular close for ${saved}/${snapshots.length} tickers`);
    console.log(`✅ [runId:${correlationId}] Updated previousClose for ${prevCloseUpdated} tickers (nextTradingDay: ${nextTradingDateStr}, todayTradingDay: ${getDateET(todayTradingDay)})`);
    // Health monitoring: record success
    await recordSuccess('saveRegularClose', saved);
  } catch (error) {
    console.error(`❌ [runId:${correlationId}] Error in saveRegularClose:`, error);
    // Health monitoring: record failure
    await recordFailure('saveRegularClose', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Main ingest function
 * Exported for manual execution
 * @param force - If true, bypass pricing state machine (for manual/force ingest)
 */