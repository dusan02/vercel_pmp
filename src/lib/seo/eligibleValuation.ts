import { prisma } from '@/lib/db/prisma';

/**
 * Returns the list of ticker symbols eligible for /valuation/[ticker] SEO pages.
 *
 * Eligibility criteria (hard gate):
 *   1. ≥20 non-null, positive P/E observations in DailyValuationHistory
 *   2. ≥20 non-null, positive P/S observations in DailyValuationHistory
 *
 * This ensures enough historical data to compute meaningful ranges, percentiles,
 * and trend commentary for SSR content. Tickers with 100+ rows but mostly null
 * PE/PS values are excluded (thin data guard).
 *
 * Note: pbRatio is currently empty in the DB (0 non-null values), so P/B is
 * not part of eligibility. EV/EBITDA has 534 tickers with ≥20 observations
 * and is used as a supplementary metric where available.
 *
 * Falls back to empty array if DB unavailable (no valuation pages generated).
 */
export async function getEligibleValuationTickers(): Promise<string[]> {
  try {
    const peTickers = await prisma.dailyValuationHistory.groupBy({
      by: ['symbol'],
      where: {
        peRatio: { not: null, gt: 0 },
      },
      _count: { peRatio: true },
      having: { peRatio: { _count: { gte: 20 } } },
    });

    const psTickers = await prisma.dailyValuationHistory.groupBy({
      by: ['symbol'],
      where: {
        psRatio: { not: null, gt: 0 },
      },
      _count: { psRatio: true },
      having: { psRatio: { _count: { gte: 20 } } },
    });

    const peSet = new Set(peTickers.map((t) => t.symbol));
    const psSet = new Set(psTickers.map((t) => t.symbol));

    // Intersection: must have ≥20 PE AND ≥20 PS
    const eligible = [...peSet].filter((s) => psSet.has(s)).sort();
    return eligible;
  } catch {
    return [];
  }
}

/**
 * Synchronous eligibility check for a single ticker at runtime.
 * Used by generateMetadata to decide index vs noindex.
 */
export async function hasValuationData(symbol: string): Promise<boolean> {
  try {
    const peCount = await prisma.dailyValuationHistory.count({
      where: { symbol, peRatio: { not: null, gt: 0 } },
    });
    if (peCount < 20) return false;

    const psCount = await prisma.dailyValuationHistory.count({
      where: { symbol, psRatio: { not: null, gt: 0 } },
    });
    return psCount >= 20;
  } catch {
    return false;
  }
}

/**
 * Fetch valuation history for SSR content.
 * Returns the most recent 500 observations (sorted by date ascending)
 * to compute historical ranges, percentiles, and trends.
 */
export async function getValuationHistory(symbol: string) {
  try {
    // Get the most recent 500 observations (descending then reverse for chronological order)
    const rows = await prisma.dailyValuationHistory.findMany({
      where: { symbol },
      orderBy: { date: 'desc' },
      take: 500,
      select: {
        date: true,
        peRatio: true,
        psRatio: true,
        evEbitda: true,
        fcfYield: true,
        dividendYield: true,
        closePrice: true,
        marketCap: true,
      },
    });
    return rows.reverse(); // chronological order (oldest first)
  } catch {
    return [];
  }
}
