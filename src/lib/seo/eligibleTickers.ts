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

/**
 * Returns a Set of eligible ticker symbols for O(1) lookup.
 * Use this in SSR pages to filter <Link href="/analysis/[ticker]"> elements
 * so Google doesn't discover thin/noindex pages.
 *
 * Example:
 *   const eligible = await getEligibleAnalysisSet();
 *   {tickers.map(t => eligible.has(t.symbol) && <Link href={`/analysis/${t.symbol}`}>...)}
 */
export async function getEligibleAnalysisSet(): Promise<Set<string>> {
  const tickers = await getEligibleAnalysisTickers();
  return new Set(tickers);
}

/**
 * Filter an array of ticker symbols to only include eligible ones.
 * Use this when you have a list of tickers from Redis/DB and need to
 * only link to those with AnalysisCache.
 */
export async function filterEligibleTickers(symbols: string[]): Promise<string[]> {
  const eligible = await getEligibleAnalysisSet();
  return symbols.filter((s) => eligible.has(s));
}
