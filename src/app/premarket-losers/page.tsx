import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { formatPercent } from '@/lib/utils/heatmapFormat';
import { getPremarketDateSummaries } from '@/lib/seo/premarketArchive';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata({
    title: 'Premarket Losers Archive — Daily History',
    description:
      'Historical archive of top pre-market losers for every trading day. Browse which stocks dropped before the opening bell on any recent date — prices, percentage changes, and sector context.',
    path: '/premarket-losers',
    keywords: ['premarket losers', 'premarket losers history', 'premarket losers archive', 'stocks down premarket', 'premarket decliners by date'],
  });
}

function formatDateDisplay(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function PremarketLosersIndexPage() {
  const summaries = await getPremarketDateSummaries(30);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Premarket Losers Archive</h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            Every trading day&apos;s biggest pre-market decliners, permanently archived by date.
            Pick a day to see which US stocks fell before the opening bell — prices,
            percentage changes, and sector breakdown.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Stocks Tracked</th>
                  <th className="px-4 py-2">Top Loser</th>
                  <th className="px-4 py-2">Links</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((d) => (
                  <tr key={d.date} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                      {formatDateDisplay(d.date)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                      {d.totalTickers}
                    </td>
                    <td className="px-4 py-2">
                      {d.topLoser ? (
                        <span className="tabular-nums">
                          <Link href={`/analysis/${d.topLoser.symbol}`} className="font-semibold text-slate-700 dark:text-slate-300 hover:underline">
                            {d.topLoser.symbol}
                          </Link>
                          <span className="ml-2 text-rose-600 dark:text-rose-400">
                            {formatPercent(d.topLoser.changePct)}
                          </span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Link href={`/premarket-losers/${d.date}`} className="text-rose-600 dark:text-rose-400 hover:underline mr-3">
                        Losers →
                      </Link>
                      <Link href={`/premarket-gainers/${d.date}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                        Gainers →
                      </Link>
                    </td>
                  </tr>
                ))}
                {summaries.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                      No archived pre-market data yet. Archives build up with each trading day.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Internal linking */}
        <nav className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Explore More</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/premarket-movers">Today&apos;s Movers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/premarket-gainers">Gainers Archive</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/losers">Session Losers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/heatmap">Market Heatmap</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/earnings">Earnings Calendar</Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
