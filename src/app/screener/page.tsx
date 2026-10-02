import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { toJsonLd } from '@/lib/seo/jsonLd';
import { LEADERBOARDS } from '@/lib/seo/leaderboards';
import StockScreener from '@/components/StockScreener';

const baseUrl = 'https://premarketprice.com';

export const revalidate = 600;

export const metadata: Metadata = generatePageMetadata({
  title: 'Stock Screener — All US Stocks',
  description:
    'Filter 1,000+ US stocks by P/E, PEG, ROE, margins, growth, dividends, debt, insider buying and our composite scores. One-click screens: Graham value, Lynch growers, GARP, dividend growth. Free, updated daily.',
  path: '/screener',
  keywords: [
    'stock screener',
    'all stocks list',
    'stock filter',
    'pe ratio screener',
    'roe screener',
    'dividend stocks screener',
    'peg ratio',
    'financial health',
    'altman z score',
    'insider buying',
    'stock analysis tool',
    'us stocks list',
  ],
});

export default async function ScreenerPage() {
  // CollectionPage + ItemList of the curated leaderboard screens (matches on-page links)
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Stock Screener — All US Stocks',
    description: 'Filter 1,000+ US stocks by financial health, profitability, valuation, Altman Z-Score, Piotroski F-Score, Beneish M-Score and sector.',
    url: `${baseUrl}/screener`,
    mainEntity: {
      '@type': 'ItemList',
      name: 'Popular stock screens',
      numberOfItems: LEADERBOARDS.length,
      itemListElement: LEADERBOARDS.map((l, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: l.h1,
        url: `${baseUrl}/screener/${l.slug}`,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(collectionSchema) }} />
      <div className="container mx-auto py-8">
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
              Beneish M-Score flags potential earnings manipulation.
            </p>
            <p className="mt-3">
              <strong>Metric filters:</strong> twenty fundamental ranges — P/E, forward P/E, P/S,
              P/B, PEG, EV/EBITDA, EV/Sales, P/FCF, ROE, ROA, gross/operating/net margin, revenue
              and EPS growth, dividend yield, payout ratio, D/E, current and quick ratio, interest
              coverage and beta — plus price, day change, market cap, sector and industry.
            </p>
            <p className="mt-3">
              <strong>Quick screens:</strong> one-tap presets for classic strategies — Graham value,
              dividend growth, Lynch fast growers, stalwarts and slow growers, GARP (PEG&nbsp;&lt;&nbsp;1),
              asset plays and insider-backed turnarounds — alongside our composite score screens.
              Signed-in users can save up to three custom filter sets for quick re-use.
            </p>
            <p className="mt-3">
              <strong>Insider activity:</strong> the screener also ranks stocks by real insider
              trading — net open-market buying and selling over 90 days (SEC Form 4 codes P/S at
              actual transaction prices), the largest single insider trades, and 14-day insider
              clusters (distinct insiders buying or selling in the same window).
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
