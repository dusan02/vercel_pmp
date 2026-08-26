import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generateCompanyMetadata } from '@/lib/seo/metadata';
import { getCompanyName } from '@/lib/companyNames';
import { AnalysisTabClient } from '@/components/company/AnalysisTabClient';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { getEligibleAnalysisTickers, hasAnalysisCache } from '@/lib/seo/eligibleTickers';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ ticker: string }>;
}

const baseUrl = 'https://premarketprice.com';

async function getTickerData(symbol: string) {
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
        employees: true,
        websiteUrl: true,
        headquarters: true,
        logoUrl: true,
        latestPrevClose: true,
        analysisCache: {
          select: {
            healthScore: true,
            profitabilityScore: true,
            valuationScore: true,
            verdictText: true,
            piotroskiScore: true,
            altmanZ: true,
            revenueCagr: true,
            netIncomeCagr: true,
            fcfMargin: true,
            debtRepaymentYears: true,
            humanDebtInfo: true,
            humanPeInfo: true,
            marginStability: true,
          },
        },
        finnhubMetrics: {
          select: {
            peRatio: true,
            forwardPe: true,
            pbRatio: true,
            psRatio: true,
            evEbitda: true,
            pegRatio: true,
            roe: true,
            roa: true,
            grossMargin: true,
            operatingMargin: true,
            netMargin: true,
            revenueGrowth: true,
            earningsGrowth: true,
            currentRatio: true,
            debtEquityRatio: true,
            dividendYield: true,
            beta: true,
          },
        },
      },
    });
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const tickers = await getEligibleAnalysisTickers();
  return tickers.map((t) => ({ ticker: t.toLowerCase() }));
}

/**
 * Fetch recent significant moves from SessionPrice for the "Recent Market Moves"
 * section. Same logic as /movers/[symbol] — |zScore| >= 2.0, last 30 days.
 */
async function getRecentSignificantMoves(symbol: string) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [positive, negative] = await Promise.all([
      prisma.sessionPrice.findMany({
        where: { symbol, date: { gte: since }, zScore: { gte: 2.0 } },
        orderBy: { date: 'desc' },
        take: 5,
        select: { date: true, session: true, changePct: true, zScore: true, lastPrice: true },
      }),
      prisma.sessionPrice.findMany({
        where: { symbol, date: { gte: since }, zScore: { lte: -2.0 } },
        orderBy: { date: 'desc' },
        take: 5,
        select: { date: true, session: true, changePct: true, zScore: true, lastPrice: true },
      }),
    ]);

    const all = [...positive, ...negative].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );
    return all.slice(0, 5);
  } catch {
    return [];
  }
}

function formatSessionLabel(session: string): string {
  const map: Record<string, string> = {
    pre: 'Pre-market',
    live: 'Regular',
    after: 'After-hours',
    closed: 'Closed',
  };
  return map[session] ?? session;
}

// --- Server-rendered SEO summary helpers ---

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return '';
  if (score >= 75) return 'strong';
  if (score >= 50) return 'moderate';
  return 'weak';
}

function formatRatio(value: number | null | undefined, suffix = '×'): string {
  if (value == null || !isFinite(value)) return '';
  return `${value.toFixed(2)}${suffix}`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return '';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatMarketCapB(value: number | null | undefined): string {
  if (value == null || value <= 0 || !isFinite(value)) return '';
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  if (value >= 1) return `$${value.toFixed(1)}B`;
  return `$${(value * 1000).toFixed(0)}M`;
}

interface MetricRow {
  label: string;
  value: string;
  hint?: string;
}

/**
 * Server-rendered SEO summary for /analysis/[ticker].
 *
 * This is the ONLY server-rendered financial content on the page — the
 * AnalysisTabClient below has ssr:false, so without this section Googlebot
 * sees only breadcrumbs, schema.org, and loading placeholders.
 *
 * The summary includes:
 *   - Company description (if available)
 *   - Key metrics table (scores, ratios, growth)
 *   - Natural-language summary paragraph (ticker-specific, not template)
 *
 * All values are pulled from AnalysisCache + FinnhubMetrics + Ticker.
 * Missing values are omitted — no fake/default data.
 */
function SeoAnalysisSummary({
  ticker,
  companyName,
  data,
}: {
  ticker: string;
  companyName: string;
  data: Awaited<ReturnType<typeof getTickerData>>;
}) {
  const cache = data?.analysisCache;
  const metrics = data?.finnhubMetrics;

  // Build metrics rows — only include if value exists
  const rows: MetricRow[] = [];

  if (cache?.healthScore != null) {
    rows.push({ label: 'Financial Health Score', value: `${cache.healthScore.toFixed(0)}/100`, hint: scoreLabel(cache.healthScore) });
  }
  if (cache?.profitabilityScore != null) {
    rows.push({ label: 'Profitability Score', value: `${cache.profitabilityScore.toFixed(0)}/100`, hint: scoreLabel(cache.profitabilityScore) });
  }
  if (cache?.valuationScore != null) {
    rows.push({ label: 'Valuation Score', value: `${cache.valuationScore.toFixed(0)}/100`, hint: scoreLabel(cache.valuationScore) });
  }
  if (cache?.altmanZ != null) {
    const zone = cache.altmanZ > 3 ? 'safe' : cache.altmanZ > 1.8 ? 'grey' : 'distressed';
    rows.push({ label: 'Altman Z-Score', value: cache.altmanZ.toFixed(2), hint: zone });
  }
  if (cache?.piotroskiScore != null) {
    rows.push({ label: 'Piotroski F-Score', value: `${cache.piotroskiScore}/9` });
  }
  if (metrics?.peRatio != null && metrics.peRatio > 0) {
    rows.push({ label: 'P/E Ratio (TTM)', value: metrics.peRatio.toFixed(2) });
  }
  if (metrics?.forwardPe != null && metrics.forwardPe > 0) {
    rows.push({ label: 'Forward P/E', value: metrics.forwardPe.toFixed(2) });
  }
  if (metrics?.psRatio != null && metrics.psRatio > 0) {
    rows.push({ label: 'P/S Ratio', value: metrics.psRatio.toFixed(2) });
  }
  if (metrics?.pbRatio != null && metrics.pbRatio > 0) {
    rows.push({ label: 'P/B Ratio', value: metrics.pbRatio.toFixed(2) });
  }
  if (metrics?.evEbitda != null && metrics.evEbitda > 0) {
    rows.push({ label: 'EV/EBITDA', value: metrics.evEbitda.toFixed(2) });
  }
  if (metrics?.roe != null) {
    rows.push({ label: 'ROE', value: formatPct(metrics.roe) });
  }
  if (metrics?.roa != null) {
    rows.push({ label: 'ROA', value: formatPct(metrics.roa) });
  }
  if (metrics?.grossMargin != null) {
    rows.push({ label: 'Gross Margin', value: formatPct(metrics.grossMargin) });
  }
  if (metrics?.netMargin != null) {
    rows.push({ label: 'Net Margin', value: formatPct(metrics.netMargin) });
  }
  if (cache?.revenueCagr != null) {
    rows.push({ label: 'Revenue CAGR', value: formatPct(cache.revenueCagr) });
  }
  if (cache?.netIncomeCagr != null) {
    rows.push({ label: 'Net Income CAGR', value: formatPct(cache.netIncomeCagr) });
  }
  if (metrics?.revenueGrowth != null) {
    rows.push({ label: 'Revenue Growth (YoY)', value: formatPct(metrics.revenueGrowth) });
  }
  if (metrics?.earningsGrowth != null) {
    rows.push({ label: 'Earnings Growth (YoY)', value: formatPct(metrics.earningsGrowth) });
  }
  if (metrics?.currentRatio != null) {
    rows.push({ label: 'Current Ratio', value: formatRatio(metrics.currentRatio, '') });
  }
  if (metrics?.debtEquityRatio != null) {
    rows.push({ label: 'Debt/Equity', value: formatRatio(metrics.debtEquityRatio, '') });
  }
  if (cache?.fcfMargin != null) {
    rows.push({ label: 'FCF Margin', value: formatPct(cache.fcfMargin * 100) });
  }
  if (metrics?.dividendYield != null && metrics.dividendYield > 0) {
    rows.push({ label: 'Dividend Yield', value: formatPct(metrics.dividendYield * 100) });
  }
  if (metrics?.beta != null) {
    rows.push({ label: 'Beta', value: metrics.beta.toFixed(2) });
  }

  // If we have no metrics at all, don't render the section
  if (rows.length === 0 && !data?.description) {
    return null;
  }

  // Build natural-language summary paragraph
  const summaryParts: string[] = [];

  if (data?.description) {
    // Truncate description to ~200 chars for the summary
    const desc = data.description.length > 200
      ? data.description.slice(0, 197).trim() + '...'
      : data.description;
    summaryParts.push(desc);
  }

  const scoreParts: string[] = [];
  if (cache?.healthScore != null) {
    scoreParts.push(`financial health score of ${cache.healthScore.toFixed(0)}/100 (${scoreLabel(cache.healthScore)})`);
  }
  if (cache?.profitabilityScore != null) {
    scoreParts.push(`profitability score of ${cache.profitabilityScore.toFixed(0)}/100 (${scoreLabel(cache.profitabilityScore)})`);
  }
  if (cache?.valuationScore != null) {
    scoreParts.push(`valuation score of ${cache.valuationScore.toFixed(0)}/100 (${scoreLabel(cache.valuationScore)})`);
  }

  if (scoreParts.length > 0) {
    summaryParts.push(`${companyName} (${ticker}) has a ${scoreParts.join(', ')}.`);
  }

  const ratioParts: string[] = [];
  if (cache?.altmanZ != null) {
    const zone = cache.altmanZ > 3 ? 'indicating low bankruptcy risk' : cache.altmanZ > 1.8 ? 'in the grey zone' : 'indicating financial distress';
    ratioParts.push(`Altman Z-Score of ${cache.altmanZ.toFixed(2)} (${zone})`);
  }
  if (cache?.piotroskiScore != null) {
    ratioParts.push(`Piotroski F-Score of ${cache.piotroskiScore}/9`);
  }
  if (metrics?.peRatio != null && metrics.peRatio > 0) {
    ratioParts.push(`P/E ratio of ${metrics.peRatio.toFixed(1)}`);
  }
  if (metrics?.psRatio != null && metrics.psRatio > 0) {
    ratioParts.push(`P/S ratio of ${metrics.psRatio.toFixed(1)}`);
  }

  if (ratioParts.length > 0) {
    summaryParts.push(`Key metrics include ${ratioParts.join(', ')}.`);
  }

  const growthParts: string[] = [];
  if (cache?.revenueCagr != null) {
    growthParts.push(`revenue CAGR of ${formatPct(cache.revenueCagr)}`);
  }
  if (cache?.netIncomeCagr != null) {
    growthParts.push(`net income CAGR of ${formatPct(cache.netIncomeCagr)}`);
  }
  if (metrics?.revenueGrowth != null) {
    growthParts.push(`revenue growth of ${formatPct(metrics.revenueGrowth)} YoY`);
  }

  if (growthParts.length > 0) {
    summaryParts.push(`${companyName} shows ${growthParts.join(' and ')}.`);
  }

  if (cache?.verdictText) {
    summaryParts.push(cache.verdictText);
  }

  return (
    <section
      className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6"
      aria-label={`${companyName} stock analysis summary`}
    >
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
        {companyName} ({ticker}) Stock Analysis
      </h2>

      {/* Natural-language summary */}
      {summaryParts.length > 0 && (
        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2 mb-4 leading-relaxed max-w-3xl">
          {summaryParts.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {/* Key metrics table */}
      {rows.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 mt-4">
            Key Financial Metrics
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 font-medium">
                      {row.label}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-gray-900 dark:text-gray-100 font-semibold">
                      {row.value}
                    </td>
                    {row.hint && (
                      <td className="py-2 text-xs text-gray-500 dark:text-gray-500 italic">
                        {row.hint}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Price + market cap quick stats */}
      {(data?.lastPrice != null || data?.lastMarketCap != null) && (
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {data?.lastPrice != null && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Current Price: </span>
              <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {formatPrice(data.lastPrice)}
              </span>
            </div>
          )}
          {data?.lastChangePct != null && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Change: </span>
              <span className={`font-semibold tabular-nums ${data.lastChangePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatPercent(data.lastChangePct)}
              </span>
            </div>
          )}
          {data?.lastMarketCap != null && data.lastMarketCap > 0 && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Market Cap: </span>
              <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {formatMarketCapB(data.lastMarketCap)}
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

      {/* Cross-link to valuation page */}
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-sm">
        <Link
          href={`/valuation/${ticker}`}
          className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          {companyName} ({ticker}) Valuation & P/E History →
        </Link>
      </div>
    </section>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerData(tickerUpper);
  const companyName = data?.name || getCompanyName(tickerUpper);

  const metadata = generateCompanyMetadata({
    ticker: tickerUpper,
    companyName,
    ...(data?.lastPrice != null ? { price: data.lastPrice } : {}),
    ...(data?.lastChangePct != null ? { percentChange: data.lastChangePct } : {}),
    ...(data?.lastMarketCap != null ? { marketCap: data.lastMarketCap } : {}),
    ...(data?.sector ? { sector: data.sector } : {}),
    ...(data?.industry ? { industry: data.industry } : {}),
  });

  // Thin-content guard: tickers without AnalysisCache have no fundamental
  // analysis data. The analysis tab is client-rendered (ssr:false), so without
  // AnalysisCache the server-rendered HTML is minimal. → noindex to avoid
  // wasting crawl budget on empty pages.
  const hasCache = await hasAnalysisCache(tickerUpper);
  if (!hasCache) {
    return {
      ...metadata,
      robots: { index: false, follow: true },
    };
  }

  return metadata;
}

export default async function AnalysisPage({ params }: PageProps) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerData(tickerUpper);

  if (!data && !getCompanyName(tickerUpper)) {
    notFound();
  }

  const companyName = data?.name || getCompanyName(tickerUpper) || tickerUpper;
  const price = data?.lastPrice;
  const changePct = data?.lastChangePct;
  const marketCap = data?.lastMarketCap;
  const isPositive = (changePct ?? 0) >= 0;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'Stocks', item: `${baseUrl}/premarket-movers` },
      { '@type': 'ListItem', position: 3, name: `${companyName} (${tickerUpper})`, item: `${baseUrl}/analysis/${tickerUpper}` },
    ],
  };

  const stockSchema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${companyName} Stock`,
    tickerSymbol: tickerUpper,
    description: data?.description || `Real-time pre-market stock data and analysis for ${companyName} (${tickerUpper}). Track price, % change, market cap, earnings and more.`,
    ...(data?.sector ? { category: data.sector } : {}),
    provider: {
      '@type': 'Organization',
      name: 'PreMarketPrice',
      url: baseUrl,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(stockSchema) }} />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Breadcrumb */}
        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <ol className="flex items-center space-x-2 text-sm">
              <li><Link href="/" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Home</Link></li>
              <li className="text-gray-400">/</li>
              <li><Link href="/premarket-movers" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Stocks</Link></li>
              <li className="text-gray-400">/</li>
              <li className="text-gray-900 dark:text-gray-100 font-medium">{tickerUpper}</li>
            </ol>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Server-rendered SEO summary — visible to crawlers without JS */}
          <SeoAnalysisSummary
            ticker={tickerUpper}
            companyName={companyName}
            data={data}
          />

          {/* Full interactive analysis (client-side) */}
          <AnalysisTabClient ticker={tickerUpper} hideSearch />

          {/* Recent Market Moves — from SessionPrice data */}
          {await (async () => {
            const recentMoves = await getRecentSignificantMoves(tickerUpper);
            if (recentMoves.length === 0) return null;

            return (
              <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Recent Market Moves
                  </h2>
                  <Link
                    href={`/movers/${tickerUpper}`}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    See all {tickerUpper} moves →
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Session</th>
                        <th className="px-3 py-2 font-medium">Price</th>
                        <th className="px-3 py-2 font-medium">Move</th>
                        <th className="px-3 py-2 font-medium">Z-Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentMoves.map((m, i) => {
                        const moveUp = m.changePct >= 0;
                        return (
                          <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50">
                            <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                              {m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                              {formatSessionLabel(m.session)}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                              {formatPrice(m.lastPrice)}
                            </td>
                            <td className={`px-3 py-2 tabular-nums font-semibold ${moveUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {formatPercent(m.changePct)}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                              {m.zScore?.toFixed(2) ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* SEO: Related stocks */}
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Explore More Stocks</h2>
            <div className="flex flex-wrap gap-2">
              {['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'WMT', 'V']
                .filter((t) => t !== tickerUpper)
                .map((t) => (
                  <Link
                    key={t}
                    href={`/analysis/${t}`}
                    className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    {t}
                  </Link>
                ))}
              <Link href="/premarket-movers" className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors">
                View all stocks →
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
