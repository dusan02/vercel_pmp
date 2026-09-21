import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { LEADERBOARDS } from '@/lib/seo/leaderboards';
import StockScreener from '@/components/StockScreener';

export const revalidate = 600;

export const metadata: Metadata = generatePageMetadata({
  title: 'Stock Screener — All US Stocks',
  description:
    'Browse all US stocks and filter by financial health score, profitability, valuation, Altman Z-score, Piotroski F-Score, Beneish M-Score, FCF margin, debt and sector. Search 1,000+ companies and find the best investment opportunities.',
  path: '/screener',
  keywords: [
    'stock screener',
    'all stocks list',
    'stock filter',
    'financial health',
    'valuation score',
    'profitability score',
    'altman z score',
    'stock analysis tool',
    'investment screener',
    'us stocks list',
  ],
});

export default async function ScreenerPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="container-screener mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Stock Screener — All US Stocks</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300 max-w-3xl">
            Browse the full list of 1,000+ US stocks or filter by financial health, profitability,
            valuation, Altman Z-score, Piotroski F-Score, Beneish M-Score, FCF margin, debt and sector.
            Click any company for a full analysis breakdown.
          </p>
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Related:{' '}
            <Link className="hover:underline" href="/heatmap">
              Heatmap
            </Link>
            {' · '}
            <Link className="hover:underline" href="/sectors">
              Sectors
            </Link>
            {' · '}
            <Link className="hover:underline" href="/unusual-volume">
              Unusual Volume
            </Link>
            {' · '}
            <Link className="hover:underline" href="/earnings">
              Earnings Calendar
            </Link>
          </div>
        </div>

<StockScreener />

        {/* Curated leaderboard screens — internal links for the SEO pages */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Popular stock screens</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {LEADERBOARDS.map((l) => (
              <Link
                key={l.slug}
                href={`/screener/${l.slug}`}
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {l.h1}
              </Link>
            ))}
          </div>
        </div>

        {/* SEO text — covers both the screener and the all-stocks-list intent */}
        <div className="mt-10 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Stock screener — filter all US stocks by fundamentals</h2>
          <div className="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed">
            <p>
              This screener covers the complete PreMarketPrice universe — 1,000+ US-listed companies
              with live pre-market and regular-session prices. By default it shows the full stock
              list sorted by market capitalization; use the filters to narrow it down to exactly
              the companies you want to research.
            </p>
            <p className="mt-3">
              <strong>Fundamental filters:</strong> the financial health score (0–100) combines
              profitability, debt levels, margin stability and growth; the valuation score compares
              each company&apos;s P/E and P/S against its own 5-year history; the Altman Z-Score
              estimates bankruptcy risk; the Piotroski F-Score measures financial strength; and the
              Beneish M-Score flags potential earnings manipulation. Combine them with sector,
              industry and market-cap filters to build precisely the favorites list you need.
            </p>
            <p className="mt-3">
              Every stock links to a full analysis page with pre-market prices, intraday charts,
              earnings history and analyst consensus. Data refreshes continuously during the
              pre-market session (4:00 AM – 9:30 AM ET) and regular trading hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
