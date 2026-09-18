'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const SECTION_DESCRIPTIONS: Record<string, string> = {
  heatmap:   'See the entire US market in one view. Color-coded tiles reveal pre-market winners and losers by sector — instantly spot where momentum is building.',
  analysis:  'Drill into any stock with valuation scores, Altman Z-Score, debt ratios, and earnings history. Data-driven insights for smarter decisions.',
  movers:    'The biggest pre-market movers ranked by % change, with z-score and relative volume to separate real momentum from noise.',
  portfolio: 'Monitor your holdings in real-time. Track pre-market price changes, total portfolio value, and daily P&L before the opening bell.',
  favorites: 'Your personal favorites list — instant pre-market price updates on the stocks that matter most to you.',
  earnings:  'Never miss a market-moving event. Earnings dates, EPS estimates, and revenue forecasts for S&P 500 companies — all in one place.',
  allStocks: 'Browse 600+ US stocks sorted by price, % change, market cap, and market cap diff. Search and filter by sector to find opportunities fast.',
  default:   'Real-time pre-market stock data, earnings calendar, and market analysis for US stocks. Track market movers before the bell.',
};

function resolveDescription(pathname: string, tab: string | null): string {
  const d = SECTION_DESCRIPTIONS;
  if (pathname === '/heatmap')           return d['heatmap']   ?? d['default'] ?? '';
  if (pathname === '/earnings')          return d['earnings']  ?? d['default'] ?? '';
  if (pathname === '/stocks')            return d['allStocks'] ?? d['default'] ?? '';
  if (pathname === '/premarket-movers' || pathname === '/gainers' || pathname === '/losers')
                                         return d['movers']    ?? d['default'] ?? '';
  if (tab) { const v = d[tab]; if (v)   return v; }
  return d['default'] ?? '';
}

function FooterContent() {
  const pathname  = usePathname();
  const params    = useSearchParams();
  const tab       = params.get('tab');
  const desc      = resolveDescription(pathname, tab);
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 pt-12 pb-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand Section */}
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="flex items-center">
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                PreMarketPrice
              </span>
            </Link>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {desc}
            </p>
          </div>

          {/* Market Links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Markets
            </h3>
            <ul className="space-y-2">
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
                <Link href="/earnings" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Top Earnings
                </Link>
              </li>
              <li>
                <Link href="/earnings" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  All Earnings
                </Link>
              </li>
              <li>
                <Link href="/heatmap" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Market Heatmap
                </Link>
              </li>
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
                <Link href="/capex-tracker" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Capex Tracker
                </Link>
              </li>
              <li>
                <Link href="/stocks" className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  All Stocks
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
            </ul>
          </div>

          {/* Support Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Support
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Need help or have suggestions?
            </p>
            <a 
              href="mailto:info@verifa.sk" 
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              info@verifa.sk
            </a>
            <a
              href="https://x.com/premarketprice"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Follow @premarketprice
            </a>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center bg-transparent">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            &copy; {currentYear} PreMarketPrice. All rights reserved.
          </p>
          <div className="mt-4 md:mt-0 flex items-center space-x-6">
            <Link
              href="/zh"
              hrefLang="zh-CN"
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              中文版
            </Link>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Data provided for informational purposes only.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function Footer() {
  return (
    <Suspense fallback={
      <footer className="bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 pt-12 pb-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">PreMarketPrice</p>
          <a href="/zh" hrefLang="zh-CN" className="text-xs text-gray-400 dark:text-gray-500">中文版</a>
        </div>
      </footer>
    }>
      <FooterContent />
    </Suspense>
  );
}
