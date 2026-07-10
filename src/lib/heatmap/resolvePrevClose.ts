/**
 * Unified previousClose resolution for the heatmap API.
 *
 * Consolidates the three previously-duplicated code paths (stockCache, priceCache, DB)
 * into a single function with clear priority rules.
 */

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
 *   3. prevFromTicker (NOT used — stale on non-trading days)
 *   4. batchClose
 */
export function resolvePrevClose(
  sources: PrevCloseSources,
  ctx: PrevCloseContext
): number {
  const { refFromDaily, prevFromTicker, cachedClose, batchClose } = sources;
  const { isNonTradingClosedDay } = ctx;

  if (isNonTradingClosedDay) {
    // On weekends/holidays: prefer DailyRef (Friday's regularClose), then cache, then batch.
    // Do NOT fall back to Ticker.latestPrevClose — it may be stale from Thursday.
    if (refFromDaily > 0) return refFromDaily;
    if (cachedClose > 0) return cachedClose;
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
