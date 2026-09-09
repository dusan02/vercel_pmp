import { prisma } from '@/lib/db/prisma';
import { getProjectTickers } from '@/data/defaultTickers';

/**
 * Returns the list of ticker symbols eligible for /analysis/[ticker] SEO pages.
 *
 * Eligibility criteria:
 *   1. Ticker row exists in DB
 *   2. Has AnalysisCache (health/profitability/valuation scores) — without this
 *      the page is thin content (the analysis tab is client-rendered with ssr:false,
 *      so the only server-rendered substance comes from Ticker metadata + Recent
 *      Moves + schema.org; AnalysisCache existence is our proxy for "this ticker
 *      has real fundamental data behind it").
 *
 * Falls back to the hardcoded getProjectTickers('pmp') list (~360) if the DB query
 * fails, so builds never break due to DB unavailability.
 */
export async function getEligibleAnalysisTickers(): Promise<string[]> {
  try {
    const rows = await prisma.ticker.findMany({
      where: {
        analysisCache: { isNot: null },
      },
      select: { symbol: true },
      orderBy: { symbol: 'asc' },
    });
    const symbols = rows.map((r) => r.symbol);
    if (symbols.length === 0) {
      // Fallback to hardcoded list
      return getProjectTickers('pmp');
    }
    return symbols;
  } catch {
    // Fallback to hardcoded list if DB is unavailable
    return getProjectTickers('pmp');
  }
}

/**
 * Synchronous eligibility check for a single ticker at runtime.
 * Used by generateMetadata to decide index vs noindex.
 *
 * Returns true if the ticker has AnalysisCache (real fundamental data).
 */
export async function hasAnalysisCache(symbol: string): Promise<boolean> {
  try {
    const count = await prisma.analysisCache.count({
      where: { symbol },
    });
    return count > 0;
  } catch {
    return false;
  }
}
