/**
 * Unified previousClose resolution for the heatmap API.
 *
 * Consolidates the three previously-duplicated code paths (stockCache, priceCache, DB)
 * into a single function with clear priority rules.
 */

import { DailyRef } from '@prisma/client';
import { getDateET } from '@/lib/utils/dateET';

export type PrevCloseSources = {
  /** From DailyRef — highest priority, always fresh from today's worker run */
  refFromDaily: number;
  /** From Ticker.latestPrevClose — only valid if date is recent enough */
  prevFromTicker: number;
  /** From cached StockData.closePrice (worker /api/stocks cache) */
  cachedClose: number;
  /** From on-demand batch fetch (Polygon API fallback) */
  batchClose: number;
};

export type PrevCloseContext = {
  /** True on weekends/holidays — changes priority to prefer DailyRef over Ticker */
  isNonTradingClosedDay: boolean;
};

/**
 * Resolve previousClose using a single priority chain.
 *
 * Normal trading day:
 *   1. cachedClose (worker cache, most accurate — it's the actual regular close)
 *   2. refFromDaily (DailyRef.previousClose for today = yesterday's close)
 *   3. prevFromTicker (Ticker.latestPrevClose — denormalized, may be stale)
 *   4. batchClose (on-demand Polygon API fetch)
 *
 * Non-trading closed day (weekend/holiday):
 *   1. refFromDaily (DailyRef regularClose from last trading day = Friday's close)
 *   2. cachedClose (worker cache)
 *   3. prevFromTicker (Ticker.latestPrevClose — last trading day's prevClose)
 *   4. batchClose
 */
export function resolvePrevClose(
  sources: PrevCloseSources,
  ctx: PrevCloseContext
): number {
  const { refFromDaily, prevFromTicker, cachedClose, batchClose } = sources;
  const { isNonTradingClosedDay } = ctx;

  if (isNonTradingClosedDay) {
    // On weekends/holidays: prefer DailyRef (Friday's regularClose), then cache, then Ticker, then batch.
    if (refFromDaily > 0) return refFromDaily;
    if (cachedClose > 0) return cachedClose;
    if (prevFromTicker > 0) return prevFromTicker;
    if (batchClose > 0) return batchClose;
    return 0;
  }

  // Normal trading day:
  // cachedClose is the worker's closePrice — most accurate (actual regular close from Polygon).
  // refFromDaily is today's DailyRef.previousClose = yesterday's close.
  // Both are valid; prefer cachedClose (worker) then refFromDaily (DB).
  if (cachedClose > 0) return cachedClose;
  if (refFromDaily > 0) return refFromDaily;
  if (prevFromTicker > 0) return prevFromTicker;
  if (batchClose > 0) return batchClose;
  return 0;
}

/**
 * Context for building previousClose/regularClose maps from DailyRef records.
 */
export type DailyRefMapContext = {
  todayDateStr: string;
  isNonTradingClosedDay: boolean;
  session: string;
  regularCloseReferenceDayStr: string | null;
};

export type DailyRefMapResult = {
  previousCloseMap: Map<string, number>;
  regularCloseMap: Map<string, number>;
  debugStats: {
    totalDailyRefs: number;
    counts: {
      dailyRefToday: number;
      dailyRefOlder: number;
    };
  };
};

/**
 * Build previousClose and regularClose maps from a list of DailyRef records.
 *
 * Priority for previousCloseMap:
 *   1. Today's DailyRef.previousClose (= yesterday's regular close, written by worker)
 *   2. Most recent older regularClose (e.g. Friday's close on Monday)
 *   3. Older previousClose (on non-trading closed days only)
 *
 * regularCloseMap is set from the reference day's regularClose (today or
 * regularCloseReferenceDayStr for weekends/holidays).
 *
 * DailyRef records MUST be ordered by date DESC for correct fallback behavior.
 */
export function buildPrevCloseFromDailyRefs(
  dailyRefs: DailyRef[],
  ctx: DailyRefMapContext
): DailyRefMapResult {
  const previousCloseMap = new Map<string, number>();
  const regularCloseMap = new Map<string, number>();

  const debugStats = {
    totalDailyRefs: dailyRefs.length,
    counts: { dailyRefToday: 0, dailyRefOlder: 0 },
  };

  // Pass 1: Set regularCloseMap + today's previousClose (highest priority)
  for (const dr of dailyRefs) {
    const drDateStr = getDateET(new Date(dr.date));
    const isToday = drDateStr === ctx.todayDateStr;

    if (dr.regularClose && dr.regularClose > 0) {
      const isRefDay = ctx.regularCloseReferenceDayStr
        ? drDateStr === ctx.regularCloseReferenceDayStr
        : isToday;
      if (isRefDay) {
        regularCloseMap.set(dr.symbol, dr.regularClose);
      }
    }

    if (isToday && dr.previousClose && dr.previousClose > 0 && !previousCloseMap.has(dr.symbol)) {
      previousCloseMap.set(dr.symbol, dr.previousClose);
      debugStats.counts.dailyRefToday++;
    }
  }

  // Pass 2: Fallback — older regularClose, then older previousClose (non-trading days only)
  for (const dr of dailyRefs) {
    if (previousCloseMap.has(dr.symbol)) continue;

    const drDateStr = getDateET(new Date(dr.date));
    const isToday = drDateStr === ctx.todayDateStr;

    if (!isToday && dr.regularClose && dr.regularClose > 0) {
      previousCloseMap.set(dr.symbol, dr.regularClose);
      debugStats.counts.dailyRefOlder++;
      continue;
    }

    if (!isToday && dr.previousClose && dr.previousClose > 0 &&
        (ctx.isNonTradingClosedDay || ctx.session === 'closed')) {
      previousCloseMap.set(dr.symbol, dr.previousClose);
      debugStats.counts.dailyRefOlder++;
    }
  }

  return { previousCloseMap, regularCloseMap, debugStats };
}
