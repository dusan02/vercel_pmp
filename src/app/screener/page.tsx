import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import StockScreener from '@/components/StockScreener';
import { prisma } from '@/lib/db/prisma';
import { formatBillions } from '@/lib/utils/format';

export const revalidate = 600;

export const metadata: Metadata = generatePageMetadata({
  title: 'Stock Screener',
  description:
    'Screen US stocks by financial health score, profitability, valuation, Altman Z-score, and sector. Filter and sort 300+ companies to find the best investment opportunities.',
  path: '/screener',
  keywords: [
    'stock screener',
    'stock filter',
    'financial health',
    'valuation score',
    'profitability score',
    'altman z score',
    'stock analysis tool',
    'investment screener',
  ],
});

async function getDefaultScreenerResults() {
  try {
    const results = await prisma.analysisCache.findMany({
      where: {
        healthScore: { not: null },
        ticker: { is: { lastMarketCap: { gt: 0 } } },
      },
      orderBy: { healthScore: 'desc' },
      take: 25,
      select: {
        healthScore: true,
        profitabilityScore: true,
        valuationScore: true,
        altmanZ: true,
        piotroskiScore: true,
        ticker: {
          select: {
            symbol: true,
            name: true,
            sector: true,
            lastPrice: true,
            lastMarketCap: true,
          },
        },
      },
    });
    return results;
  } catch {
    return [];
  }
}

export default async function ScreenerPage() {
  const defaultResults = await getDefaultScreenerResults();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Stock Screener</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300 max-w-3xl">
            Filter US stocks by financial health, profitability, valuation, and Altman Z-score.
            Click any company for a full analysis breakdown.
          </p>
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Related:{' '}
            <Link className="hover:underline" href="/stocks">
              All Stocks
            </Link>
            {' · '}
            <Link className="hover:underline" href="/heatmap">
              Heatmap
            </Link>
            {' · '}
            <Link className="hover:underline" href="/sectors">
              Sectors
            </Link>
          </div>
        </div>

        {/* SSR default results — crawlable analysis links for Googlebot */}
        {defaultResults.length > 0 && (
          <div className="mb-6 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top Stocks by Health Score</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Use filters above to refine. Click any stock for full analysis.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700">
                    <th scope="col" className="px-4 py-2 font-medium">Ticker</th>
                    <th scope="col" className="px-4 py-2 font-medium hidden sm:table-cell">Company</th>
                    <th scope="col" className="px-4 py-2 font-medium hidden md:table-cell">Sector</th>
                    <th scope="col" className="px-4 py-2 font-medium text-right">Health</th>
                    <th scope="col" className="px-4 py-2 font-medium text-right hidden md:table-cell">Profit.</th>
                    <th scope="col" className="px-4 py-2 font-medium text-right hidden md:table-cell">Valuation</th>
                    <th scope="col" className="px-4 py-2 font-medium text-right hidden lg:table-cell">Altman Z</th>
                    <th scope="col" className="px-4 py-2 font-medium text-right">Mkt Cap</th>
                  </tr>
                </thead>
                <tbody>
                  {defaultResults.map((r) => (
                    <tr key={r.ticker.symbol} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-2">
                        <Link
                          href={`/analysis/${r.ticker.symbol}`}
                          className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {r.ticker.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 hidden sm:table-cell truncate max-w-48">
                        <Link href={`/analysis/${r.ticker.symbol}`} className="hover:underline">
                          {r.ticker.name || r.ticker.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 hidden md:table-cell">{r.ticker.sector || '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-white">{r.healthScore?.toFixed(0) ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300 hidden md:table-cell">{r.profitabilityScore?.toFixed(0) ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300 hidden md:table-cell">{r.valuationScore?.toFixed(0) ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300 hidden lg:table-cell">{r.altmanZ?.toFixed(2) ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{r.ticker.lastMarketCap ? formatBillions(r.ticker.lastMarketCap) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <StockScreener />
      </div>
    </div>
  );
}
