import Link from 'next/link';

interface FinancialsSeoTextProps {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  price: number | null;
  marketCap: number | null;
  statementsCount: number;
  revenueLatest: number | null;
  revenueGrowth: number | null;
  netMargin: number | null;
  debtToEquity: number | null;
  hasAnalysis: boolean;
  hasValuation: boolean;
}

function formatLarge(value: number | null): string {
  if (value == null) return 'N/A';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)} trillion`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)} billion`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)} million`;
  return `$${value.toFixed(0)}`;
}

/**
 * Server-rendered SEO text for /financials/[ticker] pages.
 * Provides unique, keyword-rich content about the company's financial statements.
 */
export function FinancialsSeoText({
  ticker,
  companyName,
  sector,
  industry,
  price,
  marketCap,
  statementsCount,
  revenueLatest,
  revenueGrowth,
  netMargin,
  debtToEquity,
  hasAnalysis,
  hasValuation,
}: FinancialsSeoTextProps) {
  const sectorText = sector
    ? ` operating in the ${sector} sector${industry ? `, specifically the ${industry} industry` : ''}`
    : '';
  const priceText = price != null ? ` trading at $${price.toFixed(2)}` : '';
  const mcapText = marketCap != null ? ` with a market capitalization of ${formatLarge(marketCap)}` : '';
  const revText = revenueLatest != null
    ? ` Most recently, ${companyName} reported revenue of ${formatLarge(revenueLatest)}`
    : '';
  const growthText = revenueGrowth != null
    ? revenueGrowth >= 0
      ? `, representing ${revenueGrowth.toFixed(1)}% year-over-year growth`
      : `, a ${Math.abs(revenueGrowth).toFixed(1)}% decline from the prior year`
    : '';
  const marginText = netMargin != null
    ? ` The net profit margin of ${netMargin.toFixed(1)}% ${netMargin > 15 ? 'reflects strong profitability' : netMargin > 5 ? 'indicates moderate profitability' : netMargin > 0 ? 'suggests thin margins' : 'indicates the company is currently unprofitable'}`
    : '';
  const leverageText = debtToEquity != null
    ? ` The debt-to-equity ratio of ${debtToEquity.toFixed(2)} ${debtToEquity < 0.5 ? 'shows conservative leverage' : debtToEquity < 1.0 ? 'reflects moderate leverage' : debtToEquity < 2.0 ? 'indicates elevated leverage' : 'signals high leverage'}`
    : '';

  return (
    <section className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
      <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-400">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          {companyName} ({ticker}) Financial Statements & Revenue History
        </h2>
        <p>
          {companyName} ({ticker}) is a US-listed stock{sectorText}{priceText}{mcapText}.
          This page provides {statementsCount} historical financial statements for {companyName},
          including income statement, balance sheet, and cash flow data across multiple reporting periods.
          {revText}{growthText}.{marginText}.{leverageText}.
        </p>

        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-4">
          {ticker} Income Statement, Balance Sheet & Cash Flow
        </h3>
        <p>
          The financial statements table above shows {companyName}'s revenue, net income, gross profit,
          EBIT, operating cash flow, total assets, total debt, and shareholders' equity across the most
          recent reporting periods. Year-over-year growth rates help identify whether {ticker} is accelerating
          or decelerating in terms of top-line revenue and bottom-line profitability.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            <strong>Revenue trend:</strong> Track {ticker}'s top-line growth across quarters and fiscal years
            to identify acceleration or deceleration in the business.
          </li>
          <li>
            <strong>Profitability:</strong> Net income and gross profit margins reveal how efficiently
            {' '}{companyName} converts revenue into earnings.
          </li>
          <li>
            <strong>Balance sheet health:</strong> Total assets, liabilities, debt, and equity provide a snapshot
            of {ticker}'s financial position and leverage.
          </li>
          <li>
            <strong>Cash flow:</strong> Operating cash flow shows how much cash the business generates from its
            core operations, which is critical for funding dividends, buybacks, and growth.
          </li>
        </ul>

        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-4">
          How to Use {ticker} Financial Data
        </h3>
        <p>
          Investors use {companyName}'s financial statements to assess the company's financial health,
          growth trajectory, and valuation. Key metrics to focus on include:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            <strong>Revenue growth rate:</strong> Consistent double-digit revenue growth suggests a strong
            business; declining revenue may signal competitive pressure.
          </li>
          <li>
            <strong>Net profit margin:</strong> Higher margins indicate a more efficient business with pricing
            power. Compare {ticker}'s margins to sector peers for context.
          </li>
          <li>
            <strong>Debt levels:</strong> High debt-to-equity ratios increase financial risk, especially in
            rising-rate environments. Low debt provides flexibility.
          </li>
          {hasValuation && (
            <li>
              <Link href={`/valuation/${ticker}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                <strong>Valuation multiples:</strong> See how {ticker}'s P/E, P/S, and EV/EBITDA ratios
                compare to historical levels
              </Link>.
            </li>
          )}
          {hasAnalysis && (
            <li>
              <Link href={`/analysis/${ticker}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                <strong>Full analysis:</strong> View {ticker}'s financial health score, earnings, and
                pre-market pricing
              </Link>.
            </li>
          )}
        </ul>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          Financial data is sourced from {companyName}'s SEC filings (10-K, 10-Q) via Polygon.io and Finnhub.
          {ticker} trades on {sector === 'Financial Services' ? 'NYSE' : 'NYSE/NASDAQ'}.
          This page is for informational purposes only and is not financial advice.
        </p>
      </div>
    </section>
  );
}
