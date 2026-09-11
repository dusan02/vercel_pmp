import Link from 'next/link';

interface SeoTextSectionProps {
  ticker: string;
  companyName: string;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  healthScore: number | null;
  hasEarnings: boolean;
  hasValuation: boolean;
  hasFinancials: boolean;
  peersCount: number;
}

function formatMarketCap(value: number | null): string {
  if (value == null) return '';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)} trillion`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)} billion`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)} million`;
  return `$${value.toFixed(0)}`;
}

function healthLabel(score: number | null): string {
  if (score == null) return 'not yet calculated';
  if (score >= 75) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 45) return 'moderate';
  if (score >= 30) return 'weak';
  return 'poor';
}

/**
 * Server-rendered SEO text section for /analysis/[ticker] pages.
 * Provides unique, keyword-rich prose content that Google can index.
 * This addresses the "thin content" issue that causes pages to be
 * "Crawled - currently not indexed" in Google Search Console.
 */
export function SeoTextSection({
  ticker,
  companyName,
  price,
  changePct,
  marketCap,
  sector,
  industry,
  healthScore,
  hasEarnings,
  hasValuation,
  hasFinancials,
  peersCount,
}: SeoTextSectionProps) {
  const priceStr = price != null ? `$${price.toFixed(2)}` : null;
  const changeStr = changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : null;
  const mcapStr = formatMarketCap(marketCap);
  const healthStr = healthLabel(healthScore);
  const healthNum = healthScore != null ? `${Math.round(healthScore)}/100` : '';

  const sectorText = sector ? ` operating in the ${sector} sector${industry ? `, specifically the ${industry} industry` : ''}` : '';
  const priceText = priceStr
    ? `As of the latest update, ${companyName} is trading at ${priceStr}${changeStr ? `, ${changeStr >= '+' ? 'up' : 'down'} ${changeStr.replace(/[+-]/, '')} on the day` : ''}`
    : `Real-time pricing data for ${companyName} is available on this page`;
  const mcapText = mcapStr ? ` with a market capitalization of ${mcapStr}` : '';
  const healthText = healthScore != null
    ? `The financial health score for ${ticker} is ${healthNum}, which indicates ${healthStr} financial strength based on profitability, leverage, liquidity, and growth metrics`
    : `The financial health score for ${ticker} has not yet been calculated — analysis data is being compiled`;

  return (
    <section className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
      <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-400">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          About {companyName} ({ticker}) Stock
        </h2>
        <p>
          {companyName} ({ticker}) is a US-listed stock{sectorText}. {priceText}{mcapText}.{' '}
          {healthText}. This page provides real-time pre-market pricing, earnings calendar,
          financial health analysis, and valuation metrics for {ticker} stock.
        </p>

        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-4">
          {ticker} Stock Analysis & Key Metrics
        </h3>
        <p>
          On PreMarketPrice, you can track {companyName} ({ticker}) across multiple dimensions:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            <strong>Pre-market price & movement:</strong> Real-time {ticker} stock price
            with percentage change, updated continuously during pre-market and regular trading hours.
          </li>
          {hasEarnings && (
            <li>
              <strong>Earnings calendar:</strong> Upcoming and past earnings reports for {ticker},
              including EPS estimates, actual results, and surprise percentages.
            </li>
          )}
          {hasValuation && (
            <li>
              <Link href={`/valuation/${ticker}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                <strong>Valuation & P/E history:</strong> Historical P/E, P/S, and P/B ratios for {ticker}
              </Link>{' '}
              with trend analysis and normalized valuation multiples.
            </li>
          )}
          {hasFinancials && (
            <li>
              <Link href={`/financials/${ticker}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                <strong>Financial statements:</strong> Revenue, net income, assets, liabilities, and equity for {companyName}
              </Link>{' '}
              across multiple reporting periods.
            </li>
          )}
          <li>
            <strong>Financial health score:</strong> A composite score{' '}
            {healthScore != null ? `of ${healthNum} ` : ''}based on Altman Z-Score, Piotroski F-Score,
            profitability, and leverage metrics for {ticker}.
          </li>
          {peersCount > 0 && (
            <li>
              <strong>Sector peers:</strong> Compare {ticker} against {peersCount} other{' '}
              {sector ? sector.toLowerCase() : ''} stocks on key financial metrics.
            </li>
          )}
        </ul>

        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-4">
          Is {ticker} a Good Stock to Buy?
        </h3>
        <p>
          This page provides data-driven analysis to help you evaluate {companyName} ({ticker}) as an investment.
          The financial health score{healthScore != null ? ` of ${healthNum}` : ''}{' '}
          {healthScore != null ? `suggests ${healthStr} financial fundamentals` : 'is being calculated'}.
          {hasValuation && ' Valuation metrics show whether the stock is trading above or below its historical average.'}
          {hasEarnings && ' Earnings data reveals whether the company is meeting or beating analyst expectations.'}
          However, this is not financial advice — always do your own research before investing.
        </p>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          Data on this page is sourced from real-time market feeds, Polygon.io, and Finnhub.
          {companyName} ({ticker}) trades on{' '}
          {sector === 'Financial Services' ? 'NYSE' : 'NYSE/NASDAQ'}.
          Pre-market trading occurs 4:00 AM – 9:30 AM ET. Regular market hours are 9:30 AM – 4:00 PM ET.
        </p>
      </div>
    </section>
  );
}
