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
    <div className="px-3 py-2 active:bg-gray-50 dark:active:bg-gray-800 transition-colors">
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Logo */}
        <div className="flex-shrink-0">
          <CompanyLogo 
            ticker={stock.ticker} 
            {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} 
            size={40} 
            priority={priority} 
          />
        </div>
        
        {/* Ticker (flexible so we never overflow on small screens) */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 tracking-tight truncate">
            {stock.ticker}
          </h3>
        </div>

        {displayMode === 'capDiff' ? (
          <>
            {/* Market Cap */}
            <div className="text-right flex-shrink-0 w-[72px]">
              <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
                {stock.marketCap ? `${formattedCap}` : '—'}
              </div>
            </div>
            {/* Cap Diff */}
            <div className={`text-xs font-semibold flex-shrink-0 w-[72px] text-right tabular-nums ${capDiffIsPositive ? 'text-green-600' : 'text-red-600'}`}>
              {stock.marketCapDiff ? formattedCapDiff : '—'}
            </div>
          </>
        ) : displayMode === 'cap' ? (
          <>
            {/* Market Cap (instead of Price when sorting by MarketCap) */}
            <div className="text-right flex-shrink-0 w-24">
              <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
                {stock.marketCap ? `${formattedCap}` : '—'}
              </div>
            </div>

            {/* % Change */}
            <div className={`text-xs font-semibold flex-shrink-0 w-14 text-right tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {formattedPercentChange}
            </div>
          </>
        ) : (
          <>
            {/* Price - fixed width for alignment */}
            <div className="text-right flex-shrink-0 w-24">
              <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
                {hasValidPrice ? `$${formattedPrice}` : '—'}
              </div>
            </div>

            {/* % Change - fixed width for alignment */}
            <div className={`text-xs font-semibold flex-shrink-0 w-14 text-right tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
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
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-transparent active:bg-transparent rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          style={{ WebkitTapHighlightColor: 'transparent' }}
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
