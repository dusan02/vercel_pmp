import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { getAvailablePremarketDates } from '@/lib/seo/premarketArchive';
import { prisma } from '@/lib/db/prisma';
import { getEligibleAnalysisSet } from '@/lib/seo/eligibleTickers';

export const revalidate = 3600;

const baseUrl = 'https://premarketprice.com';

type WeeklyRow = {
  symbol: string;
  name: string | undefined;
  sector: string | undefined;
  price: number | undefined;
  changePct: number | undefined;
  date: string;
};

function weekRangeLabel(dates: string[]): string {
  if (dates.length === 0) return '';
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const first = dates[dates.length - 1]!;
  const last = dates[0]!;
  return first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

async function getWeeklyRows(sort: 'asc' | 'desc', dates: string[], limit: number): Promise<WeeklyRow[]> {
  if (dates.length === 0) return [];
  try {
    const oldest = dates[dates.length - 1]!;
    const newest = dates[0]!;
    const rows = await prisma.sessionPrice.findMany({
      where: {
        session: 'pre',
        date: {
          gte: new Date(oldest + 'T00:00:00Z'),
          lte: new Date(newest + 'T23:59:59Z'),
        },
      },
      include: { ticker: { select: { name: true, sector: true } } },
      orderBy: { changePct: sort },
      take: limit,
    });
    return rows.map((r) => ({
      symbol: r.symbol,
      name: r.ticker?.name ?? undefined,
      sector: r.ticker?.sector ?? undefined,
      price: r.lastPrice ?? undefined,
      changePct: r.changePct ?? undefined,
      date: new Date(r.date).toISOString().slice(0, 10),
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const dates = await getAvailablePremarketDates(5);
  const label = weekRangeLabel(dates);
  return generatePageMetadata({
    title: `Biggest Premarket Movers This Week${label ? ` (${label})` : ''} | PreMarketPrice`,
    description:
      `Top pre-market stock gainers and losers of the trading week${label ? ` (${label})` : ''} — the largest single-day pre-market moves with dates, Z-scores, and links to daily archives.`,
    path: '/premarket-movers/weekly',
    keywords: [
      'premarket movers this week',
      'biggest premarket movers',
      'weekly premarket gainers',
      'premarket movers of the week',
      'top stock movers this week',
    ],
  });
}

export default async function WeeklyMoversPage() {
  const dates = await getAvailablePremarketDates(5);
  const [gainers, losers, eligibleAnalysis] = await Promise.all([
    getWeeklyRows('desc', dates, 30),
    getWeeklyRows('asc', dates, 30),
    getEligibleAnalysisSet(),
  ]);
  const label = weekRangeLabel(dates);

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Biggest Premarket Movers This Week — ${label}`,
    itemListElement: gainers.slice(0, 15).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${r.name ?? r.symbol} (${r.symbol})`,
      url: `${baseUrl}/premarket/${r.symbol}`,
    })),
  };

  const Table = ({ title, rows, positive }: { title: string; rows: WeeklyRow[]; positive: boolean }) => (
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
              <th className="px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.symbol}-${r.date}-${i}`} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60">
                <td className="px-4 py-2 font-semibold">
                  {eligibleAnalysis.has(r.symbol) ? (
                    <Link className="hover:underline" href={`/premarket/${r.symbol}`}>{r.symbol}</Link>
                  ) : (
                    <span>{r.symbol}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{r.name ?? ''}</td>
                <td className="px-4 py-2">
                  <Link className="text-slate-700 dark:text-slate-300 hover:underline" href={`/sectors/${encodeURIComponent(r.sector || 'Other')}`}>
                    {formatSectorName(r.sector || 'Other')}
                  </Link>
                </td>
                <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">{formatPrice(r.price)}</td>
                <td className={`px-4 py-2 tabular-nums font-semibold ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatPercent(r.changePct ?? 0)}
                </td>
                <td className="px-4 py-2">
                  <Link
                    className="text-slate-500 dark:text-slate-400 hover:underline text-xs"
                    href={`/premarket-${positive ? 'gainers' : 'losers'}/${r.date}`}
                  >
                    {new Date(r.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-4 py-6 text-slate-600 dark:text-slate-400" colSpan={6}>No data available yet this week.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Biggest Premarket Movers This Week{label ? ` (${label})` : ''}
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            The largest single-day pre-market moves across this trading week{label ? ` (${label})` : ''}.
            {' '}Each row shows the day the move happened — click the date for that day&apos;s full archive.
            {' '}For today&apos;s live ranking, see{' '}
            <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/premarket-movers">Premarket Movers</Link>.
          </p>
        </div>

        <div className="space-y-6">
          <Table title="Top Weekly Gainers" rows={gainers} positive />
          <Table title="Top Weekly Losers" rows={losers} positive={false} />
        </div>

        {dates.length > 0 && (
          <section className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Daily Archives This Week</h2>
            <div className="flex flex-wrap gap-2">
              {dates.map((d) => (
                <Link
                  key={d}
                  href={`/premarket-gainers/${d}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Link>
              ))}
            </div>
          </section>
        )}

        <nav className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Explore More</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/premarket-movers">Today&apos;s Movers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/premarket-gainers">Gainers Archive</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/premarket-losers">Losers Archive</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/gainers">Today&apos;s Gainers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/losers">Today&apos;s Losers</Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
