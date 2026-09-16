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
import { writePrevClose, writeRegularClose } from '@/lib/heatmap/prevCloseService';
import { prisma } from '@/lib/db/prisma';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Official close for every US ticker on a given trading day via Polygon
 * grouped daily aggs (one request covers the whole market).
 */
async function fetchGroupedCloses(dateStr: string, apiKey: string): Promise<Map<string, number>> {
  const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${apiKey}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`⚠️ grouped aggs ${dateStr}: HTTP ${res.status} (attempt ${attempt}/3)`);
      } else {
        const data = await res.json();
        const map = new Map<string, number>();
        for (const r of data?.results ?? []) {
          if (r?.T && typeof r.c === 'number' && r.c > 0) map.set(r.T, r.c);
        }
        if (map.size > 0) return map;
      }
    } catch (err) {
      console.warn(`⚠️ grouped aggs ${dateStr} failed (attempt ${attempt}/3):`, err);
    }
    if (attempt < 3) await sleep(2000 * attempt);
  }
  return new Map();
}

export async function saveRegularClose(apiKey: string, date: string, runId?: string): Promise<void> {
  const correlationId = runId || Date.now().toString(36);
  try {
    console.log(`💾 [runId:${correlationId}] Starting regular close save...`);

    const calendarDateETStr = getDateET();
    const calendarDateET = createETDate(calendarDateETStr);
    const todayTradingDay = getTradingDay(calendarDateET);

    // Guard: refuse to run while the target trading day is still in progress.
    // snapshot.day.c during 'pre'/'live' is either the previous session's
    // close or a partial-day value — persisting it would corrupt both
    // regularClose(today) and prevClose(next trading day). Safe only when:
    //   - the trading day is a PAST calendar day (weekend/holiday backfill), or
    //   - it is the trading day itself and ET >= 16:15 (Polygon Starter's
    //     ~15min delay has settled so day.c is the final close).
    // This makes stray invocations (early cron, manual GET, `pm2 start`
    // immediate run) a safe no-op.
    const tradingDayStr = getDateET(todayTradingDay);
    const { hour: etHour, minute: etMinute } = toET(new Date());
    const minutesET = etHour * 60 + etMinute;
    const isLaterCalendarDay = calendarDateETStr > tradingDayStr;
    const isPostClose = calendarDateETStr === tradingDayStr && minutesET >= 16 * 60 + 15;
    if (!isLaterCalendarDay && !isPostClose) {
      console.log(`⏸️  [runId:${correlationId}] Skipping regular close save — trading day ${tradingDayStr} not closed yet (ET ${String(etHour).padStart(2, '0')}:${String(etMinute).padStart(2, '0')})`);
      return;
    }

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

    // Grouped daily aggs: ONE request returns the official close for every
    // US ticker for this specific trading day — simpler and more reliable
    // than ~9 batched snapshot calls, and unambiguous about which session
    // the close belongs to (snapshot.day.c is whatever session is current).
    const closeByTicker = await fetchGroupedCloses(tradingDayStr, apiKey);
    console.log(`✅ [runId:${correlationId}] Grouped aggs returned ${closeByTicker.size} closes for ${tradingDayStr}`);
    if (closeByTicker.size === 0) {
      throw new Error(`Grouped aggs returned no data for ${tradingDayStr}`);
    }

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
    for (const symbol of tickersToSave) {
      try {
        const regularClose = closeByTicker.get(symbol);
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
        console.error(`Error saving regular close for ${symbol}:`, error);
      }
    }

    console.log(`✅ [runId:${correlationId}] Saved regular close for ${saved}/${tickersToSave.length} tickers`);
    console.log(`✅ [runId:${correlationId}] Updated previousClose for ${prevCloseUpdated} tickers (nextTradingDay: ${nextTradingDateStr}, todayTradingDay: ${getDateET(todayTradingDay)})`);
    await recordSuccess('saveRegularClose', saved);
  } catch (error) {
    console.error(`❌ [runId:${correlationId}] Error in saveRegularClose:`, error);
    await recordFailure('saveRegularClose', error instanceof Error ? error.message : String(error));
  }
}