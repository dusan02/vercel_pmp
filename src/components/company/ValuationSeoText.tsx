import Link from 'next/link';

interface ValuationSeoTextProps {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  price: number | null;
  marketCap: number | null;
  dataPoints: number;
  dateRange: string;
  peCurrent: number | null;
  peMedian: number | null;
  pePercentile: number | null;
  psCurrent: number | null;
  psMedian: number | null;
  avgPercentile: number | null;
  verdict: string;
  hasAnalysis: boolean;
  hasFinancials: boolean;
}

function formatRatio(value: number | null): string {
  if (value == null) return 'N/A';
  return value.toFixed(2);
}

/**
 * Server-rendered SEO text for /valuation/[ticker] pages.
 * Provides unique, keyword-rich content about the company's valuation metrics.
 */
export function ValuationSeoText({
  ticker,
  companyName,
  sector,
  industry,
  price,
  marketCap,
  dataPoints,
  dateRange,
  peCurrent,
  peMedian,
  pePercentile,
  psCurrent,
  psMedian,
  avgPercentile,
  verdict,
  hasAnalysis,
  hasFinancials,
}: ValuationSeoTextProps) {
  const sectorText = sector
    ? ` operating in the ${sector} sector${industry ? `, specifically the ${industry} industry` : ''}`
    : '';
  const priceText = price != null ? ` currently trading at $${price.toFixed(2)}` : '';
  const mcapText = marketCap != null
    ? ` with a market capitalization of ${marketCap >= 1e12 ? `$${(marketCap / 1e12).toFixed(2)} trillion` : `$${(marketCap / 1e9).toFixed(1)} billion`}`
    : '';
  const peText = peCurrent != null && peMedian != null
    ? ` The P/E ratio of ${formatRatio(peCurrent)} is ${peCurrent > peMedian ? 'above' : 'below'} the historical median of ${formatRatio(peMedian)}, placing ${ticker} at the ${pePercentile ?? 50}th percentile of its valuation range`
    : '';
  const psText = psCurrent != null && psMedian != null
    ? ` The P/S ratio of ${formatRatio(psCurrent)} compares to a median of ${formatRatio(psMedian)}`
    : '';

  return (
    <section className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
      <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-400">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          {companyName} ({ticker}) Valuation & P/E History
        </h2>
        <p>
          {companyName} ({ticker}) is a US-listed stock{sectorText}{priceText}{mcapText}.
          This page provides historical valuation analysis for {ticker} based on {dataPoints} data points
          covering {dateRange}.{peText}.{psText}.
        </p>

        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-4">
          {ticker} Valuation Metrics & Historical Range
        </h3>
        <p>
          The valuation table above shows {companyName}'s current and historical valuation multiples,
          including P/E ratio, P/S ratio, EV/EBITDA, FCF yield, and dividend yield.
          Each metric is compared to its own historical range to determine whether {ticker} is currently
          trading above or below its typical valuation levels.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            <strong>P/E ratio:</strong> Price-to-earnings measures how much investors pay per dollar of earnings.
            A P/E above the historical median suggests {ticker} is expensively valued; below the median suggests it is cheap.
          </li>
          <li>
            <strong>P/S ratio:</strong> Price-to-sales is useful for companies with volatile or negative earnings.
            Lower P/S relative to history may indicate value.
          </li>
          <li>
            <strong>EV/EBITDA:</strong> Enterprise value to EBITDA adjusts for debt and cash, providing a
            capital-structure-neutral valuation measure for {companyName}.
          </li>
          <li>
            <strong>FCF yield:</strong> Free cash flow yield shows the cash return relative to market price.
            Higher yields may indicate undervaluation.
          </li>
        </ul>

        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-4">
          Is {ticker} Overvalued or Undervalued?
        </h3>
        <p>
          {verdict} The overall valuation percentile of {avgPercentile?.toFixed(0) ?? 'N/A'}
          {' '}combines P/E, P/S, and EV/EBITDA percentiles into a single measure of how expensive
          {' '}{ticker} is relative to its own history. A percentile below 25 suggests the stock may be
          undervalued, while a percentile above 75 suggests it may be overvalued.
        </p>
        <p>
          However, valuation is only one factor in investment decisions. A stock can remain "overvalued"
          for years if growth accelerates, or "undervalued" if the business deteriorates. Always combine
          valuation analysis with{' '}
          {hasFinancials && (
            <>
              <Link href={`/financials/${ticker}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                financial statement analysis
              </Link>
              {' '}and{' '}
            </>
          )}
          {hasAnalysis && (
            <Link href={`/analysis/${ticker}`} className="text-blue-600 dark:text-blue-400 hover:underline">
              the full {ticker} analysis page
            </Link>
          )}{' '}
          for a complete picture.
        </p>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          Valuation data is computed from historical price and fundamental data via Polygon.io and Finnhub.
          {ticker} trades on {sector === 'Financial Services' ? 'NYSE' : 'NYSE/NASDAQ'}.
          This page is for informational purposes only and is not financial advice.
        </p>
      </div>
    </section>
  );
}
