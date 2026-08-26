import { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { StructuredData } from '@/components/StructuredData';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getEarningsRange, type EarningsSSRRow, type EarningsSSRGroup } from '@/lib/seo/earningsSSR';
import { formatPercent } from '@/lib/utils/heatmapFormat';

const baseUrl = 'https://premarketprice.com';

const WeeklyEarningsCalendar = dynamic(
  () => import('@/components/WeeklyEarningsCalendar'),
  { loading: () => <div className="p-4">Loading weekly calendar...</div> }
);

export const revalidate = 300; // 5 min — SSR earnings content

export const metadata: Metadata = generatePageMetadata({
  title: 'Earnings Calendar',
  description: 'Track today\'s earnings calendar and upcoming earnings reports for S&P 500 companies. Get real-time earnings announcements, EPS estimates, and revenue forecasts. Stay ahead with comprehensive earnings data.',
  path: '/earnings',
  keywords: [
    'earnings calendar',
    'earnings reports',
    'earnings announcements',
    'EPS',
    'earnings per share',
    'quarterly earnings',
    'earnings date',
    'earnings schedule',
  ],
});

function formatEps(value: number | null): string {
  if (value == null) return '—';
  return `$${value.toFixed(2)}`;
}

function formatRevenue(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(time: string): string {
  switch (time) {
    case 'bmo': return 'Pre-Market';
    case 'amc': return 'After-Hours';
    case 'dmt': return 'During Market';
    default: return 'TBD';
  }
}

function timeColor(time: string): string {
  switch (time) {
    case 'bmo': return 'text-yellow-600 dark:text-yellow-400';
    case 'amc': return 'text-purple-600 dark:text-purple-400';
    default: return 'text-gray-500';
  }
}

function EarningsRow({ row }: { row: EarningsSSRRow }) {
  const surprise = row.epsSurprisePercent;
  const surpriseClass =
    surprise != null
      ? surprise >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400'
      : '';

  return (
    <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60">
      <td className="px-3 py-2 font-semibold">
        <Link href={`/analysis/${row.ticker}`} className="hover:underline">{row.ticker}</Link>
      </td>
      <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate">{row.companyName}</td>
      <td className={`px-3 py-2 text-xs font-medium ${timeColor(row.time)}`}>{timeLabel(row.time)}</td>
      <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">{formatEps(row.epsEstimate)}</td>
      <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
        {row.hasReported ? formatEps(row.epsActual) : '—'}
      </td>
      <td className={`px-3 py-2 tabular-nums font-semibold ${surpriseClass}`}>
        {surprise != null ? formatPercent(surprise) : '—'}
      </td>
      <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">{formatRevenue(row.revenueEstimate)}</td>
      <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
        {row.hasReported ? formatRevenue(row.revenueActual) : '—'}
      </td>
    </tr>
  );
}

function EarningsDaySection({ group }: { group: EarningsSSRGroup }) {
  if (group.total === 0) return null;
  const allRows = [...group.preMarket, ...group.afterMarket, ...group.timeTbd];

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
        {formatDateDisplay(group.date)}
        <span className="ml-2 text-sm font-normal text-slate-500">{group.total} earnings</span>
      </h3>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">EPS Est.</th>
                <th className="px-3 py-2">EPS Actual</th>
                <th className="px-3 py-2">Surprise</th>
                <th className="px-3 py-2">Rev Est.</th>
                <th className="px-3 py-2">Rev Actual</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((r) => <EarningsRow key={`${r.ticker}-${r.date}`} row={r} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default async function EarningsPage() {
  // SSR: fetch earnings for today + next 7 days
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0] ?? '';
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 7);
  const endStr = end.toISOString().split('T')[0] ?? '';

  const groups = await getEarningsRange(todayStr, endStr);
  const totalEarnings = groups.reduce((sum, g) => sum + g.total, 0);
  const reportedCount = groups.reduce(
    (sum, g) => sum + [...g.preMarket, ...g.afterMarket, ...g.timeTbd].filter((r) => r.hasReported).length,
    0,
  );
  const upcomingCount = totalEarnings - reportedCount;

  // Find notable earnings (with EPS estimates)
  const allRows = groups.flatMap((g) => [...g.preMarket, ...g.afterMarket, ...g.timeTbd]);
  const withEstimates = allRows.filter((r) => r.epsEstimate != null);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Breadcrumbs */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center space-x-2 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Home</Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Earnings Calendar</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Earnings Calendar</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Track today&apos;s earnings announcements and upcoming earnings reports
          </p>
          {totalEarnings > 0 && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {totalEarnings} earnings scheduled in the next 7 days — {upcomingCount} upcoming, {reportedCount} already reported.
              {withEstimates.length > 0 && ` ${withEstimates.length} with EPS estimates.`}
            </p>
          )}
        </div>

        {/* Interactive calendar (client-side) */}
        <div className="bg-transparent mt-6">
          <WeeklyEarningsCalendar />
        </div>

        {/* SSR earnings content — indexable by Google */}
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Earnings This Week — Detailed Schedule
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
            Earnings announcements for tracked US stocks including EPS estimates, actual results, and revenue expectations.
            Pre-market (BMO) earnings are reported before 9:30 AM ET; after-hours (AMC) earnings are reported after 4:00 PM ET.
          </p>

          {groups.map((g) => <EarningsDaySection key={g.date} group={g} />)}

          {totalEarnings === 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500">
              No earnings scheduled in the next 7 days. Check back later or browse{' '}
              <Link href="/stocks" className="text-blue-600 dark:text-blue-400 hover:underline">all tracked stocks</Link>.
            </div>
          )}
        </section>

        {/* SEO content */}
        <section className="mt-10 max-w-4xl">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
            Understanding Earnings Reports
          </h2>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
            <p>
              Earnings reports are quarterly financial statements publicly traded companies must file with the SEC.
              They include key metrics like earnings per share (EPS), revenue, and forward guidance.
              Pre-market earnings (BMO) are released before the market opens at 9:30 AM ET, while after-hours earnings (AMC)
              are released after the market closes at 4:00 PM ET.
            </p>
            <p>
              EPS surprise measures the difference between actual and estimated earnings per share, expressed as a percentage.
              A positive surprise typically leads to short-term price increases, while a negative surprise can trigger sell-offs.
              Use the{' '}
              <Link href="/screener" className="text-blue-600 dark:text-blue-400 hover:underline">stock screener</Link>{' '}
              to filter stocks by quality metrics like Piotroski F-Score and Beneish M-Score, or explore{' '}
              <Link href="/premarket-movers" className="text-blue-600 dark:text-blue-400 hover:underline">pre-market movers</Link>{' '}
              to see how earnings impact pre-market trading.
            </p>
          </div>
        </section>

        {/* Internal linking */}
        <nav className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Explore More</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/screener" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Stock Screener</Link>
            <Link href="/premarket-movers" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Pre-Market Movers</Link>
            <Link href="/gainers" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Top Gainers</Link>
            <Link href="/losers" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Top Losers</Link>
            <Link href="/heatmap" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Market Heatmap</Link>
            <Link href="/stocks" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">All Stocks</Link>
          </div>
        </nav>
      </main>

      {/* Structured Data */}
      <StructuredData
        pageType="earnings"
        breadcrumbs={[
          { name: 'Home', url: baseUrl },
          { name: 'Earnings Calendar', url: `${baseUrl}/earnings` },
        ]}
      />
    </div>
  );
}
