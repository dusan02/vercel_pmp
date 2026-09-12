import Link from 'next/link';

interface MoverData {
  symbol: string;
  name?: string;
  price?: number;
  changePct?: number;
  marketCap?: number;
}

interface WhatMovedTodayProps {
  movers: MoverData[];
  eligibleTickers: Set<string>;
}

/**
 * Server-rendered "What moved today" section for the homepage.
 * Shows top 5 gainers and losers from SSR-fetched movers data.
 * Visible immediately on page load — improves dwell time and gives
 * Google substantial text content above the fold.
 */
export function WhatMovedToday({ movers, eligibleTickers }: WhatMovedTodayProps) {
  if (!movers || movers.length === 0) return null;

  // Sort by absolute change to get biggest movers
  const sorted = [...movers]
    .filter((m) => m.changePct != null && m.symbol)
    .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!));

  const gainers = sorted.filter((m) => (m.changePct ?? 0) > 0).slice(0, 5);
  const losers = sorted.filter((m) => (m.changePct ?? 0) < 0).slice(0, 5);

  if (gainers.length === 0 && losers.length === 0) return null;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <section className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              What Moved Today
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Biggest pre-market moves — {today}
            </p>
          </div>
          <Link
            href="/premarket-movers"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            All movers →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Gainers */}
          {gainers.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-100 dark:border-green-900/30 p-4">
              <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Top Gainers
              </h3>
              <div className="space-y-2">
                {gainers.map((m) => (
                  <MoverRow key={m.symbol} mover={m} eligible={eligibleTickers} positive />
                ))}
              </div>
            </div>
          )}

          {/* Losers */}
          {losers.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30 p-4">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Top Losers
              </h3>
              <div className="space-y-2">
                {losers.map((m) => (
                  <MoverRow key={m.symbol} mover={m} eligible={eligibleTickers} positive={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MoverRow({ mover, eligible, positive }: { mover: MoverData; eligible: Set<string>; positive: boolean }) {
  const symbol = mover.symbol;
  const name = mover.name || symbol;
  const changePct = mover.changePct ?? 0;
  const price = mover.price;
  const isEligible = eligible.has(symbol);

  const content = (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-bold text-gray-900 dark:text-white text-sm">{symbol}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate hidden sm:inline">{name}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {price != null && (
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">${price.toFixed(2)}</span>
        )}
        <span className={`text-sm font-semibold tabular-nums ${positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {positive ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      </div>
    </div>
  );

  if (isEligible) {
    return (
      <Link href={`/analysis/${symbol}`} className="block hover:bg-green-100/50 dark:hover:bg-green-900/20 rounded-lg px-2 -mx-2 transition-colors">
        {content}
      </Link>
    );
  }
  return <div className="px-2 -mx-2">{content}</div>;
}
