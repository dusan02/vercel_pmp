import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import StockScreener from '@/components/StockScreener';

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

export default function ScreenerPage() {
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

        <StockScreener />
      </div>
    </div>
  );
}
