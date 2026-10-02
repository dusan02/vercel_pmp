/**
 * PrevClose date semantics — the single source of truth.
 *
 * Invariant:
 *   - Redis key `prevclose:{sessionDate}:{symbol}` and the DailyRef(symbol,
 *     sessionDate) row are keyed by the day the prevClose is FOR (the ET
 *     session/calendar date).
 *   - `Ticker.latestPrevCloseDate` is the date OF the close itself (the
 *     trading day the price belongs to).
 *
 * Writing the DailyRef row under the close's own date corrupted historical
 * previousClose values with that day's own close (Sep 2026 incident —
 * fixed via the dailyRefDate plumbing in prevCloseService). Always derive
 * these dates through this module instead of ad-hoc getLastTradingDay()
 * calls at each write site.
 */

import { getDateET, createETDate, nowET } from './dateET';
import { getLastTradingDay } from './timeUtils';

export interface PrevCloseContext {
  /** ET calendar date (YYYY-MM-DD) the prevClose is FOR — Redis key + DailyRef row */
  sessionDateStr: string;
  /** sessionDateStr as an ET-midnight Date (for Prisma comparisons) */
  sessionDate: Date;
  /** Trading day whose close IS the prevClose — Ticker.latestPrevCloseDate */
  closeRefDay: Date;
  /** closeRefDay as YYYY-MM-DD */
  closeRefDateStr: string;
}

/**
 * Resolve the prevClose date context for a moment in time.
 *
 * @param at  Date, or an ET calendar date string (YYYY-MM-DD) when computing
 *            context for a specific session date rather than "now".
 */
export function getPrevCloseContext(at: Date | string = nowET()): PrevCloseContext {
  const sessionDateStr = typeof at === 'string' ? at : getDateET(at);
  const sessionDate = createETDate(sessionDateStr);
  // getLastTradingDay is strictly-before: Tue → Mon, Mon → Fri, Sat → Fri.
  const closeRefDay = getLastTradingDay(sessionDate);
  return {
    sessionDateStr,
    sessionDate,
    closeRefDay,
    closeRefDateStr: getDateET(closeRefDay),
  };
}

/**
 * The trading day whose close serves as prevClose for a given session date.
 */
export function getPrevCloseRefDay(sessionDateStr: string): Date {
  return getLastTradingDay(createETDate(sessionDateStr));
}

/**
 * Is `Ticker.latestPrevCloseDate` fresh enough to trust for the current
 * session? `latestPrevClose` is only valid when the close it holds is at
 * least as recent as the last trading day — otherwise it's a stale value
 * from a previous session and must not be used as today's reference
 * (Oct-2 incident: stale latestPrevClose produced a two-day move).
 *
 * Use this guard at every read site that falls back to Ticker.latestPrevClose.
 */
export function isFreshPrevCloseDate(
  prevCloseDate: Date | null | undefined,
  lastTradingDay: Date
): boolean {
  return !!prevCloseDate && prevCloseDate.getTime() >= lastTradingDay.getTime();
}

/*
 * PrevClose read priorities — one chain per consumer. Keep this list in sync
 * when adding a new read site; the write side has a single writer
 * (writePrevClose → Redis + DailyRef + Ticker).
 *
 *   stockService (/api/stocks):
 *     prevDayClose (DailyRef D-1 regularClose) → on-demand Polygon batch →
 *     DailyRef(D).previousClose → Ticker.latestPrevClose (guarded)
 *
 *   worker resolvePrevCloses (ingest):
 *     Redis prevclose:{D} → DailyRef(D).previousClose →
 *     DailyRef(D-1).regularClose → Polygon bootstrap
 *
 *   heatmap resolvePrevClose (lib/heatmap):
 *     trading day:  worker cache → DailyRef(D) → Ticker (guarded) → batch
 *     closed day:   DailyRef → worker cache → Ticker (guarded) → batch
 *
 *   movers getMovers (/api/stocks/movers):
 *     DailyRef(D).previousClose → Ticker.latestPrevClose (guarded)
 */
