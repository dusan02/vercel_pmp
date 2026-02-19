'use client';

import React, { memo, useMemo } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent, formatMarketCap, formatMarketCapDiff } from '@/lib/utils/format';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';

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
  const companyName = useMemo(() => getCompanyName(stock.ticker), [stock.ticker]);
  const isPositive = stock.percentChange >= 0;
  const hasValidPrice = stock.currentPrice > 0;
  const capDiffIsPositive = (stock.marketCapDiff ?? 0) >= 0;
  const formattedCap = useMemo(() => formatMarketCap(stock.marketCap), [stock.marketCap]);
  const formattedCapDiff = useMemo(() => formatMarketCapDiff(stock.marketCapDiff), [stock.marketCapDiff]);

  return (
    <div
      className="px-4 py-3 active:bg-gray-50 dark:active:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0"
      role="row"
      aria-label={`Stock ${stock.ticker}`}
      style={{
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation'
      }}
    >
      <div className="flex items-center justify-between gap-3 w-full">
        {/* Left: Logo + Ticker + Name */}
        <div className="flex items-center gap-3 overflow-hidden">
          <CompanyLogo
            ticker={stock.ticker}
            size={40}
            className="rounded-md shrink-0 bg-gray-100 dark:bg-gray-800"
            priority={priority}
          />
          <div className="flex flex-col overflow-hidden">
            <span className="font-bold text-base text-gray-900 dark:text-gray-100 leading-tight">
              {stock.ticker}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight">
              {companyName}
            </span>
          </div>
        </div>

        {/* Right: Data + Favorite */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col items-end">
            {displayMode === 'capDiff' ? (
              <>
                <span className="font-mono font-medium text-sm text-gray-900 dark:text-gray-100 tabular-nums">
                  {stock.marketCap ? formattedCap : '—'}
                </span>
                <span className={`text-xs font-semibold tabular-nums ${capDiffIsPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {stock.marketCapDiff ? formattedCapDiff : '—'}
                </span>
              </>
            ) : displayMode === 'cap' ? (
              <>
                <span className="font-mono font-medium text-sm text-gray-900 dark:text-gray-100 tabular-nums">
                  {stock.marketCap ? formattedCap : '—'}
                </span>
                <span className={`text-xs font-semibold tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {formattedPercentChange}
                </span>
              </>
            ) : (
              <>
                <span className="font-mono font-medium text-sm text-gray-900 dark:text-gray-100 tabular-nums">
                  {hasValidPrice ? `$${formattedPrice}` : '—'}
                </span>
                <div className={`px-1.5 py-0.5 rounded text-[11px] font-bold mt-0.5 tabular-nums
                  ${isPositive
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}
                >
                  {formattedPercentChange}
                </div>
              </>
            )}
          </div>

          {/* Favorite Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="w-10 h-10 flex items-center justify-center -mr-2 rounded-full active:bg-gray-100 dark:active:bg-gray-700 transition-colors focus:outline-none"
            aria-label={isFavorite ? `Remove ${stock.ticker} from favorites` : `Add ${stock.ticker} to favorites`}
          >
            <span className={`text-xl ${isFavorite ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'}`}>
              {isFavorite ? '★' : '☆'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
});

StockCardMobile.displayName = 'StockCardMobile';
