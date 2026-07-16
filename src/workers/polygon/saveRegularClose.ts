/**
 * saveRegularClose - Saves today's regular session close as:
 * 1. regularClose in DailyRef for today's trading day
 * 2. previousClose in DailyRef + Redis for the NEXT trading day
 *
 * Called by: /api/cron/post-market-reset (daily after 16:00 ET)
 */

import { getUniverse } from '@/lib/redis/operations';
import { recordSuccess, recordFailure } from '../healthMonitor';
import { isMarketHoliday, getTradingDay } from '@/lib/utils/timeUtils';
import { getDateET, createETDate, toET } from '@/lib/utils/dateET';
import { polygonCircuitBreaker, __IS_TEST__, sleep, PolygonSnapshot } from './shared';
import { fetchPolygonSnapshot } from './core';
import { writePrevClose, writeRegularClose } from '@/lib/heatmap/prevCloseService';
import { prisma } from '@/lib/db/prisma';

const SNAPSHOT_BATCH_SIZE = 80;

export async function saveRegularClose(apiKey: string, date: string, runId?: string): Promise<void> {
  const correlationId = runId || Date.now().toString(36);
  try {
    console.log(`💾 [runId:${correlationId}] Starting regular close save...`);

    const calendarDateETStr = getDateET();
    const calendarDateET = createETDate(calendarDateETStr);
    const todayTradingDay = getTradingDay(calendarDateET);

    const tickers = await getUniverse('sp500');
    if (tickers.length === 0) {
      console.warn('⚠️ No tickers in universe, skipping regular close save');
      return;
    }

    // Per-ticker idempotency: only process tickers without regularClose
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
      console.log(`⏭️  [runId:${correlationId}] All ${tickers.length} tickers already saved for ${getDateET(todayTradingDay)}`);
      return;
    }

    console.log(`📊 [runId:${correlationId}] ${tickersToSave.length}/${tickers.length} tickers need regular close (already saved: ${alreadySavedSymbols.size})`);

    // Fetch snapshots in batches to avoid API limits
    const allSnapshots: PolygonSnapshot[] = [];
    for (let i = 0; i < tickersToSave.length; i += SNAPSHOT_BATCH_SIZE) {
      const batch = tickersToSave.slice(i, i + SNAPSHOT_BATCH_SIZE);
      const snapshots = await fetchPolygonSnapshot(batch, apiKey);
      allSnapshots.push(...snapshots);
      if (i + SNAPSHOT_BATCH_SIZE < tickersToSave.length) {
        await sleep(200);
      }
    }
    console.log(`✅ [runId:${correlationId}] Received ${allSnapshots.length} snapshots`);

    const { getNextTradingDay } = await import('@/lib/utils/pricingStateMachine');
    const nextTradingDay = getNextTradingDay(todayTradingDay);
    const nextTradingDateStr = getDateET(nextTradingDay);
    const nextTradingDateObj = createETDate(nextTradingDateStr);

    // Validate nextTradingDay is a real trading day
    const nextTradingDayET = toET(nextTradingDay);
    const isNextTradingDayValid = nextTradingDayET.weekday !== 0 &&
      nextTradingDayET.weekday !== 6 &&
      !isMarketHoliday(nextTradingDay);

    if (!isNextTradingDayValid) {
      console.error(`❌ INVARIANT VIOLATION: nextTradingDay ${nextTradingDateStr} is not a valid trading day!`);
      throw new Error(`nextTradingDay ${nextTradingDateStr} is not a valid trading day`);
    }

    let saved = 0;
    let prevCloseUpdated = 0;
    for (const snapshot of allSnapshots) {
      try {
        const symbol = snapshot.ticker;
        if (alreadySavedSymbols.has(symbol)) continue;

        const regularClose = snapshot.day?.c;
        if (regularClose && regularClose > 0) {
          // 1. Write regularClose for today's trading day
          await writeRegularClose(todayTradingDay, symbol, regularClose);
          saved++;

          // 2. Write prevClose for nextTradingDay (prevClose(next) = close(today))
          try {
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

    console.log(`✅ [runId:${correlationId}] Saved regular close for ${saved}/${allSnapshots.length} tickers`);
    console.log(`✅ [runId:${correlationId}] Updated previousClose for ${prevCloseUpdated} tickers (nextTradingDay: ${nextTradingDateStr}, todayTradingDay: ${getDateET(todayTradingDay)})`);
    await recordSuccess('saveRegularClose', saved);
  } catch (error) {
    console.error(`❌ [runId:${correlationId}] Error in saveRegularClose:`, error);
    await recordFailure('saveRegularClose', error instanceof Error ? error.message : String(error));
  }
}