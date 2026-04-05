import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { detectSession, mapToRedisSession } from '@/lib/utils/timeUtils';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { getDateET, getManyLastWithDate, getRankedSymbols } from '@/lib/redis/ranking';

export const revalidate = 3600; // 1 hour — archive pages are less volatile

interface PageProps {
  params: Promise<{ date: string }>;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(new Date(dateStr + 'T12:00:00Z').getTime());
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params;
  if (!isValidDate(date)) {
    return { title: 'Invalid Date' };
  }
  const display = formatDateDisplay(date);
  return generatePageMetadata({
    title: `Premarket Gainers for ${display}`,
    description: `Top gaining US stocks in pre-market trading on ${display}. See which stocks surged before the opening bell — live prices, percentage changes, and sector breakdown.`,
    path: `/premarket-gainers/${date}`,
    keywords: ['premarket gainers', `premarket gainers ${date}`, 'stocks up today', 'biggest stock gainers', 'premarket movers'],
  });
}

type Row = {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number;
  changePct?: number;
};

async function getGainers(dateOverride: string, limit: number): Promise<Row[]> {
  try {
    const detected = detectSession();
    const mapped = detected === 'closed' ? 'after' : (detected as 'pre' | 'live' | 'after');
    const session = mapToRedisSession(mapped) ?? 'after';

    const symbols = await getRankedSymbols(dateOverride, session, 'chg', 'desc', 0, limit);
    const last = await getManyLastWithDate(dateOverride, session, symbols);

    return symbols.map((symbol) => {
      const d = last.get(symbol) ?? {};
      return {
        symbol,
        name: d.name,
        sector: d.sector,
        price: d.p,
        changePct: d.change_pct,
      };
    });
  } catch {
    return [];
  }
}

export default async function PremarketGainersDatePage({ params }: PageProps) {
  const { date } = await params;

  if (!isValidDate(date)) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Invalid Date</h1>
          <p className="text-slate-500">Use format: /premarket-gainers/YYYY-MM-DD</p>
          <Link href="/gainers" className="mt-4 inline-block text-blue-600 hover:underline">View today&apos;s gainers →</Link>
        </div>
      </div>
    );
  }

  const display = formatDateDisplay(date);
  const todayStr = getDateET();
  const isToday = date === todayStr;
  const rows = await getGainers(date, 50);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Premarket Gainers for {display}
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            {isToday
              ? 'Live pre-market data — updates every 60 seconds.'
              : `Historical pre-market gainers from ${display}.`}
            {rows.length > 0 && ` ${rows.length} stocks gained in pre-market trading.`}
            {rows[0] && ` Top gainer: ${rows[0].name ?? rows[0].symbol} (${rows[0].symbol}) at ${formatPercent(rows[0].changePct ?? 0)}.`}
          </p>
        </div>

        {/* SEO content */}
        <section className="mb-8 max-w-4xl">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
            Pre-Market Trading on {display}
          </h2>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
            <p>
              The pre-market session runs from 4:00 AM to 9:30 AM Eastern Time. During this window, stocks react to overnight earnings reports, economic data, analyst upgrades and downgrades, and global market developments. The gainers below represent the strongest positive movers for this date.
            </p>
            <p>
              Pre-market volume is typically lower than regular session volume, which can amplify price movements. Always consider volume context when evaluating the significance of a pre-market move. For a complete view including decliners, see{' '}
              <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/premarket-movers">
                today&apos;s full movers list
              </Link>.
            </p>
          </div>
        </section>

        {/* Data table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-2">Ticker</th>
                  <th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2">Sector</th>
                  <th className="px-4 py-2">Price</th>
                  <th className="px-4 py-2">% Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const sector = r.sector || 'Other';
                  return (
                    <tr key={r.symbol} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60">
                      <td className="px-4 py-2 font-semibold">
                        <Link className="hover:underline" href={`/stock/${r.symbol}`}>{r.symbol}</Link>
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{r.name ?? ''}</td>
                      <td className="px-4 py-2">
                        <Link className="text-slate-700 dark:text-slate-300 hover:underline" href={`/sector/${encodeURIComponent(sector)}`}>
                          {formatSectorName(sector)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">{formatPrice(r.price)}</td>
                      <td className="px-4 py-2 tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{formatPercent(r.changePct ?? 0)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                      No pre-market data available for this date. Data is available for recent trading days only.
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
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/gainers">Today&apos;s Gainers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/losers">Top Losers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/premarket-movers">All Movers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/heatmap">Market Heatmap</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/earnings">Earnings Calendar</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/stocks">All Stocks</Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
