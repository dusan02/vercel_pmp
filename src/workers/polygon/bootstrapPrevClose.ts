/**
 * bootstrapPreviousCloses - Fills gaps in previousClose data for tickers
 * that don't yet have a prevClose for the current trading day.
 *
 * Strategy:
 * 1. Fetch Polygon snapshots (batch) to get prevDay.c and day.c
 * 2. For non-trading calendar days (weekends/holidays), backfill regularClose
 * 3. Write prevClose for today's calendar date (so heatmap can find it)
 *
 * Called by: polygonWorker startup, refsScheduler
 */

import { getUniverse } from '@/lib/redis/operations';
import { recordSuccess } from '../healthMonitor';
import { isMarketHoliday, getLastTradingDay, getTradingDay } from '@/lib/utils/timeUtils';
import { getDateET, createETDate, toET } from '@/lib/utils/dateET';
import { withRetry } from '@/lib/api/rateLimiter';
import { polygonCircuitBreaker, __IS_TEST__, sleep, PolygonSnapshot } from './shared';
import { fetchPolygonSnapshot } from './core';
import { writePrevClose, writeRegularClose, writePrevCloseForToday } from '@/lib/heatmap/prevCloseService';

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

  const DB_CONCURRENCY = 5;
  const processTicker = async (symbol: string) => {
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

      // Fallback: fetch from aggregates API if snapshot didn't have prevDay.c
      if (rawPrevDayClose <= 0) {
        try {
          const rangeUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${expectedPrevYMD}/${expectedPrevYMD}?adjusted=true&apiKey=${apiKey}`;
          const rangeResp = await withRetry(async () => fetch(rangeUrl));
          if (rangeResp && rangeResp.ok) {
            const rangeData = await rangeResp.json();
            const c = rangeData?.results?.[0]?.c;
            if (typeof c === 'number' && c > 0) {
              rawPrevDayClose = c;
              fallbackHits++;
            }
          }
        } catch { /* non-fatal */ }
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
        // Non-trading day backfill: write regularClose for last trading day
        if (isNonTradingCalendarDay && rawDayClose > 0) {
          const prevForBackfill = backfillPrevClose > 0 ? backfillPrevClose : prevClose;
          await writeRegularClose(todayTradingDay, symbol, rawDayClose, { dbRetry: (fn) => dbWriteRetry(fn, `writeRegularClose:${symbol}`) });
          await writePrevClose(date, todayTradingDay, symbol, prevForBackfill, { dbRetry: (fn) => dbWriteRetry(fn, `writePrevClose:backfill:${symbol}`), skipTickerUpdate: true });
        }

        // Write prevClose for today's calendar date (so heatmap can find it)
        await writePrevCloseForToday(calendarDateET, symbol, prevClose, { dbRetry: (fn) => dbWriteRetry(fn, `writePrevCloseForToday:${symbol}`), skipTickerUpdate: true });
      } else {
        failedCount++;
      }
    } catch (error) {
      console.error(`Error bootstrapping ${symbol}:`, error);
      failedCount++;
    }
  };

  // Split into chunks for parallel processing
  const chunkSize = Math.ceil(tickers.length / DB_CONCURRENCY);
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += chunkSize) {
    chunks.push(tickers.slice(i, i + chunkSize));
  }

  await Promise.all(chunks.map(chunk =>
    Promise.all(chunk.map(symbol => processTicker(symbol)))
  ));

  console.log(`✅ Bootstrap complete: ${snapshotHits} from snapshot, ${fallbackHits} from fallback, ${failedCount} failed`);
  await recordSuccess('bootstrapPreviousCloses', snapshotHits + fallbackHits);
}