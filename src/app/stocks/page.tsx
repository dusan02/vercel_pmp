import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { getEligibleAnalysisTickers } from '@/lib/seo/eligibleTickers';
import { getEligibleValuationTickers } from '@/lib/seo/eligibleValuation';

export const revalidate = 3600; // 1 hour

export const metadata: Metadata = generatePageMetadata({
  title: 'All Stocks — US Stock List',
  description:
    'Browse all US stocks covered by PreMarketPrice. Filter by sector, sort by market cap, and access stock analysis, valuation, and price movement pages for each ticker.',
  path: '/stocks',
  keywords: [
    'all stocks',
    'US stock list',
    'stock screener',
    'NYSE stocks',
    'NASDAQ stocks',
    'stocks by sector',
    'stock market list',
  ],
});

interface StockRow {
  symbol: string;
  name: string;
  sector: string | null;
  lastPrice: number | null;
  lastChangePct: number | null;
  lastMarketCap: number | null;
  healthScore: number | null;
  valuationScore: number | null;
  hasValuation: boolean;
}

async function getAllStocks(industryFilter?: string): Promise<StockRow[]> {
  const eligibleAnalysis = new Set(await getEligibleAnalysisTickers());
  const eligibleValuation = new Set(await getEligibleValuationTickers());

  const tickers = await prisma.ticker.findMany({
    where: {
      symbol: { in: [...eligibleAnalysis] },
      lastPrice: { gt: 0 },
      ...(industryFilter ? { industry: industryFilter } : {}),
    },
    select: {
      symbol: true,
      name: true,
      sector: true,
      lastPrice: true,
      lastChangePct: true,
      lastMarketCap: true,
      analysisCache: {
        select: {
          healthScore: true,
          valuationScore: true,
        },
      },
    },
  });

  return tickers
    .map((t) => ({
      symbol: t.symbol,
      name: t.name || t.symbol,
      sector: t.sector,
      lastPrice: t.lastPrice,
      lastChangePct: t.lastChangePct,
      lastMarketCap: t.lastMarketCap,
      healthScore: t.analysisCache?.healthScore ?? null,
      valuationScore: t.analysisCache?.valuationScore ?? null,
      hasValuation: eligibleValuation.has(t.symbol),
    }))
    .sort((a, b) => (b.lastMarketCap ?? 0) - (a.lastMarketCap ?? 0));
}

function formatMarketCap(value: number | null): string {
  if (value == null || value <= 0) return '—';
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  if (value >= 1) return `$${value.toFixed(1)}B`;
  return `$${(value * 1000).toFixed(0)}M`;
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-gray-400';
  if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

interface StocksPageProps {
  searchParams: Promise<{ industry?: string; sector?: string }>;
}

export default async function StocksHubPage({ searchParams }: StocksPageProps) {
  const { industry: industryParam, sector: sectorParam } = await searchParams;
  const industryFilter = industryParam ? decodeURIComponent(industryParam) : undefined;
  const sectorFilter = sectorParam ? decodeURIComponent(sectorParam) : undefined;

  let stocks = await getAllStocks(industryFilter);

  // Additional client-side sector filter (if sector param present and no industry filter)
  if (sectorFilter && !industryFilter) {
    stocks = stocks.filter(s => s.sector === sectorFilter);
  }

  // Group by sector for sector filter chips
  const sectorCounts = new Map<string, number>();
  for (const s of stocks) {
    const sector = s.sector || 'Other';
    sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1);
  }
  const sectors = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1]);

  // ItemList schema for SEO
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'US Stocks Covered by PreMarketPrice',
    numberOfItems: stocks.length,
    itemListElement: stocks.slice(0, 50).map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${s.name} (${s.symbol})`,
      url: `https://premarketprice.com/analysis/${s.symbol}`,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />

      <div className="min-h-screen bg-white dark:bg-slate-900">
        <div className="container mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              {industryFilter || sectorFilter ? `${industryFilter || sectorFilter} Stocks` : 'All Stocks'}
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-300 max-w-3xl">
              {(industryFilter || sectorFilter)
                ? `Showing ${stocks.length} ${industryFilter ? `stocks in the ${industryFilter} industry` : `stocks in the ${sectorFilter} sector`}. Each ticker links to detailed analysis.`
                : <>Browse all {stocks.length} US stocks covered by PreMarketPrice. Each ticker links to detailed stock analysis, historical valuation, and market movement pages.</>}
            </p>
            {(industryFilter || sectorFilter) && (
              <div className="mt-3">
                <Link
                  href="/stocks"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  ← Back to All Stocks
                </Link>
              </div>
            )}
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Related:{' '}
              <Link className="hover:underline" href="/premarket-movers">Premarket Movers</Link>
              {' · '}
              <Link className="hover:underline" href="/sectors">Sectors</Link>
              {' · '}
              <Link className="hover:underline" href="/gainers">Top Gainers</Link>
              {' · '}
              <Link className="hover:underline" href="/losers">Top Losers</Link>
              {' · '}
              <Link className="hover:underline" href="/heatmap">Heatmap</Link>
            </div>
          </div>

          {/* Sector filter chips — server-rendered links to sector pages */}
          <div className="mb-6 flex flex-wrap gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400 py-1">Filter by sector:</span>
            {sectors.map(([sector, count]) => (
              <Link
                key={sector}
                href={`/sectors/${encodeURIComponent(sector)}`}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {sector} <span className="ml-1 text-slate-400">({count})</span>
              </Link>
            ))}
          </div>

          {/* Stocks table — server-rendered, sortable by market cap */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 text-left font-semibold text-slate-700 dark:text-slate-300">#</th>
                  <th className="py-3 px-4 text-left font-semibold text-slate-700 dark:text-slate-300">Ticker</th>
                  <th className="py-3 px-4 text-left font-semibold text-slate-700 dark:text-slate-300">Company</th>
                  <th className="py-3 px-4 text-left font-semibold text-slate-700 dark:text-slate-300">Sector</th>
                  <th className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">Price</th>
                  <th className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">Market Cap</th>
                  <th className="py-3 px-4 text-center font-semibold text-slate-700 dark:text-slate-300">Health</th>
                  <th className="py-3 px-4 text-center font-semibold text-slate-700 dark:text-slate-300">Valuation</th>
                  <th className="py-3 px-4 text-center font-semibold text-slate-700 dark:text-slate-300">Links</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((s, i) => (
                  <tr
                    key={s.symbol}
                    className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                  >
                    <td className="py-2 px-4 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="py-2 px-4">
                      <Link
                        href={`/analysis/${s.symbol}`}
                        className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {s.symbol}
                      </Link>
                    </td>
                    <td className="py-2 px-4 text-slate-700 dark:text-slate-300 max-w-xs truncate">
                      {s.name}
                    </td>
                    <td className="py-2 px-4 text-slate-600 dark:text-slate-400 text-xs">
                      {s.sector ? (
                        <Link href={`/sectors/${encodeURIComponent(s.sector)}`} className="hover:underline">
                          {s.sector}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {s.lastPrice != null ? `$${s.lastPrice.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMarketCap(s.lastMarketCap)}
                    </td>
                    <td className={`py-2 px-4 text-center tabular-nums font-semibold ${scoreColor(s.healthScore)}`}>
                      {s.healthScore != null ? `${s.healthScore.toFixed(0)}` : '—'}
                    </td>
                    <td className={`py-2 px-4 text-center tabular-nums font-semibold ${scoreColor(s.valuationScore)}`}>
                      {s.valuationScore != null ? `${s.valuationScore.toFixed(0)}` : '—'}
                    </td>
                    <td className="py-2 px-4 text-center text-xs whitespace-nowrap">
                      <Link
                        href={`/analysis/${s.symbol}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Analysis
                      </Link>
                      {s.hasValuation && (
                        <>
                          {' · '}
                          <Link
                            href={`/valuation/${s.symbol}`}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Valuation
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary stats */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{stocks.length}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Total Stocks</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {stocks.filter((s) => s.hasValuation).length}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">With Valuation Pages</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{sectors.length}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Sectors</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {stocks.filter((s) => s.healthScore != null && s.healthScore >= 75).length}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Strong Health Score</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
