/**
 * Freshest-price merge — the single policy for Ticker.lastPrice vs
 * SessionPrice.lastPrice.
 *
 * SessionPrice rows can outlive their session (a stale overnight row is not
 * a live quote), so a session price only overrides the worker's Ticker
 * baseline when it is strictly newer by SESSION_PRICE_OVERRIDE_MS. All three
 * consumers (stockService, getMovers, heatmap buildPriceMap) share this
 * tie-break so /stocks, /heatmap and movers show the same price.
 */

import { prisma } from '@/lib/db/prisma';
import { getDateET, createETDate } from '@/lib/utils/dateET';

export const SESSION_PRICE_OVERRIDE_MS = 60_000;

export function sessionPriceOverrides(
  sessionTsMs: number,
  tickerTsMs: number | null | undefined
): boolean {
  return !tickerTsMs || sessionTsMs > tickerTsMs + SESSION_PRICE_OVERRIDE_MS;
}

/**
 * Newest SessionPrice row per symbol within a 2-day ET lookback — the exact
 * query stockService and getMovers previously duplicated inline.
 */
export async function fetchLatestSessionPrices(
  symbols: string[],
  at: Date
): Promise<Map<string, { price: number; ts: Date }>> {
  const latest = new Map<string, { price: number; ts: Date }>();
  if (symbols.length === 0) return latest;

  const today = createETDate(getDateET(at));
  const lookback = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

  const rows = await prisma.sessionPrice.findMany({
    where: { symbol: { in: symbols }, date: { gte: lookback, lte: today } },
    orderBy: { lastTs: 'desc' },
    select: { symbol: true, lastPrice: true, lastTs: true },
  });

  for (const sp of rows) {
    if (!latest.has(sp.symbol)) latest.set(sp.symbol, { price: sp.lastPrice, ts: sp.lastTs });
  }
  return latest;
}
