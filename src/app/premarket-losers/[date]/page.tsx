import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { detectSession, mapToRedisSession } from '@/lib/utils/timeUtils';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { getDateET, getManyLastWithDate, getRankedSymbols } from '@/lib/redis/ranking';

export const revalidate = 3600;

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
    title: `Premarket Losers for ${display}`,
    description: `Biggest pre-market losers on ${display}. See which US stocks dropped before the bell — prices, percentage declines, and sector breakdown.`,
    path: `/premarket-losers/${date}`,
    keywords: ['premarket losers', `premarket losers ${date}`, 'stocks down today', 'biggest stock losers', 'premarket drops'],
  });
}

type Row = {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number;
  changePct?: number;
};

async function getLosers(dateOverride: string, limit: number): Promise<Row[]> {
  try {
    const detected = detectSession();
    const mapped = detected === 'closed' ? 'after' : (detected as 'pre' | 'live' | 'after');
    const session = mapToRedisSession(mapped) ?? 'after';

    const symbols = await getRankedSymbols(dateOverride, session, 'chg', 'asc', 0, limit);
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

export default async function PremarketLosersDatePage({ params }: PageProps) {
  const { date } = await params;

  if (!isValidDate(date)) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Invalid Date</h1>
          <p className="text-slate-500">Use format: /premarket-losers/YYYY-MM-DD</p>
          <Link href="/losers" className="mt-4 inline-block text-blue-600 hover:underline">View today&apos;s losers →</Link>
        </div>
      </div>
    );
  }

  const display = formatDateDisplay(date);
  const todayStr = getDateET();
  const isToday = date === todayStr;
  const rows = await getLosers(date, 50);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Premarket Losers for {display}
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            {isToday
              ? 'Live pre-market data — updates every 60 seconds.'
              : `Historical pre-market losers from ${display}.`}
            {rows.length > 0 && ` ${rows.length} stocks declined in pre-market trading.`}
            {rows[0] && ` Biggest decliner: ${rows[0].name ?? rows[0].symbol} (${rows[0].symbol}) at ${formatPercent(rows[0].changePct ?? 0)}.`}
          </p>
        </div>

        {/* SEO content */}
        <section className="mb-8 max-w-4xl">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
            Pre-Market Decliners on {display}
          </h2>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
            <p>
              Pre-market losers are stocks experiencing the largest price drops between 4:00 AM and 9:30 AM ET. These moves are often triggered by earnings misses, guidance cuts, analyst downgrades, or negative macro developments. Low pre-market volume can amplify these moves beyond what regular-session trading would produce.
            </p>
            <p>
              Significant pre-market declines can present either warning signs or buying opportunities depending on the catalyst. Cross-reference with the{' '}
              <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/earnings">earnings calendar</Link>{' '}
              and individual <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/stocks">stock analysis pages</Link> for deeper context.
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
                      <td className="px-4 py-2 tabular-nums font-semibold text-rose-600 dark:text-rose-400">{formatPercent(r.changePct ?? 0)}</td>
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
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/losers">Today&apos;s Losers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/gainers">Top Gainers</Link>
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
