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

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-2 active:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3">
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
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base text-gray-900">{stock.ticker}</h3>
        </div>

        {/* Price - fixed width for alignment */}
        <div className="text-right flex-shrink-0 w-20">
          <div className="font-mono font-bold text-gray-900 text-base">${formattedPrice}</div>
        </div>

        {/* % Change - fixed width for alignment, remove duplicate % */}
        <div className={`text-sm font-medium flex-shrink-0 w-16 text-right ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {formattedPercentChange}
        </div>

        {/* Action - Favorite button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
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
