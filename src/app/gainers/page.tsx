import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { detectSession, mapToRedisSession } from '@/lib/utils/timeUtils';
import { formatMarketCapDiff, formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { getDateET, getManyLastWithDate, getRankedSymbols } from '@/lib/redis/ranking';

export const revalidate = 60;

export const metadata: Metadata = generatePageMetadata({
  title: 'Top Gainers',
  description:
    'Top gaining US stocks by percentage change. Browse real-time gainers and click through to company pages for full details.',
  path: '/gainers',
  keywords: ['top gainers', 'stock gainers', 'premarket gainers', 'market movers'],
});

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

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Top Gainers</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300 max-w-3xl">
            The strongest movers by percentage change for the current market session. For the full
            two-sided view, use{' '}
            <Link className="hover:underline" href="/premarket-movers">
              Premarket Movers
            </Link>
            .
          </p>
        </div>

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
                        <Link className="hover:underline" href={`/company/${r.symbol}`}>
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

        <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          Related:{' '}
          <Link className="hover:underline" href="/losers">
            Losers
          </Link>
          {' · '}
          <Link className="hover:underline" href="/sectors">
            Sectors
          </Link>
          {' · '}
          <Link className="hover:underline" href="/stocks">
            All Stocks
          </Link>
        </div>
      </div>
    </div>
  );
}

