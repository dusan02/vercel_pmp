'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTION_DESCRIPTIONS: Record<string, string> = {
  heatmap:   'See the entire US market in one view. Color-coded tiles reveal pre-market winners and losers by sector — instantly spot where momentum is building.',
  analysis:  'Drill into any stock with valuation scores, Altman Z-Score, debt ratios, and earnings history. Data-driven insights for smarter decisions.',
  movers:    'The biggest pre-market movers ranked by % change, with z-score and relative volume to separate real momentum from noise.',
  portfolio: 'Monitor your holdings in real-time. Track pre-market price changes, total portfolio value, and daily P&L before the opening bell.',
  favorites: 'Your personal favorites list — instant pre-market price updates on the stocks that matter most to you.',
  earnings:  'Never miss a market-moving event. Earnings dates, EPS estimates, and revenue forecasts for S&P 500 companies — all in one place.',
  allStocks: 'Browse 1,000+ US stocks sorted by price, % change, market cap, and market cap diff. Search and filter by sector to find opportunities fast.',
  default:   'Real-time pre-market stock data, earnings calendar, and market analysis for US stocks. Track market movers before the bell.',
};

function resolveDescription(pathname: string): string {
  const d = SECTION_DESCRIPTIONS;
  if (pathname === '/heatmap')           return d['heatmap']   ?? d['default'] ?? '';
  if (pathname === '/earnings' || pathname.startsWith('/earnings/')) return d['earnings'] ?? d['default'] ?? '';
  if (pathname === '/stocks' || pathname.startsWith('/screener'))    return d['allStocks'] ?? d['default'] ?? '';
  if (pathname.startsWith('/analysis'))  return d['analysis']  ?? d['default'] ?? '';
  if (pathname === '/portfolio')         return d['portfolio'] ?? d['default'] ?? '';
  if (pathname === '/favorites')         return d['favorites'] ?? d['default'] ?? '';
  if (pathname === '/premarket-movers' || pathname === '/gainers' || pathname === '/losers')
                                         return d['movers']    ?? d['default'] ?? '';
  return d['default'] ?? '';
}

export function Footer() {
  const pathname = usePathname();
  const desc = resolveDescription(pathname);
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 pt-12 pb-8 mt-auto">
      {/* 96rem cap + px-4/sm:px-6 — same rhythm as PageHeader inner row and <main> */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
          {/* Brand Section */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center">
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                PreMarketPrice
              </span>
            </Link>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {desc}
            </p>
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              Market data powered by Polygon.io &amp; Finnhub · Fundamentals via SEC EDGAR XBRL.
            </p>
          </div>

          {/* Market Links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Markets
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/premarket-movers" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Premarket Movers
                </Link>
              </li>
              <li>
                <Link href="/gainers" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Top Gainers
                </Link>
              </li>
              <li>
                <Link href="/losers" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Top Losers
                </Link>
              </li>
              <li>
                <Link href="/heatmap" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Market Heatmap
                </Link>
              </li>
              <li>
                <Link href="/earnings" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Earnings Calendar
                </Link>
              </li>
              <li>
                <Link href="/sectors" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Sector Performance
                </Link>
              </li>
              <li>
                <Link href="/stocks" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  All Stocks
                </Link>
              </li>
              <li>
                <Link href="/capex-tracker" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Capex Tracker
                </Link>
              </li>
              <li>
                <Link href="/biggest-movers" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Biggest Daily Moves
                </Link>
              </li>
            </ul>
          </div>

          {/* Screeners & Views */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Screens &amp; Views
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/screener" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Stock Screener
                </Link>
              </li>
              <li>
                <Link href="/screener/early-winners" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Early Winners
                </Link>
              </li>
              <li>
                <Link href="/screener/most-undervalued" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Most Undervalued
                </Link>
              </li>
              <li>
                <Link href="/screener/highest-growth" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Highest Growth
                </Link>
              </li>
              <li>
                <Link href="/screener/insider-buying" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Insider Buying
                </Link>
              </li>
              <li>
                <Link href="/screener/quality-compounders" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Quality Compounders
                </Link>
              </li>
              <li>
                <Link href="/heatmap/pe-ratio" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  P/E Ratio Heatmap
                </Link>
              </li>
              <li>
                <Link href="/heatmap/dividend-yield" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Dividend Heatmap
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Company
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/blog" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/disclaimer" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Disclaimer
                </Link>
              </li>
              <li>
                <a href="/api/rss" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  RSS Feed
                </a>
              </li>
              <li>
                <Link href="/embed" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Widgets for your site
                </Link>
              </li>
              <li>
                <a href="https://stockcv.com" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  StockCV — company CVs
                </a>
              </li>
            </ul>
          </div>

          {/* Support Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Support
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Need help or have suggestions?
            </p>
            <ul className="space-y-2">
              <li>
                <a
                  href="mailto:support@premarketprice.com"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  support@premarketprice.com
                </a>
              </li>
              <li>
                <a
                  href="https://x.com/premarketprice"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  @premarketprice
                </a>
              </li>
              <li>
                <a
                  href="https://bsky.app/profile/premarketprice.bsky.social"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
                    <path d="M12 11.388c-.907-1.761-3.372-5.044-5.665-6.662-2.197-1.55-3.034-1.283-3.647-1.036C2.054 3.921 2 4.931 2 5.391v.252c.008 1.057.324 4.097.9 5.275.577.929 2.631 2.34 3.679 2.571-2.63.447-5.507 1.334-6.579 4.678 1.923-2.03 4.118-3.131 6.23-3.447 4.51-.675 6.769 2.082 6.769 2.082s2.259-2.757 6.769-2.082c2.112.316 4.307 1.417 6.23 3.447-1.072-3.344-3.949-4.231-6.579-4.678 1.048-.231 3.102-1.642 3.679-2.571.576-1.178.892-4.218.9-5.275v-.252c0-.46-.054-1.47-.688-1.7-.613-.247-1.45-.514-3.647 1.036C17.372 6.344 12.907 9.627 12 11.388z" />
                  </svg>
                  Bluesky
                </a>
              </li>
            </ul>
            <a
              href="https://www.producthunt.com/products/premarketprice?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-premarketprice"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="PreMarketPrice on Product Hunt"
              className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-orange-400/60 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0 text-orange-500" aria-hidden="true">
                <path d="M12 2.5l7.5 9h-4.5V21.5h-6V11.5H4.5z" />
              </svg>
              Featured on Product Hunt
            </a>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-3 bg-transparent">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            &copy; {currentYear} PreMarketPrice. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
            <Link
              href="/zh"
              hrefLang="zh-CN"
              className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              中文版
            </Link>
            <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">·</span>
            <span>
              Data provided for informational purposes only.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

