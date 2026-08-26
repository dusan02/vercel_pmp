import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { getCompanyName } from '@/lib/companyNames';
import { getProjectTickers } from '@/data/defaultTickers';
import { formatPercent, formatPrice, formatMarketCapDiff } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';

// Revalidate every 5 minutes — mover data is fairly stable post-session
export const revalidate = 300;

const baseUrl = 'https://premarketprice.com';

// Minimum number of significant moves in the last 30 days for a page to be
// worth indexing. Below this threshold the page is thin content → noindex.
const MIN_MOVES_FOR_INDEX = 3;
// Z-score threshold for a "significant" move
const SIGNIFICANT_Z_THRESHOLD = 2.0;
// How many recent moves to display
const RECENT_MOVES_LIMIT = 20;
// Lookback window for moves
const LOOKBACK_DAYS = 30;

interface PageProps {
  params: Promise<{ symbol: string }>;
}

interface RecentMove {
  date: Date;
  session: string;
  lastPrice: number;
  changePct: number;
  zScore: number | null;
  rvol: number | null;
}

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
        lastMarketCapDiff: true,
        latestPrevClose: true,
        latestMoversZScore: true,
        latestMoversRVOL: true,
        avgVolume20d: true,
        moversReason: true,
        moversCategory: true,
        logoUrl: true,
      },
    });
  } catch {
    return null;
  }
}

async function getRecentMoves(symbol: string): Promise<RecentMove[]> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);

    const rows = await prisma.sessionPrice.findMany({
      where: {
        symbol,
        date: { gte: since },
        // Only significant moves: |zScore| >= threshold
        zScore: {
          gte: SIGNIFICANT_Z_THRESHOLD,
        },
      },
      orderBy: { date: 'desc' },
      take: RECENT_MOVES_LIMIT,
      select: {
        date: true,
        session: true,
        lastPrice: true,
        changePct: true,
        zScore: true,
        rvol: true,
      },
    });

    // Also fetch negative z-score moves (Prisma can't do |zScore| in a single
    // filter, so we do a second query and merge)
    const negativeRows = await prisma.sessionPrice.findMany({
      where: {
        symbol,
        date: { gte: since },
        zScore: {
          lte: -SIGNIFICANT_Z_THRESHOLD,
        },
      },
      orderBy: { date: 'desc' },
      take: RECENT_MOVES_LIMIT,
      select: {
        date: true,
        session: true,
        lastPrice: true,
        changePct: true,
        zScore: true,
        rvol: true,
      },
    });

    const all = [...rows, ...negativeRows];
    // Deduplicate by date+session (shouldn't happen due to @@unique, but safe)
    const seen = new Set<string>();
    const deduped = all.filter((r) => {
      const key = `${r.date.toISOString()}-${r.session}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by date desc
    deduped.sort((a, b) => b.date.getTime() - a.date.getTime());

    return deduped.slice(0, RECENT_MOVES_LIMIT);
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

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function generateStaticParams() {
  // Pre-generate only tickers in our universe. At runtime, non-universe
  // tickers will 404. Sitemap will further filter to only tickers with
  // enough move data.
  const tickers = getProjectTickers('pmp');
  return tickers.map((t) => ({ symbol: t }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  const tickerUpper = symbol.toUpperCase();

  // Don't generate metadata for non-universe tickers
  if (!getProjectTickers('pmp').includes(tickerUpper)) {
    return { title: 'Not Found' };
  }

  const data = await getTickerData(tickerUpper);
  const companyName = data?.name || getCompanyName(tickerUpper);
  const moves = await getRecentMoves(tickerUpper);
  const hasEnoughData = moves.length >= MIN_MOVES_FOR_INDEX;

  const title = `${tickerUpper} Stock Movers & Unusual Moves | ${companyName}`;
  const description = `${companyName} (${tickerUpper}) unusual market moves — pre-market, regular session, and after-hours price action with Z-scores and relative volume. ${moves.length} significant moves in the last 30 days.`;

  const metadata = generatePageMetadata({
    title,
    description,
    path: `/movers/${tickerUpper}`,
    keywords: [
      `${tickerUpper} movers`,
      `${tickerUpper} premarket`,
      `${tickerLower(tickerUpper)} stock movers`,
      `${tickerUpper} unusual move`,
      `${tickerUpper} z-score`,
      `${companyName} stock moving`,
      'premarket movers',
      'stock movers today',
    ],
  });

  // Thin content → noindex
  if (!hasEnoughData) {
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

export default async function MoverSymbolPage({ params }: PageProps) {
  const { symbol } = await params;
  const tickerUpper = symbol.toUpperCase();

  // Only allow tickers in our universe
  if (!getProjectTickers('pmp').includes(tickerUpper)) {
    notFound();
  }

  const data = await getTickerData(tickerUpper);
  if (!data) {
    notFound();
  }

  const companyName = data.name || getCompanyName(tickerUpper) || tickerUpper;
  const moves = await getRecentMoves(tickerUpper);
  const hasEnoughData = moves.length >= MIN_MOVES_FOR_INDEX;

  const currentPrice = data.lastPrice;
  const currentChangePct = data.lastChangePct;
  const currentZScore = data.latestMoversZScore;
  const currentRvol = data.latestMoversRVOL;
  const isUp = (currentChangePct ?? 0) >= 0;

  // Schema.org structured data
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'Premarket Movers', item: `${baseUrl}/premarket-movers` },
      { '@type': 'ListItem', position: 3, name: `${companyName} (${tickerUpper}) Moves`, item: `${baseUrl}/movers/${tickerUpper}` },
    ],
  };

  const financeSchema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${companyName} Stock`,
    tickerSymbol: tickerUpper,
    description: `Unusual market moves and pre-market activity for ${companyName} (${tickerUpper}). Track Z-scores, relative volume, and significant price movements across sessions.`,
    ...(data.sector ? { category: data.sector } : {}),
    provider: {
      '@type': 'Organization',
      name: 'PreMarketPrice',
      url: baseUrl,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(financeSchema) }} />

      <div className="min-h-screen bg-white dark:bg-slate-900">
        {/* Breadcrumb */}
        <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-5xl mx-auto px-4 py-3">
            <ol className="flex items-center space-x-2 text-sm">
              <li><Link href="/" className="text-slate-500 hover:text-blue-600 dark:text-slate-400">Home</Link></li>
              <li className="text-slate-400">/</li>
              <li><Link href="/premarket-movers" className="text-slate-500 hover:text-blue-600 dark:text-slate-400">Movers</Link></li>
              <li className="text-slate-400">/</li>
              <li className="text-slate-900 dark:text-slate-100 font-medium">{tickerUpper}</li>
            </ol>
          </div>
        </nav>

        <main className="max-w-5xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              {companyName} ({tickerUpper}) Market Moves
            </h1>
            <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
              Unusual price movements and significant market activity for {companyName} ({tickerUpper}).
              {' '}Each move is flagged by Z-score statistical significance — showing when {tickerUpper} moved
              {' '}beyond its typical daily range.
              {moves.length > 0 && ` ${moves.length} significant move${moves.length === 1 ? '' : 's'} detected in the last ${LOOKBACK_DAYS} days.`}
            </p>
          </div>

          {/* Current state */}
          {(currentPrice != null || currentChangePct != null) && (
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">Current Market State</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {currentPrice != null && (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Price</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                      {formatPrice(currentPrice)}
                    </div>
                  </div>
                )}
                {currentChangePct != null && (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Change</div>
                    <div className={`mt-1 text-lg font-semibold tabular-nums ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {formatPercent(currentChangePct)}
                    </div>
                  </div>
                )}
                {currentZScore != null && Math.abs(currentZScore) >= SIGNIFICANT_Z_THRESHOLD && (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Z-Score</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                      {currentZScore.toFixed(2)}
                    </div>
                  </div>
                )}
                {currentRvol != null && currentRvol > 0 && (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Rel. Volume</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                      {currentRvol.toFixed(1)}×
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* What may be driving the move */}
          <section className="mb-8 max-w-3xl">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
              What May Be Driving {tickerUpper}?
            </h2>
            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
              {data.moversReason ? (
                <p>{data.moversReason}</p>
              ) : (
                <p>
                  No specific catalyst has been identified in the available market data for {companyName} ({tickerUpper}).
                  {' '}The moves shown below are flagged based on statistical significance (Z-score ≥ {SIGNIFICANT_Z_THRESHOLD}),
                  {' '}meaning {tickerUpper} moved beyond its typical daily range. A catalyst may exist — such as earnings,
                  {' '}analyst action, sector momentum, or news — but has not yet been tagged to this ticker.
                </p>
              )}
              {data.sector && (
                <p>
                  {companyName} operates in the{' '}
                  <Link className="text-blue-600 dark:text-blue-400 hover:underline" href={`/sectors/${encodeURIComponent(data.sector)}`}>
                    {formatSectorName(data.sector)}
                  </Link>
                  {' '}sector{data.industry ? `, specifically ${data.industry}` : ''}. Sector-wide movement can contribute to
                  {' '}individual stock volatility.
                </p>
              )}
            </div>
          </section>

          {/* Recent unusual moves table */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Recent Unusual Moves ({LOOKBACK_DAYS} days)
            </h2>

            {moves.length > 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950">
                      <tr className="text-left text-slate-600 dark:text-slate-400">
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Session</th>
                        <th className="px-4 py-2">Price</th>
                        <th className="px-4 py-2">Move</th>
                        <th className="px-4 py-2">Z-Score</th>
                        <th className="px-4 py-2">Rel. Vol.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moves.map((m, i) => {
                        const moveUp = m.changePct >= 0;
                        return (
                          <tr key={i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60">
                            <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                              {formatDateShort(m.date)}
                            </td>
                            <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                              {formatSessionLabel(m.session)}
                            </td>
                            <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                              {formatPrice(m.lastPrice)}
                            </td>
                            <td className={`px-4 py-2 tabular-nums font-semibold ${moveUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {formatPercent(m.changePct)}
                            </td>
                            <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                              {m.zScore != null ? m.zScore.toFixed(2) : '—'}
                            </td>
                            <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                              {m.rvol != null && m.rvol > 0 ? `${m.rvol.toFixed(1)}×` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
                <p className="text-slate-500 dark:text-slate-400">
                  No significant unusual moves detected for {tickerUpper} in the last {LOOKBACK_DAYS} days.
                  {' '}This ticker has been trading within its typical statistical range.
                </p>
              </div>
            )}
          </section>

          {/* SEO content */}
          <section className="mb-8 max-w-3xl">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
              About {tickerUpper} Market Moves
            </h2>
            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
              <p>
                This page tracks unusual market activity for {companyName} ({tickerUpper}) across all trading sessions —
                {' '}pre-market (4:00 AM–9:30 AM ET), regular hours (9:30 AM–4:00 PM ET), and after-hours (4:00 PM–8:00 PM ET).
                {' '}A move is flagged as &quot;unusual&quot; when its Z-score reaches {SIGNIFICANT_Z_THRESHOLD} or higher,
                {' '}meaning the price change is statistically significant relative to {tickerUpper}&apos;s recent daily volatility.
              </p>
              <p>
                Z-score is calculated by comparing each move to the 20-day average return and standard deviation.
                {' '}A Z-score of 2.0 means the move is 2 standard deviations beyond the average — occurring in roughly
                {' '}the top 5% of daily moves. Relative volume (RVOL) compares current volume to the 20-day average
                {' '}volume at the same time of day, helping distinguish genuine institutional activity from noise.
              </p>
            </div>
          </section>

          {/* Internal linking */}
          <nav className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Explore More
            </h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                href={`/analysis/${tickerUpper}`}
              >
                {tickerUpper} Full Analysis
              </Link>
              <Link
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                href="/premarket-movers"
              >
                Today&apos;s Movers
              </Link>
              <Link
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                href="/gainers"
              >
                Top Gainers
              </Link>
              <Link
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                href="/losers"
              >
                Top Losers
              </Link>
              <Link
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                href="/heatmap"
              >
                Market Heatmap
              </Link>
              {data.sector && (
                <Link
                  className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  href={`/sectors/${encodeURIComponent(data.sector)}`}
                >
                  {formatSectorName(data.sector)} Sector
                </Link>
              )}
              <Link
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                href="/earnings"
              >
                Earnings Calendar
              </Link>
            </div>
          </nav>
        </main>
      </div>
    </>
  );
}
