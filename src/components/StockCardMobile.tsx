'use client';

import React, { memo, useMemo } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import CompanyLogo from './CompanyLogo';

interface StockCardMobileProps {
  stock: StockData;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  priority?: boolean;
}

export const StockCardMobile = memo(({
  stock,
  isFavorite,
  onToggleFavorite,
  priority = false
}: StockCardMobileProps) => {
  const formattedPrice = useMemo(() => formatPrice(stock.currentPrice), [stock.currentPrice]);
  const formattedPercentChange = useMemo(() => formatPercent(stock.percentChange), [stock.percentChange]);
  const isPositive = stock.percentChange >= 0;
  const hasValidPrice = stock.currentPrice > 0;

  return (
    <div className="px-3 py-2 active:bg-gray-50 dark:active:bg-gray-800 transition-colors">
      <div className="flex items-center gap-2">
        {/* Logo */}
        <div className="flex-shrink-0">
          <CompanyLogo 
            ticker={stock.ticker} 
            {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} 
            size={40} 
            priority={priority} 
          />
        </div>
        
        {/* Ticker */}
        <div className="flex-shrink-0 min-w-[56px]">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 tracking-tight">
            {stock.ticker}
          </h3>
        </div>

        {/* Price - fixed width for alignment */}
        <div className="text-right flex-shrink-0 w-24">
          <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
            {hasValidPrice ? `$${formattedPrice}` : '—'}
          </div>
        </div>

        {/* % Change - fixed width for alignment, remove duplicate % */}
        <div className={`text-xs font-semibold flex-shrink-0 w-14 text-right tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {formattedPercentChange}
        </div>

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
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-transparent active:bg-transparent focus:outline-none"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <span className={`text-lg ${isFavorite ? 'text-yellow-500' : 'text-gray-400'}`}>
            {isFavorite ? '★' : '☆'}
          </span>
        </button>
      </div>
    </div>
  );
});

StockCardMobile.displayName = 'StockCardMobile';
