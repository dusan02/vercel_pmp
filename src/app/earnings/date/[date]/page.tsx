import { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { StructuredData } from '@/components/StructuredData';
import Link from 'next/link';
import { getEarningsRange, type EarningsSSRRow, type EarningsSSRGroup } from '@/lib/seo/earningsSSR';
import { formatPercent } from '@/lib/utils/heatmapFormat';
import { notFound } from 'next/navigation';

const baseUrl = 'https://premarketprice.com';

export const revalidate = 300;

interface PageProps {
  params: { date: string };
}

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = params;
  if (!isValidDate(date)) return {};

  const d = new Date(date + 'T12:00:00Z');
  const dateDisplay = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return generatePageMetadata({
    title: `Earnings for ${dateDisplay}`,
    description: `Earnings reports and announcements for ${dateDisplay}. See EPS estimates, actual results, revenue forecasts, and earnings surprises for companies reporting on this date.`,
    path: `/earnings/date/${date}`,
    keywords: [
      `earnings ${date}`,
      `earnings reports ${date}`,
      `earnings calendar ${date}`,
      'EPS estimates',
      'earnings announcements',
      'quarterly earnings',
    ],
  });
}

function formatEps(value: number | null): string {
  if (value == null) return '-';
  return `$${value.toFixed(2)}`;
}

function formatRevenue(value: number | null): string {
  if (value == null) return '-';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
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

export default async function EarningsDatePage({ params }: PageProps) {
  const { date } = params;
  if (!isValidDate(date)) notFound();

  const groups = await getEarningsRange(date, date);
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

  const allRows = [...group.preMarket, ...group.afterMarket, ...group.timeTbd];
  const reportedCount = allRows.filter(r => r.hasReported).length;
  const upcomingCount = allRows.length - reportedCount;

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
          </p>
        </div>

        {/* Earnings table */}
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
                {allRows.map((row: EarningsSSRRow) => {
                  const surprise = row.epsSurprisePercent;
                  const surpriseClass = surprise != null
                    ? surprise >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                    : '';
                  return (
                    <tr key={`${row.ticker}-${row.date}`} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60">
                      <td className="px-3 py-2 font-semibold">
                        <Link href={`/analysis/${row.ticker}`} className="hover:underline">{row.ticker}</Link>
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate">{row.companyName}</td>
                      <td className={`px-3 py-2 text-xs font-medium ${timeColor(row.time)}`}>{timeLabel(row.time)}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">{formatEps(row.epsEstimate)}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                        {row.hasReported ? formatEps(row.epsActual) : '-'}
                      </td>
                      <td className={`px-3 py-2 tabular-nums font-semibold ${surpriseClass}`}>
                        {surprise != null ? formatPercent(surprise) : '-'}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">{formatRevenue(row.revenueEstimate)}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                        {row.hasReported ? formatRevenue(row.revenueActual) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

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
