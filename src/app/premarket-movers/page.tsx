import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { detectSession, mapToRedisSession } from '@/lib/utils/timeUtils';
import { formatMarketCapDiff, formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { getDateET, getManyLastWithDate, getRankedSymbols } from '@/lib/redis/ranking';

export const revalidate = 60;

function getTodayFormatted(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export async function generateMetadata(): Promise<Metadata> {
  const today = getTodayFormatted();
  return generatePageMetadata({
    title: `Stocks Moving in Premarket Today (${today})`,
    description:
      `Biggest pre-market stock movers for ${today} — top gainers and losers ranked by % change with Z-scores and momentum insights. Real-time data from NYSE & NASDAQ.`,
    path: '/premarket-movers',
    keywords: ['premarket movers', 'stocks moving today', 'premarket gainers and losers', 'stock movers today', 'biggest stock movers premarket', 'stocks moving premarket'],
  });
}

type MoverRow = {
  symbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  price?: number;
  changePct?: number;
  marketCapDiff?: number;
  zscore?: number;
  rvol?: number;
  reason?: string;
  category?: string;
};

async function getTopMovers(order: 'asc' | 'desc', limit: number): Promise<MoverRow[]> {
  const detected = detectSession();
  const mapped =
    detected === 'closed' ? 'after' : (detected as 'pre' | 'live' | 'after');
  const session = mapToRedisSession(mapped) ?? 'after';
  const date = getDateET();

  const symbols = await getRankedSymbols(date, session, 'chg', order, 0, limit);
  const last = await getManyLastWithDate(date, session, symbols);

  return symbols.map((symbol) => {
    const d = last.get(symbol) ?? {};
    return {
      symbol,
      name: d.name,
      sector: d.sector,
      industry: d.industry,
      price: d.p,
      changePct: d.change_pct,
      marketCapDiff: d.cap_diff,
      zscore: d.z,
      rvol: d.v,
      reason: d.reason,
      category: d.cat
    };
  });
}

function MoversTable({ title, rows }: { title: string; rows: MoverRow[] }) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr className="text-left text-slate-600 dark:text-slate-400">
              <th className="px-4 py-2">Ticker</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Sector</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">% Change</th>
              <th className="px-4 py-2 text-center">Score (Z)</th>
              <th className="px-4 py-2">Insight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.changePct ?? 0;
              const color =
                pct > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : pct < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600 dark:text-slate-400';

              const sector = r.sector || 'Other';
              const sectorHref = `/sector/${encodeURIComponent(sector)}`;

              return (
                <tr
                  key={r.symbol}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60"
                >
                  <td className="px-4 py-2 font-semibold">
                    <Link className="hover:underline" href={`/stock/${r.symbol}`}>
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                    {r.name ?? ''}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      className="text-slate-700 dark:text-slate-300 hover:underline"
                      href={sectorHref}
                    >
                      {formatSectorName(sector)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                    {formatPrice(r.price)}
                  </td>
                  <td className={`px-4 py-2 tabular-nums font-semibold ${color}`}>
                    {formatPercent(pct)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${Math.abs(r.zscore || 0) > 2.5 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-slate-500'}`}>
                      {r.zscore?.toFixed(1) || '0.0'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.reason ? (
                      <div className="max-w-[200px] truncate" title={r.reason}>
                        <span className="font-bold opacity-50 mr-1">{r.category}:</span>
                        {r.reason}
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">Analyzing...</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-600 dark:text-slate-400" colSpan={6}>
                  No data available yet. (Redis rank indexes may still be warming up.)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function PremarketMoversPage() {
  const [gainers, losers] = await Promise.all([getTopMovers('desc', 50), getTopMovers('asc', 50)]);
  const today = getTodayFormatted();
  const topGainer = gainers[0];
  const topLoser = losers[0];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Stocks Moving in Premarket Today ({today})
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            The biggest pre-market movers ranked by percentage change.
            {topGainer && ` Top gainer: ${topGainer.name ?? topGainer.symbol} (${topGainer.symbol}) at ${formatPercent(topGainer.changePct ?? 0)}.`}
            {topLoser && ` Biggest decliner: ${topLoser.name ?? topLoser.symbol} (${topLoser.symbol}) at ${formatPercent(topLoser.changePct ?? 0)}.`}
          </p>
        </div>

        {/* SEO Content: Understanding premarket movers */}
        <section className="mb-8 max-w-4xl">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">Understanding Premarket Stock Movers</h2>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
            <p>
              Pre-market trading occurs between 4:00 AM and 9:30 AM Eastern Time, before the regular US stock market session opens. During this window, stocks can move significantly in response to overnight news, earnings announcements, economic data releases, and global market developments. The movers listed below represent the most actively changing stocks across NYSE and NASDAQ.
            </p>
            <p>
              The <strong>Z-Score</strong> column measures how unusual each stock's move is relative to its recent history — a Z-Score above 2.5 indicates a statistically significant deviation. The <strong>Insight</strong> column provides context on why each stock is moving, drawn from earnings reports, analyst actions, and news catalysts.
            </p>
            <p>
              Use this page alongside the <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/heatmap">Market Heatmap</Link> for sector-level context, or dive into individual <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/stocks">stock pages</Link> for comprehensive analysis including valuation scores and financial health metrics. Check the <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/earnings">Earnings Calendar</Link> to see if today's movers are earnings-related.
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MoversTable title="Top Gainers" rows={gainers} />
          <MoversTable title="Top Losers" rows={losers} />
        </div>

        {/* Internal linking */}
        <nav className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Explore More</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/gainers">Top Gainers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/losers">Top Losers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/heatmap">Market Heatmap</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/sectors">Sectors</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/earnings">Earnings Calendar</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/stocks">All Stocks</Link>
          </div>
        </nav>
      </div>
    </div>
  );
}

