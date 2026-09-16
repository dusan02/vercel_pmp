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
