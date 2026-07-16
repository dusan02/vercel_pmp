/**
 * Centralized previousClose write service.
 *
 * All prevClose writes should go through this module to ensure:
 * 1. Redis + DailyRef + Ticker stay consistent
 * 2. regularClose is never overwritten by bootstrap (only by saveRegularClose)
 * 3. Clear separation: who writes what, when
 *
 * Writers:
 * - saveRegularClose: sets prevClose for NEXT trading day (forward-looking)
 * - bootstrapPreviousCloses: fills gaps for TODAY (backward-looking)
 * - verify-prevclose: corrects incorrect values (corrective)
 * - onDemandPrevClose: fetches when missing (reactive)
 */

import { prisma } from '@/lib/db/prisma';
import { setPrevClose } from '@/lib/redis/operations';
import { getDateET } from '@/lib/utils/dateET';

type DbRetryFn = <T>(fn: () => Promise<T>, label: string) => Promise<T | null>;

export type PrevCloseWriteResult = {
  redis: boolean;
  dailyRef: boolean;
  ticker: boolean;
};

/**
 * Write previousClose for a specific trading day.
 *
 * - Redis: sets `prevclose:{date}:{symbol}` (always)
 * - DailyRef: upserts `previousClose` for the given date (always)
 *   Does NOT touch `regularClose` on update — only on create.
 * - Ticker: updates `latestPrevClose` + `latestPrevCloseDate` (optional, default true)
 *
 * @param dateStr   Calendar date (YYYY-MM-DD) for Redis key
 * @param tradingDay Date object for DailyRef row
 * @param symbol    Ticker symbol
 * @param prevClose Previous close price
 * @param opts      Optional: skipTickerUpdate, dbRetry wrapper
 */
export async function writePrevClose(
  dateStr: string,
  tradingDay: Date,
  symbol: string,
  prevClose: number,
  opts?: {
    skipTickerUpdate?: boolean;
    skipRedis?: boolean;
    dbRetry?: DbRetryFn;
  }
): Promise<PrevCloseWriteResult> {
  const skipTicker = opts?.skipTickerUpdate ?? false;
  const skipRedis = opts?.skipRedis ?? false;
  const retry = opts?.dbRetry ?? (async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try { return await fn(); } catch { return null; }
  });

  const result: PrevCloseWriteResult = { redis: false, dailyRef: false, ticker: false };

  if (prevClose <= 0) return result;

  // 1. Redis
  if (!skipRedis) {
    try {
      result.redis = await setPrevClose(dateStr, symbol, prevClose);
    } catch {
      // non-fatal
    }
  } else {
    result.redis = true; // Already written by caller
  }

  // 2. DailyRef — only update previousClose, preserve existing regularClose
  const drResult = await retry(
    () => prisma.dailyRef.upsert({
      where: { symbol_date: { symbol, date: tradingDay } },
      update: { previousClose: prevClose, updatedAt: new Date() },
      create: { symbol, date: tradingDay, previousClose: prevClose, regularClose: null },
    }),
    `prevCloseService.dailyRef:${symbol}`
  );
  result.dailyRef = drResult !== null;

  // 3. Ticker (optional — saveRegularClose skips this to avoid after-hours inversion)
  if (!skipTicker) {
    const tResult = await retry(
      () => prisma.ticker.upsert({
        where: { symbol },
        update: { latestPrevClose: prevClose, latestPrevCloseDate: tradingDay },
        create: {
          symbol,
          latestPrevClose: prevClose,
          latestPrevCloseDate: tradingDay,
          lastPrice: 0,
          lastChangePct: 0,
          lastMarketCap: 0,
          lastMarketCapDiff: 0,
          lastVolume: 0,
          sector: 'Unknown',
          industry: 'Unknown',
        },
      }),
      `prevCloseService.ticker:${symbol}`
    );
    result.ticker = tResult !== null;
  }

  return result;
}

/**
 * Write regularClose for a specific trading day.
 * Used by saveRegularClose to record the actual close price.
 * Does NOT touch previousClose — that's a separate concern.
 *
 * @param tradingDay Date object for DailyRef row
 * @param symbol     Ticker symbol
 * @param regularClose Regular close price
 * @param opts       Optional: dbRetry wrapper
 */
export async function writeRegularClose(
  tradingDay: Date,
  symbol: string,
  regularClose: number,
  opts?: { dbRetry?: DbRetryFn }
): Promise<boolean> {
  if (regularClose <= 0) return false;

  const retry = opts?.dbRetry ?? (async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try { return await fn(); } catch { return null; }
  });

  const result = await retry(
    () => prisma.dailyRef.upsert({
      where: { symbol_date: { symbol, date: tradingDay } },
      update: { regularClose, updatedAt: new Date() },
      create: { symbol, date: tradingDay, regularClose, previousClose: 0 },
    }),
    `prevCloseService.regularClose:${symbol}`
  );

  return result !== null;
}

/**
 * Write prevClose for today's calendar date (used by bootstrap).
 * Convenience wrapper around writePrevClose that derives dateStr from tradingDay.
 */
export async function writePrevCloseForToday(
  tradingDay: Date,
  symbol: string,
  prevClose: number,
  opts?: { skipTickerUpdate?: boolean; dbRetry?: DbRetryFn }
): Promise<PrevCloseWriteResult> {
  const dateStr = getDateET(tradingDay);
  return writePrevClose(dateStr, tradingDay, symbol, prevClose, opts);
}
