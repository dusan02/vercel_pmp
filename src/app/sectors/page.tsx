import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { formatSectorName } from '@/lib/utils/format';

export const revalidate = 6 * 60 * 60; // 6 hours

export const metadata: Metadata = generatePageMetadata({
  title: 'Stock Sectors',
  description:
    'Browse US stocks by sector. Explore sector pages to see movers and top companies, then drill into individual tickers.',
  path: '/sectors',
  keywords: ['stock sectors', 'sectors', 'sector performance', 'market sectors', 'stocks by sector'],
});

type SectorRow = { sector: string; count: number };

async function getSectorCounts(): Promise<SectorRow[]> {
  const groups = await prisma.ticker.groupBy({
    by: ['sector'],
    where: { lastPrice: { gt: 0 } },
    _count: { _all: true },
  });

  const rows: SectorRow[] = groups.map((g) => ({
    sector: (g.sector ?? 'Other').trim() || 'Other',
    count: g._count._all,
  }));

  // Merge duplicates caused by null -> "Other" mapping
  const merged = new Map<string, number>();
  for (const r of rows) merged.set(r.sector, (merged.get(r.sector) ?? 0) + r.count);

  return Array.from(merged.entries())
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count);
}

export default async function SectorsPage() {
  const sectors = await getSectorCounts();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Sectors</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300 max-w-3xl">
            Sector pages make it easy to find movers and compare groups of companies. Click a sector
            to see top tickers and performance snapshots.
          </p>
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Related:{' '}
            <Link className="hover:underline" href="/premarket-movers">
              Premarket Movers
            </Link>
            {' · '}
            <Link className="hover:underline" href="/stocks">
              All Stocks
            </Link>
            {' · '}
            <Link className="hover:underline" href="/heatmap">
              Heatmap
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectors.map((s) => (
            <Link
              key={s.sector}
              href={`/sector/${encodeURIComponent(s.sector)}`}
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:underline">
                    {formatSectorName(s.sector)}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {s.count.toLocaleString('en-US')} tickers
                  </div>
                </div>
                <div className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                  →
                </div>
              </div>
            </Link>
          ))}

          {sectors.length === 0 && (
            <div className="text-slate-600 dark:text-slate-400">
              No sector data available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

