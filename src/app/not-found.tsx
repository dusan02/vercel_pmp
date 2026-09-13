'use client';

import Link from 'next/link';

const POPULAR_PAGES = [
  { href: '/heatmap', label: 'Market Heatmap' },
  { href: '/gainers', label: 'Premarket Gainers' },
  { href: '/losers', label: 'Premarket Losers' },
  { href: '/premarket-movers', label: 'Premarket Movers' },
  { href: '/earnings', label: 'Earnings Calendar' },
  { href: '/stocks', label: 'All Stocks' },
  { href: '/screener', label: 'Stock Screener' },
  { href: '/blog', label: 'Blog' },
];

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-16">
      <p className="text-6xl font-extrabold text-blue-600 dark:text-blue-400 mb-4">404</p>
      <h2 className="text-2xl font-bold mb-2">Page not found</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8 text-center max-w-md">
        The page you are looking for does not exist or has moved. Try one of our popular pages instead:
      </p>
      <div className="flex flex-wrap justify-center gap-3 mb-8">
        {POPULAR_PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {page.label}
          </Link>
        ))}
      </div>
      <Link href="/" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
        Return Home
      </Link>
    </div>
  );
}
