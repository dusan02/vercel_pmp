import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { formatMarketCapDiff, formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';

export const revalidate = 10 * 60; // 10 minutes

type PageProps = { params: Promise<{ sector: string }> };

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sector } = await params;
  const sectorName = safeDecode(sector);

  return generatePageMetadata({
    title: `${formatSectorName(sectorName)} Sector`,
    description: `Explore ${sectorName} stocks: top movers, market cap changes, and the biggest companies in the sector. Click any ticker for a full company view.`,
    path: `/sector/${encodeURIComponent(sectorName)}`,
    keywords: ['sector', 'stocks', sectorName, `${sectorName} stocks`, `${sectorName} sector`],
  });
}

export default async function SectorPage({ params }: PageProps) {
  const { sector } = await params;
  const sectorName = safeDecode(sector).trim();
  if (!sectorName) notFound();

  const tickers = await prisma.ticker.findMany({
    where: {
      sector: sectorName,
      lastPrice: { gt: 0 },
    },
    orderBy: [{ lastChangePct: 'desc' }, { lastMarketCap: 'desc' }],
    take: 150,
    select: {
      symbol: true,
      name: true,
      industry: true,
      lastPrice: true,
      lastChangePct: true,
      lastMarketCapDiff: true,
    },
  });

  // If sector doesn't exist in DB, show 404
  if (tickers.length === 0) notFound();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            <Link className="hover:underline" href="/sectors">
              Sectors
            </Link>
            {' / '}
            <span className="text-slate-900 dark:text-slate-200 font-medium">
              {formatSectorName(sectorName)}
            </span>
          </div>

          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {formatSectorName(sectorName)} Sector Stocks
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300 max-w-3xl">
            Browse tickers in {sectorName}. This page is optimized for search and fast discovery.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-2">Ticker</th>
                  <th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2">Industry</th>
                  <th className="px-4 py-2">Price</th>
                  <th className="px-4 py-2">% Change</th>
                  <th className="px-4 py-2">MCap Δ</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((t) => {
                  const pct = t.lastChangePct ?? 0;
                  const color =
                    pct > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : pct < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-600 dark:text-slate-400';
                  return (
                    <tr
                      key={t.symbol}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60"
                    >
                      <td className="px-4 py-2 font-semibold">
                        <Link className="hover:underline" href={`/company/${t.symbol}`}>
                          {t.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.name ?? ''}</td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.industry ?? ''}</td>
                      <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                        {formatPrice(t.lastPrice ?? 0)}
                      </td>
                      <td className={`px-4 py-2 tabular-nums font-semibold ${color}`}>
                        {formatPercent(pct)}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                        {formatMarketCapDiff(t.lastMarketCapDiff ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

