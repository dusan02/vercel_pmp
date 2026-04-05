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
    title: `Top Premarket Gainers Today (${today})`,
    description:
      `Top gaining US stocks in pre-market trading for ${today}. See which stocks are surging before the opening bell — live prices, percentage changes, market cap moves, and sector breakdown.`,
    path: '/gainers',
    keywords: ['top gainers', 'premarket gainers today', 'stocks up today', 'biggest stock gainers today', 'premarket movers', 'stocks moving premarket'],
  });
}

type Row = {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number;
  changePct?: number;
  marketCapDiff?: number;
};

async function getRows(limit: number): Promise<Row[]> {
  const detected = detectSession();
  const mapped =
    detected === 'closed' ? 'after' : (detected as 'pre' | 'live' | 'after');
  const session = mapToRedisSession(mapped) ?? 'after';
  const date = getDateET();

  const symbols = await getRankedSymbols(date, session, 'chg', 'desc', 0, limit);
  const last = await getManyLastWithDate(date, session, symbols);

  return symbols.map((symbol) => {
    const d = last.get(symbol) ?? {};
    return {
      symbol,
      name: d.name,
      sector: d.sector,
      price: d.p,
      changePct: d.change_pct,
      marketCapDiff: d.cap_diff,
    };
  });
}

export default async function GainersPage() {
  const rows = await getRows(100);
  const today = getTodayFormatted();
  const topGainer = rows[0];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Top Premarket Gainers Today ({today})
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            The strongest movers by percentage change for the current market session.
            {topGainer && ` Leading today's gainers is ${topGainer.name ?? topGainer.symbol} (${topGainer.symbol}), up ${formatPercent(topGainer.changePct ?? 0)} in pre-market trading.`}
            {' '}For the full two-sided view including losers, use{' '}
            <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/premarket-movers">
              Premarket Movers
            </Link>.
          </p>
        </div>

        {/* SEO Content: What is premarket trading */}
        <section className="mb-8 max-w-4xl">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">What Are Premarket Gainers?</h2>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
            <p>
              Premarket gainers are stocks that show the largest positive price movements during the pre-market trading session, which runs from 4:00 AM to 9:30 AM Eastern Time before the regular market opens. These early moves often signal important developments — earnings beats, analyst upgrades, sector momentum, or breaking news that shifts investor sentiment.
            </p>
            <p>
              Tracking premarket gainers gives traders a head start on the trading day. Stocks that gap up significantly in pre-market often continue their momentum into the regular session, though low pre-market volume can also lead to reversals. Use the Z-Score and relative volume columns on our <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/premarket-movers">Movers page</Link> to distinguish genuine momentum from noise.
            </p>
            <p>
              This page updates every 60 seconds with real-time data from US exchanges (NYSE, NASDAQ). Each ticker links to a detailed <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/stocks">stock page</Link> with comprehensive analysis, valuation scores, and earnings history. Check the <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/heatmap">Market Heatmap</Link> for a visual overview of sector performance.
            </p>
          </div>
        </section>

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
                  <th className="px-4 py-2">MCap Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = r.changePct ?? 0;
                  const sector = r.sector || 'Other';
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
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{r.name ?? ''}</td>
                      <td className="px-4 py-2">
                        <Link
                          className="text-slate-700 dark:text-slate-300 hover:underline"
                          href={`/sector/${encodeURIComponent(sector)}`}
                        >
                          {formatSectorName(sector)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                        {formatPrice(r.price)}
                      </td>
                      <td className="px-4 py-2 tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatPercent(pct)}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                        {formatMarketCapDiff(r.marketCapDiff)}
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-slate-600 dark:text-slate-400" colSpan={6}>
                      No data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Internal linking section */}
        <nav className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Explore More</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/losers">Top Losers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/premarket-movers">All Movers</Link>
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

