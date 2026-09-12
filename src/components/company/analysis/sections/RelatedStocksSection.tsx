import Link from 'next/link';

interface RelatedStocksSectionProps {
  ticker: string;
  sector: string | null | undefined;
  /** Up to 10 same-sector peers, market-cap sorted, current ticker excluded */
  peers: Array<{ symbol: string; name: string | null }>;
}

export function RelatedStocksSection({ ticker, sector, peers }: RelatedStocksSectionProps) {
  return (
    <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {sector ? `${sector} Stocks` : 'Explore More Stocks'}
      </h2>
      <div className="flex flex-wrap gap-2">
        {peers.length > 0 ? (
          peers.map((p) => (
            <Link
              key={p.symbol}
              href={`/analysis/${encodeURIComponent(p.symbol)}`}
              className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              title={p.name || p.symbol}
            >
              {p.symbol}
              {p.name && (
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
                  {p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name}
                </span>
              )}
            </Link>
          ))
        ) : (
          ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'WMT', 'V']
            .filter((t) => t !== ticker)
            .map((t) => (
              <Link
                key={t}
                href={`/analysis/${encodeURIComponent(t)}`}
                className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                {t}
              </Link>
            ))
        )}
        <Link
          href="/premarket-movers"
          className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors"
        >
          View all stocks →
        </Link>
        {sector && (
          <Link
            href={`/sectors/${encodeURIComponent(sector)}`}
            className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors"
          >
            {sector} sector overview →
          </Link>
        )}
      </div>
    </div>
  );
}
