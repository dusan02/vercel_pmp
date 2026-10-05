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

import { getUniverse, getPrevClose } from '@/lib/redis/operations';
import { redisClient } from '@/lib/redis';
import { recordSuccess } from '../healthMonitor';
import { isMarketHoliday, getLastTradingDay, getTradingDay } from '@/lib/utils/timeUtils';
import { getDateET, createETDate, toET, nsToMs } from '@/lib/utils/dateET';
import { withRetry } from '@/lib/api/rateLimiter';
import { polygonCircuitBreaker, __IS_TEST__, sleep, PolygonSnapshot } from './shared';
import { fetchPolygonSnapshot } from './core';
import { writePrevClose, writeRegularClose, writePrevCloseForToday } from '@/lib/heatmap/prevCloseService';
import { dbWriteRetry as sharedDbWriteRetry } from '@/lib/db/writeRetry';

export async function bootstrapPreviousCloses(
  tickers: string[],
  apiKey: string,
  date: string // YYYY-MM-DD
): Promise<void> {
  console.log(`🔄 Bootstrapping previous closes for ${tickers.length} tickers (Optimized: Snapshot API)...`);

  const isLikelySqlite = (process.env.DATABASE_URL || '').startsWith('file:');
  const dbWriteRetry = <T>(fn: () => Promise<T>, label: string) =>
    sharedDbWriteRetry(fn, label, isLikelySqlite ? 10 : 3);

  const calendarDateET = createETDate(date);
  const todayTradingDay = getTradingDay(calendarDateET);
  const prevTradingDay = getLastTradingDay(todayTradingDay);
  const expectedPrevYMD = getDateET(prevTradingDay);
  const isNonTradingCalendarDay = getDateET(todayTradingDay) !== date;

  // Skip tickers that already have prevClose in Redis for this date to avoid overwriting
  // correct values (set by saveRegularClose) with stale Polygon prevDay.c.
  const existingPrevCloseMap = await getPrevClose(date, tickers);
  const tickersToProcess = tickers.filter(t => !existingPrevCloseMap.has(t));
  if (tickersToProcess.length < tickers.length) {
    console.log(`⏭️ Skipping ${tickers.length - tickersToProcess.length} tickers with existing prevClose in Redis`);
  }
  if (tickersToProcess.length === 0) {
    console.log('✅ All tickers already have prevClose in Redis, skipping bootstrap');
    return;
  }

  // Self-heal from our own write-once regularClose before touching Polygon —
  // the authoritative prevClose for the previous session (same source
  // resolvePrevCloses uses). Polygon's snapshot.prevDay occasionally returns
  // an undated/wrong bar (Oct 5 incident: PSKY prevDay.c=$4.75 vs real $9.5),
  // so Polygon must only fill tickers we don't track ourselves.
  const selfHealed = new Set<string>();
  try {
    const { prisma } = await import('@/lib/db/prisma');
    const refRows = await prisma.dailyRef.findMany({
      where: {
        symbol: { in: tickersToProcess },
        date: prevTradingDay,
        regularClose: { not: null }
      },
      select: { symbol: true, regularClose: true }
    });
    for (const ref of refRows) {
      if (ref.regularClose && ref.regularClose > 0) {
        await writePrevCloseForToday(calendarDateET, ref.symbol, ref.regularClose, {
          dbRetry: (fn) => dbWriteRetry(fn, `writePrevCloseForToday:selfheal:${ref.symbol}`),
          skipTickerUpdate: true
        }).catch(() => {});
        selfHealed.add(ref.symbol);
      }
    }
  } catch (err) {
    console.warn('regularClose self-heal in bootstrap failed:', err);
  }
  const remaining = tickersToProcess.filter(t => !selfHealed.has(t));
  if (selfHealed.size > 0) {
    console.log(`✅ Self-healed ${selfHealed.size} prevCloses from ${expectedPrevYMD} regularClose`);
  }
  if (remaining.length === 0) {
    console.log('✅ Bootstrap complete (all from regularClose self-heal)');
    return;
  }

  // 1. Fetch snapshots in large batches
  console.log(`📥 Fetching snapshots for ${remaining.length} tickers...`);
  const snapshots = await fetchPolygonSnapshot(remaining, apiKey);
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
      // Post-close, Polygon rolls snapshot.prevDay forward to today's bar —
      // trusting prevDay.c then writes today's close as its own prevClose
      // (Sep 30 incident: DailyRef.previousClose=739.77 instead of D-1=737.93).
      // Reject only a verifiably NEWER bar (rolled-forward corruption); an
      // older bar is still the correct prev close (halted/suspended tickers).
      // An UNDATED bar (no prevDay.t) is unverifiable — Polygon emits those
      // with wrong closes (Oct 5 incident: PSKY prevDay.c=$4.75, no t, real
      // prev close $9.5; ADNH prevDay.c=$0.0003, no t). Reject → aggs
      // fallback returns the true dated bar or nothing (never a garbage ref).
      const prevDayTs = snapshot?.prevDay?.t;
      const prevDayYMD = prevDayTs ? getDateET(new Date(nsToMs(prevDayTs))) : null;
      if (snapshot?.prevDay?.c && snapshot.prevDay.c > 0 && prevDayYMD && prevDayYMD <= expectedPrevYMD) {
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
        // rawPrevDayClose already includes prevDay.c when its bar date was
        // acceptable; a rejected prevDay.c (rolled-forward bar) must NOT be
        // resurrected here — that's the corruption the guard exists for.
        prevClose = rawPrevDayClose;
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
  const chunkSize = Math.ceil(tickersToProcess.length / DB_CONCURRENCY);
  const chunks: string[][] = [];
  for (let i = 0; i < tickersToProcess.length; i += chunkSize) {
    chunks.push(tickersToProcess.slice(i, i + chunkSize));
  }

  // Process chunks sequentially to prevent SQLITE_BUSY crashes (3000 parallel writes is too much)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;
    console.log(`⏳ Processing bootstrap chunk ${i + 1}/${chunks.length} (${chunk.length} tickers)...`);
    await Promise.all(chunk.map(symbol => processTicker(symbol)));
    if (i < chunks.length - 1) {
      await sleep(100);
    }
  }

  console.log(`✅ Bootstrap complete: ${snapshotHits} from snapshot, ${fallbackHits} from fallback, ${failedCount} failed`);
  await recordSuccess('bootstrapPreviousCloses', snapshotHits + fallbackHits);
}