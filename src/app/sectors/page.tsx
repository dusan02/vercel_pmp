import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { formatSectorName } from '@/lib/utils/format';

// Keep this as a plain number literal so Next can statically analyze segment config.
// force-dynamic: CI artifact builds have no DB, so a build-time prerender would
// ship an empty "No sector data" page that ISR then serves for up to 6h
// (same class of bug as the gutted sitemap). The groupBy is cheap; render live.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = generatePageMetadata({
  title: 'Stock Sectors',
  description:
    'Browse US stocks by sector. Explore sector pages to see movers and top companies, then drill into individual tickers.',
  path: '/sectors',
  keywords: ['stock sectors', 'sectors', 'sector performance', 'market sectors', 'stocks by sector'],
});

type SectorRow = { sector: string; count: number };

// Short SSR descriptions — gives each card real text content (was thin: ~300 chars total).
const SECTOR_DESCRIPTIONS: Record<string, string> = {
  Technology: 'Software, semiconductors, cloud, and hardware companies driving digital transformation.',
  Healthcare: 'Pharma, biotech, medical devices, and health insurers — earnings and FDA catalysts.',
  'Financial Services': 'Banks, insurers, asset managers, and fintech — sensitive to rates and credit cycles.',
  'Consumer Cyclical': 'Retailers, automakers, travel, and leisure — track discretionary spending trends.',
  Industrials: 'Aerospace, machinery, logistics, and construction — a read on the economic cycle.',
  'Communication Services': 'Media, telecom, and social platforms — advertising and subscriber-driven revenue.',
  'Consumer Defensive': 'Food, beverages, and household staples — stable demand through cycles.',
  Energy: 'Oil, gas, and renewables — driven by commodity prices and OPEC+ decisions.',
  Utilities: 'Regulated power and water providers — dividend-heavy, rate-sensitive defensives.',
  'Real Estate': 'REITs and property companies — yields, occupancy, and interest-rate exposure.',
  'Basic Materials': 'Miners, chemicals, and metals — leveraged to commodity and construction demand.',
};

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
            <Link className="hover:underline" href="/screener">
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
              href={`/sectors/${encodeURIComponent(s.sector)}`}
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
                  {SECTOR_DESCRIPTIONS[s.sector] && (
                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 leading-relaxed">
                      {SECTOR_DESCRIPTIONS[s.sector]}
                    </p>
                  )}
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

        {/* SSR explainer — internal links + indexable content */}
        <section className="mt-10 max-w-3xl">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Why browse stocks by sector?
          </h2>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <p>
              Sector classification groups companies with similar business models and risk drivers.
              Stocks in the same sector tend to move together on macro news — rate decisions hit{' '}
              <Link href="/sectors/Financial%20Services" className="text-blue-600 dark:text-blue-400 hover:underline">Financial Services</Link>{' '}
              and{' '}
              <Link href="/sectors/Real%20Estate" className="text-blue-600 dark:text-blue-400 hover:underline">Real Estate</Link>{' '}
              hardest, while oil shocks concentrate in{' '}
              <Link href="/sectors/Energy" className="text-blue-600 dark:text-blue-400 hover:underline">Energy</Link>.
            </p>
            <p>
              Each sector page lists tracked tickers with links to their{' '}
              <Link href="/stocks" className="text-blue-600 dark:text-blue-400 hover:underline">stock detail pages</Link>{' '}
              including pre-market prices, valuation metrics, and financial statements. For a visual
              overview of today&apos;s sector performance, see the{' '}
              <Link href="/heatmap" className="text-blue-600 dark:text-blue-400 hover:underline">market heatmap</Link>,
              or check today&apos;s biggest movers on the{' '}
              <Link href="/premarket-movers" className="text-blue-600 dark:text-blue-400 hover:underline">pre-market movers</Link>{' '}
              page.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

