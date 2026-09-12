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
 * Shows top gainers and losers in a narrow vertical column
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

  const gainers = sorted.filter((m) => (m.changePct ?? m.lastChangePct ?? 0) > 0).slice(0, 5);
  const losers = sorted.filter((m) => (m.changePct ?? m.lastChangePct ?? 0) < 0).slice(0, 5);

  if (gainers.length === 0 && losers.length === 0) return null;

  return (
    <aside className="w-64 shrink-0 hidden xl:block">
      <div className="sticky top-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">
            What Moved Today
          </h2>
          <Link
            href="/premarket-movers"
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            All →
          </Link>
        </div>

        {gainers.length > 0 && (
          <div className="bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-100 dark:border-green-900/30 p-2.5">
            <h3 className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Top Gainers
            </h3>
            <div className="space-y-0.5">
              {gainers.map((m) => (
                <SidebarMoverRow key={m.symbol} mover={m} eligible={eligibleTickers} positive />
              ))}
            </div>
          </div>
        )}

        {losers.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30 p-2.5">
            <h3 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              Top Losers
            </h3>
            <div className="space-y-0.5">
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
    <div className="flex items-center justify-between py-1">
      <div className="min-w-0">
        <span className="font-bold text-gray-900 dark:text-white text-xs">{symbol}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate block leading-tight">{name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {price != null && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">${price.toFixed(2)}</span>
        )}
        <span className={`text-xs font-semibold tabular-nums ${positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {positive ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      </div>
    </div>
  );

  if (isEligible) {
    return (
      <Link href={`/analysis/${symbol}`} className="block hover:bg-green-100/50 dark:hover:bg-green-900/20 rounded px-1 -mx-1 transition-colors">
        {content}
      </Link>
    );
  }
  return <div className="px-1 -mx-1">{content}</div>;
}
