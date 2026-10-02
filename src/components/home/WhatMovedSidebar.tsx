'use client';

import Link from 'next/link';

interface MoverData {
  symbol: string;
  name?: string;
  price?: number;
  changePct?: number;
  lastPrice?: number;
  lastChangePct?: number;
}

interface WhatMovedSidebarProps {
  movers: MoverData[] | undefined;
  eligibleTickers: Set<string>;
}

/**
 * Sidebar "What Moved Today" for desktop heatmap layout.
 * Shows top 3 gainers and losers in a vertical column
 * next to the heatmap.
 */
export function WhatMovedSidebar({ movers, eligibleTickers }: WhatMovedSidebarProps) {
  if (!movers || movers.length === 0) return null;

  const sorted = [...movers]
    .filter((m) => {
      const pct = m.changePct ?? m.lastChangePct;
      return pct != null && m.symbol;
    })
    .sort((a, b) => {
      const aPct = Math.abs(a.changePct ?? a.lastChangePct ?? 0);
      const bPct = Math.abs(b.changePct ?? b.lastChangePct ?? 0);
      return bPct - aPct;
    });

  const gainers = sorted.filter((m) => (m.changePct ?? m.lastChangePct ?? 0) > 0).slice(0, 3);
  const losers = sorted.filter((m) => (m.changePct ?? m.lastChangePct ?? 0) < 0).slice(0, 3);

  if (gainers.length === 0 && losers.length === 0) return null;

  return (
    <aside className="w-80 shrink-0 hidden xl:block">
      <div className="sticky top-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">
            What Moved Today
          </h2>
          <a
            href="/premarket-movers"
            onClick={(e) => {
              // In-app tab switch — the middleware 301s /?tab=movers to
              // /premarket-movers, so a plain href would leave the page.
              e.preventDefault();
              window.dispatchEvent(new CustomEvent('mobile-nav-change', { detail: 'movers' }));
            }}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            All movers →
          </a>
        </div>

        {gainers.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Top Gainers
            </h3>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {gainers.map((m) => (
                <SidebarMoverRow key={m.symbol} mover={m} eligible={eligibleTickers} positive />
              ))}
            </div>
          </div>
        )}

        {losers.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              Top Losers
            </h3>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {losers.map((m) => (
                <SidebarMoverRow key={m.symbol} mover={m} eligible={eligibleTickers} positive={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function SidebarMoverRow({ mover, eligible, positive }: { mover: MoverData; eligible: Set<string>; positive: boolean }) {
  const symbol = mover.symbol;
  const name = mover.name || symbol;
  const changePct = mover.changePct ?? mover.lastChangePct ?? 0;
  const price = mover.price ?? mover.lastPrice;
  const isEligible = eligible.has(symbol);

  const content = (
    <div className="flex items-center gap-2 py-1.5">
      {/* Ticker — fixed width */}
      <span className="font-bold text-gray-900 dark:text-white text-sm w-14 shrink-0">{symbol}</span>

      {/* Price — fixed width, right-aligned */}
      {price != null && (
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-16 text-right shrink-0">
          ${price.toFixed(2)}
        </span>
      )}

      {/* % change — right-aligned, colored */}
      <span className={`text-sm font-semibold tabular-nums text-right ml-auto ${positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {positive ? '+' : ''}{changePct.toFixed(2)}%
      </span>
    </div>
  );

  if (isEligible) {
    return (
      <Link href={`/analysis/${symbol}`} className="block hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-1 -mx-1 transition-colors">
        {content}
      </Link>
    );
  }
  return <div className="px-1 -mx-1">{content}</div>;
}
