import { prisma } from '@/lib/db/prisma';

/**
 * Returns the list of ticker symbols eligible for /financials/[ticker] SEO pages.
 *
 * Eligibility criteria (hard gate):
 *   ≥4 FinancialStatement rows with non-null:
 *   - revenue (> 0)
 *   - netIncome
 *   - totalAssets
 *   - totalLiabilities
 *   - totalEquity
 *
 * This ensures enough data for meaningful YoY trends and balance sheet analysis.
 * Tickers with only 1-3 statements are excluded (insufficient trend data).
 *
 * DB stats:
 * - 700 tickers with FinancialStatement
 * - 695 with ≥4 statements
 * - 684 with ≥4 statements AND all 5 key fields non-null (strict)
 * - 592 with ≥6 statements
 * - 585 with ≥8 statements
 *
 * Falls back to empty array if DB unavailable.
 */
export async function getEligibleFinancialsTickers(): Promise<string[]> {
  try {
    const tickers = await prisma.financialStatement.groupBy({
      by: ['symbol'],
      where: {
        AND: [
          { revenue: { not: null, gt: 0 } },
          { netIncome: { not: null } },
          { totalAssets: { not: null } },
          { totalLiabilities: { not: null } },
          { totalEquity: { not: null } },
        ],
      },
      _count: { revenue: true },
      having: { revenue: { _count: { gte: 4 } } },
    });
    return tickers.map((t) => t.symbol).sort();
  } catch {
    return [];
  }
}

/**
 * Synchronous eligibility check for a single ticker at runtime.
 * Used by generateMetadata to decide index vs noindex.
 */
export async function hasFinancialsData(symbol: string): Promise<boolean> {
  try {
    const count = await prisma.financialStatement.count({
      where: {
        symbol,
        AND: [
          { revenue: { not: null, gt: 0 } },
          { netIncome: { not: null } },
          { totalAssets: { not: null } },
          { totalLiabilities: { not: null } },
          { totalEquity: { not: null } },
        ],
      },
    });
    return count >= 4;
  } catch {
    return false;
  }
}

/**
 * Fetch financial statements for SSR content.
 * Returns all statements sorted by end date ascending (oldest first).
 */
export async function getFinancialStatements(symbol: string) {
  try {
    const rows = await prisma.financialStatement.findMany({
      where: { symbol },
      orderBy: { endDate: 'asc' },
      select: {
        period: true,
        endDate: true,
        fiscalYear: true,
        fiscalPeriod: true,
        revenue: true,
        netIncome: true,
        ebit: true,
        grossProfit: true,
        operatingCashFlow: true,
        capex: true,
        totalAssets: true,
        totalLiabilities: true,
        currentAssets: true,
        currentLiabilities: true,
        retainedEarnings: true,
        totalEquity: true,
        totalDebt: true,
        cashAndEquivalents: true,
        sharesOutstanding: true,
        sbc: true,
        interestExpense: true,
        netPPE: true,
      },
    });
    return rows;
  } catch {
    return [];
  }
}
