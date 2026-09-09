/**
 * Batch DB loaders for ingestBatch.
 *
 * Fetches per-ticker metadata in a single DB query to avoid N+1 patterns
 * during batch processing.
 */

import { prisma } from '@/lib/db/prisma';

export type TickerStats = {
  avgVolume20d: number | null;
  avgReturn20d: number | null;
  stdDevReturn20d: number | null;
};

/**
 * Batch load lastChangePct for all tickers (used when static lock is held).
 */
export async function batchLoadLastChangePct(
  tickers: string[]
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  try {
    const rows = await prisma.ticker.findMany({
      where: { symbol: { in: tickers } },
      select: { symbol: true, lastChangePct: true }
    });
    rows.forEach(t => map.set(t.symbol, t.lastChangePct));
    console.log(`📊 Batch loaded lastChangePct for ${map.size} tickers (lock optimization)`);
  } catch (error) {
    console.warn('⚠️  Failed to batch load lastChangePct, will fallback to per-ticker queries:', error);
  }
  return map;
}

/**
 * Batch load statistical baselines for Movers calculation.
 */
export async function batchLoadTickerStats(
  tickers: string[]
): Promise<Map<string, TickerStats>> {
  const map = new Map<string, TickerStats>();
  try {
    const rows = await prisma.ticker.findMany({
      where: { symbol: { in: tickers } },
      select: {
        symbol: true,
        avgVolume20d: true,
        avgReturn20d: true,
        stdDevReturn20d: true,
      }
    });
    rows.forEach(s => map.set(s.symbol, s));
  } catch (error) {
    console.warn('⚠️  Failed to batch load statistical baselines:', error);
  }
  return map;
}
