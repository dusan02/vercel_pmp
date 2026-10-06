import type { Metadata } from 'next';
import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { StandaloneHeader } from '@/components/StandaloneHeader';
import { formatSectorName } from '@/lib/utils/format';

export const revalidate = 3600;

const baseUrl = 'https://premarketprice.com';

export const metadata: Metadata = generatePageMetadata({
  title: 'Biggest Single-Day Stock Moves — Official Close Leaderboard',
  description:
    'The largest single-session stock moves measured by official regular-session closes (no after-hours noise). Citable leaderboard of the biggest daily gainers and losers.',
  path: '/biggest-movers',
});

type LeaderboardRow = {
  symbol: string;
  name: string | null;
  sector: string | null;
  date: string;
  previousClose: number;
  regularClose: number;
  changePct: number;
};

async function getLeaderboard(dir: string): Promise<{ rows: LeaderboardRow[]; since: string | null }> {
  // Official closes only: previousClose -> regularClose, both stored on the
  // DailyRef row at write time (post-close ingest). Min $5 prior close to
  // keep penny-stock noise out of the leaderboard. ORDER BY comes from a
  // static fragment per tab — tagged templates can't take dynamic direction.
  const orderFrag =
    dir === 'gainers' ? Prisma.sql`ORDER BY changePct DESC`
    : dir === 'losers' ? Prisma.sql`ORDER BY changePct ASC`
    : Prisma.sql`ORDER BY ABS(r.regularClose / r.previousClose - 1.0) DESC`;
  const rows = await prisma.$queryRaw<Array<{
    symbol: string;
    name: string | null;
    sector: string | null;
    date: Date;
    previousClose: number;
    regularClose: number;
    changePct: number;
  }>>`
    SELECT r.symbol, t.name, t.sector, r.date, r.previousClose, r.regularClose,
           (r.regularClose / r.previousClose - 1.0) * 100.0 AS changePct
    FROM DailyRef r
    JOIN Ticker t ON t.symbol = r.symbol
    WHERE r.regularClose > 0 AND r.previousClose >= 5
    ${orderFrag}
    LIMIT 60
  `;
  const first = await prisma.dailyRef.findFirst({
    where: { regularClose: { gt: 0 }, previousClose: { gt: 0 } },
    orderBy: { date: 'asc' },
    select: { date: true },
  });
  return {
    rows: rows.map((r) => ({
      ...r,
      date: new Date(r.date).toISOString().split('T')[0]!,
    })),
    since: first ? new Date(first.date).toISOString().split('T')[0]! : null,
  };
}

export default async function BiggestMoversPage({
  searchParams,
}: {
  searchParams: Promise<{ dir?: string }>;
}) {
  const { dir = 'all' } = await searchParams;
  const safeDir = ['gainers', 'losers'].includes(dir) ? dir : 'all';
  const { rows, since } = await getLeaderboard(safeDir);

  const tabs = [
    { id: 'all', label: 'Biggest moves' },
    { id: 'gainers', label: 'Gainers only' },
    { id: 'losers', label: 'Losers only' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <StandaloneHeader />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-3">
          Biggest Single-Day Stock Moves
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-1">
          Largest close-to-close moves by <strong>official regular-session closes</strong> — no
          after-hours or pre-market spikes counted.
          {since && <> Coverage since {new Date(since + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</>}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Stocks with a prior close under $5 are excluded to keep the list meaningful.
          Data refreshes daily after the official close.
        </p>

        <div className="flex gap-2 mb-6">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/biggest-movers?dir=${t.id}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                safeDir === t.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3 hidden sm:table-cell">Sector</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Close</th>
                <th className="px-4 py-3 text-right">Move</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {rows.map((r, i) => {
                const up = r.changePct >= 0;
                return (
                  <tr key={`${r.symbol}-${r.date}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2.5 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/analysis/${r.symbol}`} className="group flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/logos/${r.symbol.toLowerCase()}-32.webp`}
                          alt=""
                          width={22}
                          height={22}
                          className="h-[22px] w-[22px] rounded"
                        />
                        <span className="font-bold text-blue-600 dark:text-blue-400 group-hover:underline">
                          {r.symbol}
                        </span>
                        <span className="hidden md:inline text-gray-500 dark:text-gray-400 truncate max-w-[220px]">
                          {r.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell text-gray-500 dark:text-gray-400">
                      {r.sector ? formatSectorName(r.sector) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 tabular-nums">
                      {new Date(r.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300 tabular-nums">
                      ${r.regularClose.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {up ? '+' : ''}{r.changePct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-500">No data yet.</p>
          )}
        </div>

        <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
          Methodology: move = official regular-session close vs. previous official close, per exchange
          records. Pre-market and after-hours prints are never counted. Free to cite — link attribution
          to premarketprice.com appreciated.
        </p>

        {/* JSON-LD ItemList — makes the leaderboard machine-readable/citable */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: 'Biggest Single-Day Stock Moves',
              description:
                'Largest close-to-close stock moves measured by official regular-session closes.',
              url: `${baseUrl}/biggest-movers`,
              itemListElement: rows.slice(0, 25).map((r, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: `${r.symbol} ${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(1)}% on ${r.date}`,
                url: `${baseUrl}/analysis/${r.symbol}`,
              })),
            }),
          }}
        />
      </div>
    </div>
  );
}
