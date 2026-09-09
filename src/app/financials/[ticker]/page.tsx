import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { getCompanyName } from '@/lib/companyNames';
import {
  getEligibleFinancialsTickers,
  hasFinancialsData,
  getFinancialStatements,
} from '@/lib/seo/eligibleFinancials';

export const revalidate = 3600; // 1 hour

interface PageProps {
  params: Promise<{ ticker: string }>;
}

const baseUrl = 'https://premarketprice.com';

async function getTickerBasicData(symbol: string) {
  try {
    return await prisma.ticker.findUnique({
      where: { symbol },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        lastPrice: true,
        lastMarketCap: true,
        description: true,
      },
    });
  } catch {
    return null;
  }
}

// --- Formatting helpers ---

function formatLargeNumber(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatRatio(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return 'N/A';
  return value.toFixed(2);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function yoyChange(current: number, previous: number): number | null {
  if (previous === 0 || !isFinite(previous) || !isFinite(current)) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function periodLabel(fiscalYear: number, fiscalPeriod: string): string {
  if (fiscalPeriod === 'FY') return `FY${fiscalYear}`;
  return `${fiscalPeriod} FY${fiscalYear}`;
}

export async function generateStaticParams() {
  const tickers = await getEligibleFinancialsTickers();
  return tickers.map((t) => ({ ticker: t.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerBasicData(tickerUpper);
  const companyName = data?.name || getCompanyName(tickerUpper);

  const eligible = await hasFinancialsData(tickerUpper);

  const title = `${companyName} (${tickerUpper}) Financial Statements & Revenue History`;
  const description = `${companyName} (${tickerUpper}) financial statements — revenue, net income, balance sheet, and cash flow trends. Historical quarterly and annual financials with YoY growth analysis.`;

  const metadata = generatePageMetadata({
    title,
    description,
    path: `/financials/${tickerUpper}`,
    keywords: [
      `${tickerUpper} financials`,
      `${tickerUpper} revenue`,
      `${tickerUpper} net income`,
      `${tickerUpper} balance sheet`,
      `${tickerUpper} cash flow`,
      `${tickerUpper} financial statements`,
      `${tickerUpper} earnings history`,
    ],
  });

  if (!eligible) {
    return {
      ...metadata,
      robots: { index: false, follow: true },
    };
  }

  return metadata;
}

export default async function FinancialsPage({ params }: PageProps) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerBasicData(tickerUpper);

  if (!data && !getCompanyName(tickerUpper)) {
    notFound();
  }

  const companyName = data?.name || getCompanyName(tickerUpper) || tickerUpper;
  const statements = await getFinancialStatements(tickerUpper);

  if (statements.length < 4) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <main className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {companyName} ({tickerUpper}) Financials
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Insufficient financial statement data for {companyName}.
          </p>
          <Link
            href={`/analysis/${tickerUpper}`}
            className="mt-4 inline-block text-blue-600 dark:text-blue-400 hover:underline"
          >
            View {tickerUpper} Analysis →
          </Link>
        </main>
      </div>
    );
  }

  // Filter to statements with revenue for trend analysis
  const validStatements = statements.filter(
    (s) => s.revenue != null && s.revenue > 0 && s.netIncome != null
  );

  // Get annual statements (FY) for YoY comparison
  const annualStatements = validStatements.filter((s) => s.fiscalPeriod === 'FY');
  // Get quarterly statements for the table
  const quarterlyStatements = validStatements.filter((s) => s.fiscalPeriod !== 'FY');

  // Use annual for trend commentary, quarterly for the table
  const trendData = annualStatements.length >= 2 ? annualStatements : validStatements;
  const tableData = quarterlyStatements.length >= 4 ? quarterlyStatements : validStatements;

  // Take last 8 for the table
  const displayStatements = tableData.slice(-8);

  // --- Trend commentary ---
  const trendParts: string[] = [];

  if (data?.description) {
    const desc = data.description.length > 200
      ? data.description.slice(0, 197).trim() + '...'
      : data.description;
    trendParts.push(desc);
  }

  // Revenue trend
  if (trendData.length >= 2) {
    const latest = trendData[trendData.length - 1]!;
    const previous = trendData[trendData.length - 2]!;
    const revGrowth = yoyChange(latest.revenue!, previous.revenue!);
    const niGrowth = yoyChange(latest.netIncome!, previous.netIncome!);

    if (revGrowth != null) {
      const direction = revGrowth >= 0 ? 'increased' : 'decreased';
      trendParts.push(
        `${companyName}'s revenue ${direction} ${Math.abs(revGrowth).toFixed(1)}% year over year, from ${formatLargeNumber(previous.revenue)} to ${formatLargeNumber(latest.revenue)}.`
      );
    }
    if (niGrowth != null) {
      const direction = niGrowth >= 0 ? 'increased' : 'decreased';
      trendParts.push(
        `Net income ${direction} ${Math.abs(niGrowth).toFixed(1)}% over the same period, from ${formatLargeNumber(previous.netIncome)} to ${formatLargeNumber(latest.netIncome)}.`
      );
    }
  }

  // Multi-period revenue trend (if >=4 annual statements)
  if (trendData.length >= 4) {
    const first = trendData[0]!;
    const last = trendData[trendData.length - 1]!;
    const totalGrowth = yoyChange(last.revenue!, first.revenue!);
    if (totalGrowth != null) {
      const yearsSpan = last.fiscalYear - first.fiscalYear;
      if (yearsSpan > 0 && Math.abs(totalGrowth) < 10000) {
        trendParts.push(
          `Over the ${yearsSpan}-year period from FY${first.fiscalYear} to FY${last.fiscalYear}, revenue ${totalGrowth >= 0 ? 'grew' : 'declined'} by ${Math.abs(totalGrowth).toFixed(0)}% in total.`
        );
      }
    }
  }

  // Balance sheet commentary
  if (trendData.length >= 2) {
    const latest = trendData[trendData.length - 1]!;
    const previous = trendData[trendData.length - 2]!;
    if (latest.totalDebt != null && previous.totalDebt != null) {
      const debtChange = ((latest.totalDebt - previous.totalDebt) / Math.abs(previous.totalDebt || 1)) * 100;
      if (Math.abs(debtChange) < 5) {
        trendParts.push(`Total debt remained relatively stable at ${formatLargeNumber(latest.totalDebt)}.`);
      } else if (debtChange > 0) {
        trendParts.push(`Total debt increased by ${debtChange.toFixed(1)}% to ${formatLargeNumber(latest.totalDebt)}.`);
      } else {
        trendParts.push(`Total debt decreased by ${Math.abs(debtChange).toFixed(1)}% to ${formatLargeNumber(latest.totalDebt)}.`);
      }
    }

    // Debt-to-equity ratio
    if (latest.totalDebt != null && latest.totalEquity != null && latest.totalEquity > 0) {
      const deRatio = latest.totalDebt / latest.totalEquity;
      let deAssessment: string;
      if (deRatio < 0.3) deAssessment = 'conservative';
      else if (deRatio < 1.0) deAssessment = 'moderate';
      else if (deRatio < 2.0) deAssessment = 'elevated';
      else deAssessment = 'high';
      trendParts.push(
        `The debt-to-equity ratio stands at ${deRatio.toFixed(2)}, indicating a ${deAssessment} leverage profile.`
      );
    }
  }

  // Cash flow commentary
  if (trendData.length >= 2) {
    const latest = trendData[trendData.length - 1]!;
    const previous = trendData[trendData.length - 2]!;
    if (latest.operatingCashFlow != null && previous.operatingCashFlow != null) {
      const ocfGrowth = yoyChange(latest.operatingCashFlow, previous.operatingCashFlow);
      if (ocfGrowth != null) {
        trendParts.push(
          `Operating cash flow ${ocfGrowth >= 0 ? 'grew' : 'declined'} ${Math.abs(ocfGrowth).toFixed(1)}% to ${formatLargeNumber(latest.operatingCashFlow)}.`
        );
      }
    }
  }

  // Profitability summary
  if (trendData.length >= 1) {
    const latest = trendData[trendData.length - 1]!;
    if (latest.revenue! > 0 && latest.netIncome != null) {
      const netMargin = (latest.netIncome / latest.revenue!) * 100;
      let marginAssessment: string;
      if (netMargin > 20) marginAssessment = 'strong';
      else if (netMargin > 10) marginAssessment = 'healthy';
      else if (netMargin > 0) marginAssessment = 'moderate';
      else marginAssessment = 'negative';
      trendParts.push(
        `${companyName} maintains a ${marginAssessment} net profit margin of ${netMargin.toFixed(1)}%.`
      );
    }
  }

  // Schema.org
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'Stocks', item: `${baseUrl}/stocks` },
      { '@type': 'ListItem', position: 3, name: `${companyName} (${tickerUpper}) Analysis`, item: `${baseUrl}/analysis/${tickerUpper}` },
      { '@type': 'ListItem', position: 4, name: 'Financials', item: `${baseUrl}/financials/${tickerUpper}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Breadcrumb */}
        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <ol className="flex items-center space-x-2 text-sm">
              <li><Link href="/" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Home</Link></li>
              <li className="text-gray-400">/</li>
              <li><Link href={`/analysis/${tickerUpper}`} className="text-gray-500 hover:text-blue-600 dark:text-gray-400">{tickerUpper}</Link></li>
              <li className="text-gray-400">/</li>
              <li className="text-gray-900 dark:text-gray-100 font-medium">Financials</li>
            </ol>
          </div>
        </nav>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Server-rendered SEO summary */}
          <section
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6"
            aria-label={`${companyName} financial statements`}
          >
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {companyName} ({tickerUpper}) Financial Statements
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Historical financial data — {statements.length} statements covering
              {trendData.length > 0 && ` FY${trendData[0]!.fiscalYear}–FY${trendData[trendData.length - 1]!.fiscalYear}`}
            </p>

            {/* Natural-language summary */}
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2 mb-6 leading-relaxed max-w-3xl">
              {trendParts.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {/* Financial statements table */}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Recent Financial Statements
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Period</th>
                    <th className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Revenue</th>
                    <th className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Net Income</th>
                    <th className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Gross Profit</th>
                    <th className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400 font-semibold">EBIT</th>
                    <th className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Op. Cash Flow</th>
                    <th className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Total Assets</th>
                    <th className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Total Debt</th>
                    <th className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Equity</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStatements.map((s) => {
                    const idx = tableData.indexOf(s);
                    const prev = idx > 0 ? tableData[idx - 1] : null;
                    const revYoY = prev && prev.revenue ? yoyChange(s.revenue!, prev.revenue!) : null;
                    return (
                      <tr key={`${s.fiscalYear}-${s.fiscalPeriod}`} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">
                          {periodLabel(s.fiscalYear, s.fiscalPeriod)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-gray-900 dark:text-gray-100 text-right">
                          {formatLargeNumber(s.revenue)}
                          {revYoY != null && (
                            <span className={`block text-[10px] ${revYoY >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatPercent(revYoY)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-right text-gray-700 dark:text-gray-300">
                          {formatLargeNumber(s.netIncome)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-right text-gray-700 dark:text-gray-300">
                          {formatLargeNumber(s.grossProfit)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-right text-gray-700 dark:text-gray-300">
                          {formatLargeNumber(s.ebit)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-right text-gray-700 dark:text-gray-300">
                          {formatLargeNumber(s.operatingCashFlow)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-right text-gray-700 dark:text-gray-300">
                          {formatLargeNumber(s.totalAssets)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-right text-gray-700 dark:text-gray-300">
                          {formatLargeNumber(s.totalDebt)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-right text-gray-700 dark:text-gray-300">
                          {formatLargeNumber(s.totalEquity)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Balance sheet summary */}
            {trendData.length >= 2 && (
              <>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 mt-6">
                  Balance Sheet Summary (Latest Period)
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <BalanceSheetItem label="Total Assets" value={trendData[trendData.length - 1]!.totalAssets} />
                  <BalanceSheetItem label="Total Liabilities" value={trendData[trendData.length - 1]!.totalLiabilities} />
                  <BalanceSheetItem label="Total Equity" value={trendData[trendData.length - 1]!.totalEquity} />
                  <BalanceSheetItem label="Cash & Equivalents" value={trendData[trendData.length - 1]!.cashAndEquivalents} />
                  <BalanceSheetItem label="Total Debt" value={trendData[trendData.length - 1]!.totalDebt} />
                  <BalanceSheetItem label="Current Assets" value={trendData[trendData.length - 1]!.currentAssets} />
                  <BalanceSheetItem label="Current Liabilities" value={trendData[trendData.length - 1]!.currentLiabilities} />
                  <BalanceSheetItem label="Retained Earnings" value={trendData[trendData.length - 1]!.retainedEarnings} />
                </div>
              </>
            )}

            {/* Quick stats */}
            {(data?.lastPrice != null || data?.lastMarketCap != null) && (
              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                {data?.lastPrice != null && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Current Price: </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      ${data.lastPrice.toFixed(2)}
                    </span>
                  </div>
                )}
                {data?.lastMarketCap != null && data.lastMarketCap > 0 && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Market Cap: </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {data.lastMarketCap >= 1000 ? `$${(data.lastMarketCap / 1000).toFixed(2)}T` : `$${data.lastMarketCap.toFixed(1)}B`}
                    </span>
                  </div>
                )}
                {data?.sector && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Sector: </span>
                    <Link href={`/sectors/${encodeURIComponent(data.sector)}`} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      {data.sector}
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Cross-links */}
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 text-sm">
              <Link
                href={`/analysis/${tickerUpper}`}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                ← {tickerUpper} Stock Analysis
              </Link>
              <Link
                href={`/valuation/${tickerUpper}`}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {tickerUpper} Valuation & P/E History →
              </Link>
              <Link
                href={`/movers/${tickerUpper}`}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {tickerUpper} Market Moves →
              </Link>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}

function BalanceSheetItem({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
        {formatLargeNumber(value)}
      </div>
    </div>
  );
}
