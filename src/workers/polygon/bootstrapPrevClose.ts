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
import { saveRegularClose } from './saveRegularClose';
import { ingestBatch } from './ingestBatch';
export async function bootstrapPreviousCloses(
  tickers: string[],
  apiKey: string,
  date: string // YYYY-MM-DD
): Promise<void> {
  console.log(`🔄 Bootstrapping previous closes for ${tickers.length} tickers (Optimized: Snapshot API)...`);

  const isLikelySqlite = (process.env.DATABASE_URL || '').startsWith('file:');
  const dbWriteRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T | null> => {
    const maxAttempts = isLikelySqlite ? 10 : 3;
    let delayMs = 100;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as any)?.code as string | undefined;
        const isDbBusy =
          code === 'P1008' ||
          msg.includes('SQLITE_BUSY') ||
          msg.includes('database is locked') ||
          msg.includes('failed to respond to a query within the configured timeout');

        if (!isDbBusy || attempt === maxAttempts) {
          console.warn(`⚠️ DB write failed (${label}) after ${attempt}/${maxAttempts}:`, err);
          return null;
        }

        await sleep(delayMs);
        delayMs = Math.min(2000, Math.floor(delayMs * 2));
      }
    }
    return null;
  };

  const calendarDateET = createETDate(date);
  const todayTradingDay = getTradingDay(calendarDateET);
  const prevTradingDay = getLastTradingDay(todayTradingDay);
  const expectedPrevYMD = getDateET(prevTradingDay);
  const isNonTradingCalendarDay = getDateET(todayTradingDay) !== date;

  // 1. Fetch snapshots in large batches
  console.log('📥 Fetching snapshots for batch previous day reference...');
  const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
  const snapshotMap = new Map<string, PolygonSnapshot>();
  snapshots.forEach(s => snapshotMap.set(s.ticker, s));
  console.log(`✅ Received ${snapshots.length} snapshots`);

  let snapshotHits = 0;
  let fallbackHits = 0;
  let failedCount = 0;

  // OPTIMIZATION: Process in chunks with controlled concurrency for DB writes
  const DB_CONCURRENCY = 5;
  const processChunk = async (symbolBatch: string[]) => {
    for (const symbol of symbolBatch) {
      try {
        let prevClose = 0;
        let backfillPrevClose = 0;
        let actualPrevTradingDay: Date | null = null;
        let rawDayClose = 0;

        const snapshot = snapshotMap.get(symbol);
        let rawPrevDayClose = 0;
        if (snapshot?.prevDay?.c && snapshot.prevDay.c > 0) {
          rawPrevDayClose = snapshot.prevDay.c;
        }
        if (snapshot?.day?.c && snapshot.day.c > 0) {
          rawDayClose = snapshot.day.c;
        }

        if (rawPrevDayClose <= 0) {
          try {
            const rangeUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${expectedPrevYMD}/${expectedPrevYMD}?adjusted=true&apiKey=${apiKey}`;
            const rangeResp = await withRetry(async () => fetch(rangeUrl));
            if (rangeResp && rangeResp.ok) {
              const rangeData = await rangeResp.json();
              const result = rangeData?.results?.[0];
              const c = result?.c;
              if (typeof c === 'number' && c > 0) {
                rawPrevDayClose = c;
                fallbackHits++;
              }
            }
          } catch (rangeError) {}
        } else {
          snapshotHits++;
        }

        if (isNonTradingCalendarDay) {
          if (rawDayClose > 0) {
            prevClose = rawDayClose;
            actualPrevTradingDay = todayTradingDay;
          } else {
            prevClose = rawPrevDayClose;
            actualPrevTradingDay = prevTradingDay;
          }
          backfillPrevClose = rawPrevDayClose;
        } else {
          prevClose = rawPrevDayClose > 0 ? rawPrevDayClose : (snapshot?.prevDay?.c || 0);
          actualPrevTradingDay = prevTradingDay;
        }

        if (prevClose > 0 && actualPrevTradingDay) {
          try {
            await setPrevClose(date, symbol, prevClose);
          } catch (redisErr) {
            console.warn(`⚠️ Redis setPrevClose failed for ${symbol}`);
          }

          if (isNonTradingCalendarDay && rawDayClose > 0) {
            const lastTradingDay = todayTradingDay;
            const prevForBackfill = backfillPrevClose > 0 ? backfillPrevClose : prevClose;

            await dbWriteRetry(
              () => prisma.dailyRef.upsert({
                where: { symbol_date: { symbol, date: lastTradingDay } },
                update: { regularClose: rawDayClose, previousClose: prevForBackfill, updatedAt: new Date() },
                create: { symbol, date: lastTradingDay, regularClose: rawDayClose, previousClose: prevForBackfill }
              }),
              `dailyRef.upsert(lastTradingDayClose):${symbol}`
            );
          }

          const shouldUpsertSourceRecord = !isNonTradingCalendarDay || (isNonTradingCalendarDay && prevClose === rawPrevDayClose);

          if (shouldUpsertSourceRecord) {
            await dbWriteRetry(
              () => prisma.dailyRef.upsert({
                where: { symbol_date: { symbol, date: actualPrevTradingDay! } },
                update: { previousClose: prevClose, regularClose: prevClose, updatedAt: new Date() },
                create: { symbol, date: actualPrevTradingDay!, previousClose: prevClose, regularClose: prevClose }
              }),
              `dailyRef.upsert:${symbol}`
            );
          }

          // Ensure Ticker exists before writing DailyRef (FK constraint: DailyRef -> Ticker)
          await dbWriteRetry(
            () => prisma.ticker.upsert({
              where: { symbol },
              update: { latestPrevClose: prevClose, latestPrevCloseDate: actualPrevTradingDay },
              create: {
                symbol,
                latestPrevClose: prevClose,
                latestPrevCloseDate: actualPrevTradingDay,
                lastPrice: 0,
                lastChangePct: 0,
                lastMarketCap: 0,
                lastMarketCapDiff: 0,
                lastVolume: 0,
                sector: 'Unknown',
                industry: 'Unknown',
              }
            }),
            `ticker.upsert(prevClose):${symbol}`
          );

          await dbWriteRetry(
            () => prisma.dailyRef.upsert({
              where: { symbol_date: { symbol, date: calendarDateET } },
              update: { previousClose: prevClose, updatedAt: new Date() },
              create: { symbol, date: calendarDateET, previousClose: prevClose }
            }),
            `dailyRef.upsert(todayPrevClose):${symbol}`
          );
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`Error bootstrapping ${symbol}:`, error);
        failedCount++;
      }
    }
  };

  // Split into chunks for parallel processing
  const chunks: string[][] = [];
  const chunkSize = Math.ceil(tickers.length / DB_CONCURRENCY);
  for (let i = 0; i < tickers.length; i += chunkSize) {
    chunks.push(tickers.slice(i, i + chunkSize));
  }

  await Promise.all(chunks.map(chunk => processChunk(chunk)));

  console.log(`✅ Bootstrap complete: ${snapshotHits} from snapshot, ${fallbackHits} from fallback, ${failedCount} failed`);
  // Health monitoring: record bootstrap result
  await recordSuccess('bootstrapPreviousCloses', snapshotHits + fallbackHits);
}

/**
 * Main worker entry point (PM2)
 */