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
export async function saveRegularClose(apiKey: string, date: string, runId?: string): Promise<void> {
  const correlationId = runId || Date.now().toString(36);
  try {
    console.log(`💾 [runId:${correlationId}] Starting regular close save...`);

    // IDEMPOTENCY: Check if already saved for today (avoid unnecessary Polygon API calls)
    const calendarDateETStr = getDateET();
    const calendarDateET = createETDate(calendarDateETStr);
    const todayTradingDay = getTradingDay(calendarDateET);

    const existingRegularClose = await prisma.dailyRef.findFirst({
      where: {
        date: todayTradingDay,
        regularClose: { not: null }
      },
      select: { symbol: true }
    });

    if (existingRegularClose) {
      console.log(`⏭️  [runId:${correlationId}] Skipping saveRegularClose - already saved for ${getDateET(todayTradingDay)} (idempotent check, saved for ${existingRegularClose.symbol})`);
      return;
    }

    const tickers = await getUniverse('sp500');

    if (tickers.length === 0) {
      console.warn('⚠️ No tickers in universe, skipping regular close save');
      return;
    }

    console.log(`📊 [runId:${correlationId}] Fetching regular close for ${tickers.length} tickers...`);
    const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
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
        // Get regular close from snapshot (day.c is the regular session close)
        // Polygon snapshot day.c is already adjusted (split-adjusted)
        const regularClose = snapshot.day?.c;

        // INVARIANT: Only save valid prices
        if (regularClose && regularClose > 0) {
          // Update DailyRef with regular close (for today's trading day)
          await prisma.dailyRef.upsert({
            where: {
              symbol_date: {
                symbol,
                date: todayTradingDay
              }
            },
            update: {
              regularClose
            },
            create: {
              symbol,
              date: todayTradingDay,
              previousClose: regularClose, // Fallback if previousClose not set
              regularClose
            }
          });
          saved++;

          // CRITICAL: Update previousClose for nextTradingDay (Model A)
          // Model A: prevCloseKey(nextTradingDay) = close(todayTradingDay)
          // This ensures pre-market next trading day uses today's regularClose as reference
          try {
            // INVARIANT: nextTradingDay must be a trading day (not weekend/holiday)
            const nextTradingDayET = toET(nextTradingDay);
            const isNextTradingDayValid = nextTradingDayET.weekday !== 0 &&
              nextTradingDayET.weekday !== 6 &&
              !isMarketHoliday(nextTradingDay);

            if (!isNextTradingDayValid) {
              console.error(`❌ INVARIANT VIOLATION: nextTradingDay ${nextTradingDateStr} is not a valid trading day!`);
              throw new Error(`nextTradingDay ${nextTradingDateStr} is not a valid trading day`);
            }

            // Update DailyRef for nextTradingDay - nextTradingDay's previousClose = today's regularClose
            await prisma.dailyRef.upsert({
              where: {
                symbol_date: {
                  symbol,
                  date: nextTradingDateObj
                }
              },
              update: {
                previousClose: regularClose,
                updatedAt: new Date()
              },
              create: {
                symbol,
                date: nextTradingDateObj,
                previousClose: regularClose
              }
            });

            // CRITICAL: Redis cache uses Model A: prevCloseKey(date) = close(date-1)
            // For nextTradingDay, prevClose(nextTradingDay) = close(todayTradingDay) = today's regularClose
            await setPrevClose(nextTradingDateStr, symbol, regularClose);

            // Update Ticker.latestPrevClose and latestPrevCloseDate
            // This is the denormalized field used by heatmap API
            // The date should be todayTradingDay (when the close happened)
            await prisma.ticker.update({
              where: { symbol },
              data: {
                latestPrevClose: regularClose,
                latestPrevCloseDate: todayTradingDay, // Today's trading day (when close happened)
                updatedAt: new Date()
              }
            });

            prevCloseUpdated++;
          } catch (prevCloseError) {
            // Non-fatal: log but continue
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