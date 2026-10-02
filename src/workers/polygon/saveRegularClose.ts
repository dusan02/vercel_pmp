/**
 * saveRegularClose - Saves today's regular session close as:
 * 1. regularClose in DailyRef for today's trading day
 * 2. previousClose in DailyRef + Redis for the NEXT trading day
 *
 * Called by: /api/cron/post-market-reset (daily after 16:00 ET)
 */

import { serverLog } from '@/lib/utils/serverLog';
import { getUniverse } from '@/lib/redis/operations';
import { redisClient } from '@/lib/redis';
import { recordSuccess, recordFailure } from '../healthMonitor';
import { isMarketHoliday, getTradingDay } from '@/lib/utils/timeUtils';
import { getDateET, createETDate, toET } from '@/lib/utils/dateET';
import { writePrevClose, writeRegularClose } from '@/lib/heatmap/prevCloseService';
import { prisma } from '@/lib/db/prisma';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export type SaveRegularCloseResult =
  | { status: 'saved'; saved: number; prevCloseUpdated: number; nextDayKeyCount: number; nextTradingDateStr: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

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

export async function saveRegularClose(apiKey: string, date: string, runId?: string): Promise<SaveRegularCloseResult> {
  const correlationId = runId || Date.now().toString(36);
  try {
    serverLog(`💾 [runId:${correlationId}] Starting regular close save...`);

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
      const reason = `trading day ${tradingDayStr} not closed yet (ET ${String(etHour).padStart(2, '0')}:${String(etMinute).padStart(2, '0')})`;
      serverLog(`⏸️  [runId:${correlationId}] Skipping regular close save — ${reason}`);
      return { status: 'skipped', reason };
    }

    const tickers = await getUniverse('sp500');
    if (tickers.length === 0) {
      console.warn('⚠️ No tickers in universe, skipping regular close save');
      return { status: 'skipped', reason: 'empty universe' };
    }

    // Per-ticker idempotency: only process tickers without regularClose.
    // Filter by date only — `symbol: { in: ~1k }` combined with `not: null`
    // hits Prisma's SQLite "negation filters prevent splitting" error once
    // the universe crosses the variable limit. ~1k rows/day is cheap; the
    // universe intersect happens in JS below.
    const existingRegularCloses = await prisma.dailyRef.findMany({
      where: {
        date: todayTradingDay,
        regularClose: { not: null }
      },
      select: { symbol: true }
    });
    const alreadySavedSymbols = new Set(existingRegularCloses.map(r => r.symbol));
    const tickersToSave = tickers.filter(t => !alreadySavedSymbols.has(t));

    if (tickersToSave.length === 0) {
      serverLog(`⏭️  [runId:${correlationId}] All ${tickers.length} tickers already saved for ${getDateET(todayTradingDay)}`);
      return { status: 'skipped', reason: `all ${tickers.length} tickers already saved` };
    }

    serverLog(`📊 [runId:${correlationId}] ${tickersToSave.length}/${tickers.length} tickers need regular close (already saved: ${alreadySavedSymbols.size})`);

    // Grouped daily aggs: ONE request returns the official close for every
    // US ticker for this specific trading day — simpler and more reliable
    // than ~9 batched snapshot calls, and unambiguous about which session
    // the close belongs to (snapshot.day.c is whatever session is current).
    const closeByTicker = await fetchGroupedCloses(tradingDayStr, apiKey);
    serverLog(`✅ [runId:${correlationId}] Grouped aggs returned ${closeByTicker.size} closes for ${tradingDayStr}`);
    if (closeByTicker.size === 0) {
      throw new Error(`Grouped aggs returned no data for ${tradingDayStr}`);
    }

    // Next trading day strictly AFTER today's trading day. NOTE: do NOT use
    // pricingStateMachine.getNextTradingDay here — it returns the next market
    // OPEN instant (09:30 ET), which for an ET-midnight input is that same
    // day's open. That wrote prevClose under TODAY's date (corrupting it with
    // today's close) and never created tomorrow's keys (Oct 2026 incident).
    let nextTradingDateObj: Date | null = null;
    for (let i = 0; i < 10; i++) {
      const candidate = new Date(todayTradingDay.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
      const w = toET(candidate).weekday;
      if (w !== 0 && w !== 6 && !isMarketHoliday(candidate)) {
        nextTradingDateObj = createETDate(getDateET(candidate));
        break;
      }
    }
    if (!nextTradingDateObj) {
      throw new Error('Could not find next trading day within 10 calendar days');
    }
    const nextTradingDateStr = getDateET(nextTradingDateObj);

    // Validate nextTradingDay is a real trading day
    const nextTradingDayET = toET(nextTradingDateObj);
    const isNextTradingDayValid = nextTradingDayET.weekday !== 0 &&
      nextTradingDayET.weekday !== 6 &&
      !isMarketHoliday(nextTradingDateObj);

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
            const wr = await writePrevClose(nextTradingDateStr, nextTradingDateObj, symbol, regularClose, { skipTickerUpdate: true });
            // Count only durable writes — writePrevClose swallows per-store
            // failures, so a thrown-free call can still produce nothing.
            if (wr.redis || wr.dailyRef) {
              prevCloseUpdated++;
            } else {
              console.warn(`⚠️ prevClose write produced no durable result for ${symbol} (nextTradingDay: ${nextTradingDateStr})`);
            }
          } catch (prevCloseError) {
            console.warn(`⚠️ Failed to update previousClose for ${symbol} (nextTradingDay: ${nextTradingDateStr}):`, prevCloseError);
          }
        }
      } catch (error) {
        console.error(`Error saving regular close for ${symbol}:`, error);
      }
    }

    // Post-write invariant: next-day prevClose keys must actually exist in
    // Redis. A silent miss leaves tomorrow's session resolving against stale
    // fallbacks (whole-universe 2-day % moves — Oct 2026 incident).
    let nextDayKeyCount = 0;
    try {
      if (redisClient?.isOpen) {
        nextDayKeyCount = (await redisClient.keys(`prevclose:${nextTradingDateStr}:*`)).length;
      }
    } catch {
      // non-fatal: coverage metric only
    }

    serverLog(`✅ [runId:${correlationId}] Saved regular close for ${saved}/${tickersToSave.length} tickers`);
    serverLog(`✅ [runId:${correlationId}] Updated previousClose for ${prevCloseUpdated} tickers (nextTradingDay: ${nextTradingDateStr}, todayTradingDay: ${getDateET(todayTradingDay)})`);

    const expectedKeys = Math.floor(tickersToSave.length * 0.95);
    if (tickersToSave.length > 0 && nextDayKeyCount < expectedKeys) {
      const msg = `prevclose:${nextTradingDateStr} coverage ${nextDayKeyCount}/${tickersToSave.length} after save (expected ≥${expectedKeys})`;
      console.error(`❌ [runId:${correlationId}] INVARIANT FAILED: ${msg}`);
      await recordFailure('saveRegularClose', msg);
      return { status: 'failed', error: msg };
    }

    await recordSuccess('saveRegularClose', saved);
    return { status: 'saved', saved, prevCloseUpdated, nextDayKeyCount, nextTradingDateStr };
  } catch (error) {
    console.error(`❌ [runId:${correlationId}] Error in saveRegularClose:`, error);
    const msg = error instanceof Error ? error.message : String(error);
    await recordFailure('saveRegularClose', msg);
    return { status: 'failed', error: msg };
  }
}