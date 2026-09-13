import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { getDateET } from '@/lib/redis/ranking';
import { getUnusualVolumeStocks, type PremarketArchiveRow } from '@/lib/seo/premarketArchive';
import { getEligibleAnalysisSet } from '@/lib/seo/eligibleTickers';

export const revalidate = 300; // 5 minutes — live-ish data

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export const metadata = generatePageMetadata({
  title: 'Unusual Volume Stocks Today (Pre-Market)',
  description:
    'US stocks trading on unusually high pre-market volume today. Relative volume (RVOL) compares traded volume against the typical volume for this time of day — spikes often precede big moves. Updated continuously.',
  path: '/unusual-volume',
  keywords: [
    'unusual volume stocks',
    'unusual volume today',
    'high volume stocks premarket',
    'relative volume stocks',
    'unusual options activity',
    'premarket volume leaders',
  ],
});

export default async function UnusualVolumePage() {
  const todayStr = getDateET();
  const display = new Date(todayStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const rows = await getUnusualVolumeStocks(todayStr, 2, 50);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Unusual Volume Stocks Today (Pre-Market)
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            Stocks trading on unusually high pre-market volume right now. Relative volume (RVOL)
            compares traded volume against the typical volume for this time of day — an RVOL of 3×
            means three times the normal activity. Unusual volume often precedes catalysts:
            news, earnings, or institutional positioning. Sorted by RVOL, updated every 60 seconds.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Symbol</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">Company</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">Sector</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider">Price</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider">Change</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider">Rel. Volume</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">Z-Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.symbol} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Link
                        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        href={`/analysis/${r.symbol}`}
                      >
                        {r.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{r.name ?? ''}</td>
                    <td className="px-4 py-2">
                      <Link className="text-slate-700 dark:text-slate-300 hover:underline" href={`/sectors/${encodeURIComponent(r.sector ?? '')}`}>
                        {r.sector}
                      </Link>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">{formatPrice(r.price ?? undefined)}</td>
                    <td className={`px-4 py-2 tabular-nums font-semibold ${(r.changePct ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatPercent(r.changePct ?? 0)}
                    </td>
                    <td className="px-4 py-2 tabular-nums font-semibold text-slate-900 dark:text-white">
                      {r.rvol != null ? `${r.rvol.toFixed(1)}×` : '—'}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-slate-600 dark:text-slate-400">{r.zScore != null ? r.zScore.toFixed(2) : '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                      No unusual pre-market volume detected right now. Volume anomalies appear during the pre-market session (4:00 AM – 9:30 AM ET) — check back when the session is active.
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
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/premarket-movers">All Premarket Movers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/gainers">Today&apos;s Gainers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/losers">Top Losers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/screener">Stock Screener</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/heatmap">Market Heatmap</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/earnings">Earnings Calendar</Link>
          </div>
        </nav>

        {/* SEO text */}
        <div className="mt-10 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">What is unusual volume in pre-market trading?</h2>
          <div className="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed">
            <p>
              Relative volume (RVOL) compares how many shares have traded so far against the typical
              volume for this exact time of day, based on each stock&apos;s own 20-day volume profile.
              An RVOL of 3.0 means the stock has already traded three times its normal volume for
              this point in the session.
            </p>
            <p className="mt-3">
              Unusual pre-market volume often precedes significant price moves: institutional
              accumulation, earnings anticipation, or news leaks. A stock up 4 % on 5× normal volume
              carries very different signal weight than the same move on thin volume — that is why we
              rank by RVOL, not just percentage change. Combine it with the{' '}
              <Link href="/premarket-movers" className="text-blue-600 dark:text-blue-400 hover:underline">z-score on our movers page</Link>{' '}
              to separate statistically significant moves from noise.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
