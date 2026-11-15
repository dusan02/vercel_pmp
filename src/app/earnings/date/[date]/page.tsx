import { cache } from 'react';
import { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { StructuredData } from '@/components/StructuredData';
import Link from 'next/link';
import { getEarningsRange } from '@/lib/seo/earningsSSR';
import { EarningsTable, FeaturedEarningsCard } from '@/components/earnings/EarningsShared';
import { notFound } from 'next/navigation';
import { getEligibleAnalysisSet } from '@/lib/seo/eligibleTickers';

const baseUrl = 'https://premarketprice.com';

export const revalidate = 300;

// An EMPTY generateStaticParams makes this dynamic route ISR-eligible in
// Next 15/16 — without it the page stream-renders on EVERY request (no-store,
// absent from the ISR manifest). [] prerenders nothing at build; params
// render on demand and are ISR-cached for `revalidate` seconds.
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ date: string }>;
}

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

const getCachedEarningsDate = cache(async (date: string) =>
  getEarningsRange(date, date, { enrich: true }),
);

function buildEarningsDateTitle(shortDate: string, topTickers: string[], total: number): string {
  const candidates: string[] = [];
  if (topTickers.length >= 3 && total > 3) {
    candidates.push(`${topTickers.slice(0, 3).join(', ')} & ${total - 3} Earnings (${shortDate})`);
  }
  if (topTickers.length >= 2 && total > 2) {
    candidates.push(`${topTickers.slice(0, 2).join(', ')} & ${total - 2} Earnings (${shortDate})`);
  }
  if (topTickers.length >= 1 && total > 1) {
    candidates.push(`${topTickers[0]} & ${total - 1} Earnings (${shortDate})`);
  }
  if (topTickers.length > 0) {
    candidates.push(`${topTickers.slice(0, 3).join(', ')} Earnings (${shortDate})`);
  }
  candidates.push(`Earnings Calendar (${shortDate})`);
  // Strictly <= 43 chars before the 17-char " | PreMarketPrice" suffix.
  return candidates.find((c) => c.length <= 43) ?? `Earnings (${shortDate})`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params;
  if (!isValidDate(date)) return {};

  const d = new Date(date + 'T12:00:00Z');
  const dateDisplay = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const groups = await getCachedEarningsDate(date);
  const group = groups[0];
  if (!group || group.total === 0) {
    return {
      title: `Earnings for ${dateDisplay}`,
      description: `Earnings reports and announcements for ${dateDisplay}. See EPS estimates, actual results, revenue forecasts, and earnings surprises for companies reporting on this date.`,
      robots: { index: false, follow: true },
    };
  }

  const topTickers = [...group.preMarket, ...group.afterMarket, ...group.timeTbd]
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, 5)
    .map((r) => r.ticker);

  const splitParts = [
    group.preMarket.length > 0 ? `${group.preMarket.length} pre-market` : '',
    group.afterMarket.length > 0 ? `${group.afterMarket.length} after-hours` : '',
  ].filter(Boolean);
  const splitNote = splitParts.length > 0 ? ` (${splitParts.join(', ')})` : '';
  const leadNote = topTickers.length > 0 ? `, led by ${topTickers.join(', ')}` : '';
  const description = `${group.total} US ${group.total === 1 ? 'company reports' : 'companies report'} earnings on ${dateDisplay}${leadNote}${splitNote}. Track EPS estimates, revenue forecasts, and earnings surprises.`;

  return generatePageMetadata({
    title: buildEarningsDateTitle(shortDate, topTickers, group.total),
    description,
    path: `/earnings/date/${date}`,
    keywords: [
      `earnings ${date}`,
      `earnings reports ${date}`,
      `earnings calendar ${date}`,
      ...topTickers.slice(0, 3).map((t) => `${t} earnings`),
      'EPS estimates',
      'earnings announcements',
      'quarterly earnings',
    ],
  });
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default async function EarningsDatePage({ params }: PageProps) {
  const { date } = await params;
  if (!isValidDate(date)) notFound();

  const groups = await getCachedEarningsDate(date);
  const group = groups[0];

  if (!group || group.total === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center space-x-2 text-sm">
              <Link href="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Home</Link>
              <span className="text-gray-400">/</span>
              <Link href="/earnings" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Earnings</Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{date}</span>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Earnings for {formatDateDisplay(date)}
          </h1>
          <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500">
            <p className="text-lg">No earnings scheduled for this date.</p>
            <Link href="/earnings" className="mt-4 inline-block text-blue-600 dark:text-blue-400 hover:underline">
              ← Back to Earnings Calendar
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const allRows = [...group.preMarket, ...group.afterMarket, ...group.timeTbd]
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  const tableRows = allRows.slice(0, 100);
  const reportedCount = allRows.filter(r => r.hasReported).length;
  const upcomingCount = allRows.length - reportedCount;
  const eligibleAnalysis = await getEligibleAnalysisSet();

  // Daily briefing stats
  const bmoCount = group.preMarket.length;
  const amcCount = group.afterMarket.length;
  const largeCapCount = allRows.filter(r => (r.marketCap ?? 0) >= 10e9).length;
  const withEstimatesCount = allRows.filter(r => r.epsEstimate !== null).length;

  // Featured: largest by market cap among rows with estimates (fallback: largest overall)
  const withEstimates = allRows.filter(r => r.epsEstimate !== null);
  const featuredPool = withEstimates.length > 0 ? withEstimates : allRows;
  const featured = [...featuredPool]
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Breadcrumbs */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center space-x-2 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Home</Link>
            <span className="text-gray-400">/</span>
            <Link href="/earnings" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Earnings</Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">{formatDateDisplay(date)}</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Earnings for {formatDateDisplay(date)}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {group.total} earnings — {upcomingCount} upcoming, {reportedCount} already reported.
            {' '}{bmoCount > 0 && `${bmoCount} pre-market`}{bmoCount > 0 && amcCount > 0 && ' · '}{amcCount > 0 && `${amcCount} after-hours`}
            {largeCapCount > 0 && ` · ${largeCapCount} large-cap${largeCapCount > 1 ? 's' : ''} (≥$10B)`}
            {withEstimatesCount > 0 && ` · ${withEstimatesCount} with EPS estimates`}
          </p>
        </div>

        {/* Concise SSR highlights summary for fast scanning & AI citations */}
        {allRows.length > 0 && (
          <section
            aria-label="Key earnings highlights"
            className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Notable Reports on {formatDateDisplay(date)}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {allRows.slice(0, 5).map((r, idx) => {
                const slot = r.time === 'bmo' ? 'BMO' : r.time === 'amc' ? 'AMC' : 'TBD';
                const epsText = r.epsActual != null
                  ? `EPS $${r.epsActual.toFixed(2)}`
                  : r.epsEstimate != null
                    ? `Est $${r.epsEstimate.toFixed(2)}`
                    : null;
                return (
                  <span key={`hl-${r.ticker}-${r.date}`}>
                    {idx > 0 && ' · '}
                    {eligibleAnalysis.has(r.ticker) ? (
                      <Link href={`/analysis/${r.ticker}`} className="font-semibold text-slate-900 dark:text-white hover:underline">
                        {r.ticker}
                      </Link>
                    ) : (
                      <strong className="text-slate-900 dark:text-white">{r.ticker}</strong>
                    )}
                    {' '}
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ({slot}{epsText ? `, ${epsText}` : ''})
                    </span>
                  </span>
                );
              })}
            </p>
          </section>
        )}

        {/* Featured earnings — largest/most consequential reports of the day */}
        {featured.length > 0 && (featured[0]?.marketCap ?? 0) >= 1e9 && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3">
              Featured earnings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {featured.map((r) => (
                <FeaturedEarningsCard key={`feat-${r.ticker}-${r.date}`} row={r} eligible={eligibleAnalysis} />
              ))}
            </div>
          </section>
        )}

        {/* Earnings table */}
        <EarningsTable rows={tableRows} eligible={eligibleAnalysis} />

        {/* Back link */}
        <div className="mt-6">
          <Link href="/earnings" className="text-blue-600 dark:text-blue-400 hover:underline">
            ← Back to Earnings Calendar
          </Link>
        </div>
      </main>

      <StructuredData
        pageType="earnings"
        breadcrumbs={[
          { name: 'Home', url: baseUrl },
          { name: 'Earnings Calendar', url: `${baseUrl}/earnings` },
          { name: formatDateDisplay(date), url: `${baseUrl}/earnings/date/${date}` },
        ]}
      />
    </div>
  );
}
