'use client';

import React, { memo, useMemo } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent, formatMarketCap, formatMarketCapDiff } from '@/lib/utils/format';
import CompanyLogo from './CompanyLogo';

interface StockCardMobileProps {
  stock: StockData;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  priority?: boolean;
  displayMode?: 'default' | 'capDiff' | 'cap';
}

export const StockCardMobile = memo(({
  stock,
  isFavorite,
  onToggleFavorite,
  priority = false,
  displayMode = 'default'
}: StockCardMobileProps) => {
  const formattedPrice = useMemo(() => formatPrice(stock.currentPrice), [stock.currentPrice]);
  const formattedPercentChange = useMemo(() => formatPercent(stock.percentChange), [stock.percentChange]);
  const isPositive = stock.percentChange >= 0;
  const hasValidPrice = stock.currentPrice > 0;
  const capDiffIsPositive = (stock.marketCapDiff ?? 0) >= 0;
  const formattedCap = useMemo(() => formatMarketCap(stock.marketCap), [stock.marketCap]);
  const formattedCapDiff = useMemo(() => formatMarketCapDiff(stock.marketCapDiff), [stock.marketCapDiff]);

  return (
    <div
      className="px-3 py-2 active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
      role="row"
      aria-label={`Stock ${stock.ticker}`}
      style={{
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation' // Prevent double-tap zoom
      }}
    >
      {/* Fixed-column grid so values are centered under headers (like a table) */}
      <div
        className={
          displayMode === 'capDiff'
            ? 'grid items-center gap-x-2 min-w-0 [grid-template-columns:minmax(56px,1fr)_72px_72px_44px]'
            : 'grid items-center gap-x-2 min-w-0 [grid-template-columns:minmax(56px,1fr)_96px_56px_44px]'
        }
        role="grid"
      >

        {/* Ticker */}
        <div className="min-w-0 text-center">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 tracking-tight truncate">
            {stock.ticker}
          </h3>
        </div>

        {displayMode === 'capDiff' ? (
          <>
            {/* Market Cap */}
            <div className="text-center">
              <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
                {stock.marketCap ? `${formattedCap}` : '—'}
              </div>
            </div>
            {/* Cap Diff */}
            <div className={`text-xs font-semibold text-center tabular-nums ${capDiffIsPositive ? 'text-green-600' : 'text-red-600'}`}>
              {stock.marketCapDiff ? formattedCapDiff : '—'}
            </div>
          </>
        ) : displayMode === 'cap' ? (
          <>
            {/* Market Cap */}
            <div className="text-center">
              <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
                {stock.marketCap ? `${formattedCap}` : '—'}
              </div>
            </div>

            {/* % Change */}
            <div className={`text-xs font-semibold text-center tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {formattedPercentChange}
            </div>
          </>
        ) : (
          <>
            {/* Price */}
            <div className="text-center">
              <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
                {hasValidPrice ? `$${formattedPrice}` : '—'}
              </div>
            </div>

            {/* % Change */}
            <div className={`text-xs font-semibold text-center tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {formattedPercentChange}
            </div>
          </>
        )}

        {/* Action - Favorite button */}
        <button
          type="button"
          onPointerDown={(e) => {
            // Prevent any parent handlers / focus styles from interfering
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite();
          }}
          // Best practice: 44x44px tap target on mobile
          className="w-11 h-11 flex items-center justify-center bg-transparent active:bg-transparent rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 justify-self-center"
          aria-label={isFavorite ? `Remove ${stock.ticker} from favorites` : `Add ${stock.ticker} to favorites`}
          aria-pressed={isFavorite}
          style={{
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation' // Prevent double-tap zoom
          }}
        >
          <span className={`text-xl ${isFavorite ? 'text-yellow-500' : 'text-gray-400'}`}>
            {isFavorite ? '★' : '☆'}
          </span>
        </button>
      </div>
    </div>
  );
});

StockCardMobile.displayName = 'StockCardMobile';
