import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { getCompanyName } from '@/lib/companyNames';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import {
  getEligibleValuationTickers,
  hasValuationData,
  getValuationHistory,
} from '@/lib/seo/eligibleValuation';

export const revalidate = 3600; // 1 hour — valuation history updates daily

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
        lastChangePct: true,
        lastMarketCap: true,
        description: true,
      },
    });
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const tickers = await getEligibleValuationTickers();
  return tickers.map((t) => ({ ticker: t.toLowerCase() }));
}

// --- Statistical helpers ---

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx] ?? 0;
}

function computeStats(values: (number | null | undefined)[]) {
  const valid = values.filter((v): v is number => v != null && v > 0 && isFinite(v));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = percentile(sorted, 0.5);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  const current = valid[valid.length - 1] ?? sorted[sorted.length - 1] ?? 0; // last value chronologically
  // Percentile rank of current value within historical range
  const below = sorted.filter((v) => v < current).length;
  const currentPercentile = Math.round((below / sorted.length) * 100);
  return { min, max, median, p25, p75, current, currentPercentile, count: valid.length };
}

function formatRatio(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return 'N/A';
  return value.toFixed(2);
}

function valuationLabel(percentile: number): string {
  if (percentile >= 80) return 'expensive relative to its history';
  if (percentile >= 60) return 'above its historical average';
  if (percentile >= 40) return 'near its historical average';
  if (percentile >= 20) return 'below its historical average';
  return 'cheap relative to its history';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerBasicData(tickerUpper);
  const companyName = data?.name || getCompanyName(tickerUpper);

  const eligible = await hasValuationData(tickerUpper);

  const title = `${companyName} (${tickerUpper}) Valuation & P/E History`;
  const description = `${companyName} (${tickerUpper}) stock valuation analysis — historical P/E, P/S, EV/EBITDA ranges and percentiles. Is ${tickerUpper} overvalued or undervalued?`;

  const metadata = generatePageMetadata({
    title,
    description,
    path: `/valuation/${tickerUpper}`,
    keywords: [
      `${tickerUpper} valuation`,
      `${tickerUpper} PE ratio`,
      `${tickerUpper} P/E history`,
      `${tickerUpper} P/S ratio`,
      `is ${tickerUpper} overvalued`,
      `${tickerUpper} stock valuation`,
      `${tickerLower(tickerUpper)} valuation`,
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

function tickerLower(t: string): string {
  return t.toLowerCase();
}

export default async function ValuationPage({ params }: PageProps) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerBasicData(tickerUpper);

  if (!data && !getCompanyName(tickerUpper)) {
    notFound();
  }

  const companyName = data?.name || getCompanyName(tickerUpper) || tickerUpper;
  const history = await getValuationHistory(tickerUpper);

  if (history.length < 20) {
    // Not enough data — show minimal page with noindex (handled by generateMetadata)
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <main className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {companyName} ({tickerUpper}) Valuation
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Insufficient historical valuation data for {companyName}.
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

  // Compute stats for each metric
  const peStats = computeStats(history.map((h) => h.peRatio));
  const psStats = computeStats(history.map((h) => h.psRatio));
  const evEbitdaStats = computeStats(history.map((h) => h.evEbitda));
  const fcfYieldStats = computeStats(history.map((h) => h.fcfYield));
  const dividendYieldStats = computeStats(history.map((h) => h.dividendYield));

  // Date range
  const firstDate = history[0]?.date;
  const lastDate = history[history.length - 1]?.date;
  const dateRangeStr = firstDate && lastDate
    ? `${firstDate.toISOString().split('T')[0]} to ${lastDate.toISOString().split('T')[0]}`
    : '';

  // Build natural-language summary
  const summaryParts: string[] = [];

  if (data?.description) {
    const desc = data.description.length > 200
      ? data.description.slice(0, 197).trim() + '...'
      : data.description;
    summaryParts.push(desc);
  }

  const valuationParts: string[] = [];
  if (peStats) {
    valuationParts.push(
      `P/E ratio of ${formatRatio(peStats.current)} (historical range: ${formatRatio(peStats.min)}–${formatRatio(peStats.max)}, median: ${formatRatio(peStats.median)}), placing it at the ${peStats.currentPercentile}th percentile — ${valuationLabel(peStats.currentPercentile)}`
    );
  }
  if (psStats) {
    valuationParts.push(
      `P/S ratio of ${formatRatio(psStats.current)} (range: ${formatRatio(psStats.min)}–${formatRatio(psStats.max)}, ${psStats.currentPercentile}th percentile — ${valuationLabel(psStats.currentPercentile)})`
    );
  }
  if (evEbitdaStats) {
    valuationParts.push(
      `EV/EBITDA of ${formatRatio(evEbitdaStats.current)} (range: ${formatRatio(evEbitdaStats.min)}–${formatRatio(evEbitdaStats.max)}, ${evEbitdaStats.currentPercentile}th percentile)`
    );
  }

  if (valuationParts.length > 0) {
    summaryParts.push(
      `${companyName} (${tickerUpper}) currently trades at a ${valuationParts.join(', ')}.`
    );
  }

  // Trend commentary
  const trendParts: string[] = [];
  if (peStats && peStats.count >= 50) {
    const firstHalf = history.slice(0, Math.floor(history.length / 2));
    const secondHalf = history.slice(Math.floor(history.length / 2));
    const firstHalfPE = firstHalf.filter((h) => h.peRatio && h.peRatio > 0).map((h) => h.peRatio!);
    const secondHalfPE = secondHalf.filter((h) => h.peRatio && h.peRatio > 0).map((h) => h.peRatio!);
    if (firstHalfPE.length > 0 && secondHalfPE.length > 0) {
      const avgFirst = firstHalfPE.reduce((a, b) => a + b, 0) / firstHalfPE.length;
      const avgSecond = secondHalfPE.reduce((a, b) => a + b, 0) / secondHalfPE.length;
      const change = ((avgSecond - avgFirst) / avgFirst) * 100;
      if (Math.abs(change) > 10) {
        trendParts.push(
          `P/E ratio has ${change > 0 ? 'expanded' : 'contracted'} by ${Math.abs(change).toFixed(0)}% over the observed period (from an average of ${avgFirst.toFixed(1)} to ${avgSecond.toFixed(1)})`
        );
      }
    }
  }

  if (trendParts.length > 0) {
    summaryParts.push(`Over the historical period (${dateRangeStr}), ${companyName}'s ${trendParts.join(' and ')}.`);
  }

  // Overall valuation verdict
  const scores: number[] = [];
  if (peStats) scores.push(peStats.currentPercentile);
  if (psStats) scores.push(psStats.currentPercentile);
  if (evEbitdaStats) scores.push(evEbitdaStats.currentPercentile);
  const avgPercentile = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 50;

  let verdict: string;
  if (avgPercentile >= 75) {
    verdict = `${companyName} appears overvalued relative to its own historical valuation range, trading at elevated multiples across most metrics.`;
  } else if (avgPercentile >= 55) {
    verdict = `${companyName} appears slightly overvalued relative to its historical range, with most valuation metrics above their median levels.`;
  } else if (avgPercentile >= 45) {
    verdict = `${companyName} appears fairly valued relative to its historical range, with valuation metrics near their median levels.`;
  } else if (avgPercentile >= 25) {
    verdict = `${companyName} appears undervalued relative to its historical range, with most valuation metrics below their median levels.`;
  } else {
    verdict = `${companyName} appears significantly undervalued relative to its historical range, trading at depressed multiples across most metrics.`;
  }
  summaryParts.push(verdict);

  // Schema.org
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'Stocks', item: `${baseUrl}/premarket-movers` },
      { '@type': 'ListItem', position: 3, name: `${companyName} (${tickerUpper}) Analysis`, item: `${baseUrl}/analysis/${tickerUpper}` },
      { '@type': 'ListItem', position: 4, name: 'Valuation', item: `${baseUrl}/valuation/${tickerUpper}` },
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
              <li className="text-gray-900 dark:text-gray-100 font-medium">Valuation</li>
            </ol>
          </div>
        </nav>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Server-rendered SEO summary */}
          <section
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6"
            aria-label={`${companyName} valuation analysis`}
          >
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {companyName} ({tickerUpper}) Valuation
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Historical valuation analysis based on {history.length} data points ({dateRangeStr})
            </p>

            {/* Natural-language summary */}
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2 mb-6 leading-relaxed max-w-3xl">
              {summaryParts.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {/* Valuation metrics table */}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Historical Valuation Metrics
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-4 text-left text-gray-600 dark:text-gray-400 font-semibold">Metric</th>
                    <th className="py-2 pr-4 text-right text-gray-600 dark:text-gray-400 font-semibold">Current</th>
                    <th className="py-2 pr-4 text-right text-gray-600 dark:text-gray-400 font-semibold">Min</th>
                    <th className="py-2 pr-4 text-right text-gray-600 dark:text-gray-400 font-semibold">Median</th>
                    <th className="py-2 pr-4 text-right text-gray-600 dark:text-gray-400 font-semibold">Max</th>
                    <th className="py-2 pr-4 text-right text-gray-600 dark:text-gray-400 font-semibold">Percentile</th>
                    <th className="py-2 text-left text-gray-600 dark:text-gray-400 font-semibold">Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  {peStats && (
                    <ValuationRow label="P/E Ratio" stats={peStats} />
                  )}
                  {psStats && (
                    <ValuationRow label="P/S Ratio" stats={psStats} />
                  )}
                  {evEbitdaStats && (
                    <ValuationRow label="EV/EBITDA" stats={evEbitdaStats} />
                  )}
                  {fcfYieldStats && (
                    <ValuationRow label="FCF Yield" stats={fcfYieldStats} invertPercentile />
                  )}
                  {dividendYieldStats && dividendYieldStats.count > 0 && (
                    <ValuationRow label="Dividend Yield" stats={dividendYieldStats} invertPercentile />
                  )}
                </tbody>
              </table>
            </div>

            {/* Quick stats */}
            {(data?.lastPrice != null || data?.lastMarketCap != null) && (
              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                {data?.lastPrice != null && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Current Price: </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {formatPrice(data.lastPrice)}
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

function ValuationRow({
  label,
  stats,
  invertPercentile = false,
}: {
  label: string;
  stats: NonNullable<ReturnType<typeof computeStats>>;
  invertPercentile?: boolean;
}) {
  // For FCF Yield and Dividend Yield, higher = cheaper (better value)
  // So invert the percentile for assessment
  const assessmentPercentile = invertPercentile ? 100 - stats.currentPercentile : stats.currentPercentile;
  const assessment = valuationLabel(assessmentPercentile);

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700/50">
      <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 font-medium">{label}</td>
      <td className="py-2 pr-4 tabular-nums text-gray-900 dark:text-gray-100 font-semibold text-right">{formatRatio(stats.current)}</td>
      <td className="py-2 pr-4 tabular-nums text-gray-500 dark:text-gray-500 text-right">{formatRatio(stats.min)}</td>
      <td className="py-2 pr-4 tabular-nums text-gray-700 dark:text-gray-300 text-right">{formatRatio(stats.median)}</td>
      <td className="py-2 pr-4 tabular-nums text-gray-500 dark:text-gray-500 text-right">{formatRatio(stats.max)}</td>
      <td className="py-2 pr-4 tabular-nums text-gray-900 dark:text-gray-100 font-semibold text-right">{stats.currentPercentile}th</td>
      <td className="py-2 text-xs text-gray-500 dark:text-gray-500 italic">{assessment}</td>
    </tr>
  );
}
