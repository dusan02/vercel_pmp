'use client';

import React, { memo } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import CompanyLogo from './CompanyLogo';
import { X } from 'lucide-react';

interface PortfolioCardMobileProps {
  stock: StockData;
  quantity: number;
  onRemoveStock: (ticker: string) => void;
  onOpenDetails: (ticker: string) => void;
  priority?: boolean;
}

export const PortfolioCardMobile = memo(({
  stock,
  quantity,
  onRemoveStock,
  onOpenDetails,
  priority = false
}: PortfolioCardMobileProps) => {
  const formattedPrice = formatPrice(stock.currentPrice);
  const formattedPercentChange = formatPercent(stock.percentChange);
  const isPositive = stock.percentChange >= 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(stock.ticker)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetails(stock.ticker);
        }
      }}
      className="px-3 py-2 active:bg-gray-50 dark:active:bg-gray-800 transition-colors cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      aria-label={`Open details for ${stock.ticker}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
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
        
        {/* Ticker (flexible so we never push the delete X off-screen) */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 tracking-tight truncate">
            {stock.ticker}
          </h3>
        </div>

        {/* # (Quantity) */}
        <div className="flex-shrink-0">
          <div className="px-2 py-1 rounded-md text-xs font-semibold tabular-nums bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80">
            #{quantity}
          </div>
        </div>

        {/* Price - fixed width for alignment */}
        <div className="text-right flex-shrink-0 w-20">
          <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
            ${formattedPrice}
          </div>
        </div>

        {/* % Change - fixed width for alignment, remove duplicate % */}
        <div className={`text-xs font-semibold flex-shrink-0 w-12 text-right tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {formattedPercentChange}
        </div>

        {/* Action - Remove button */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemoveStock(stock.ticker);
          }}
          // Best practice: 44x44px tap target on mobile
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-red-600 bg-transparent active:bg-transparent rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
          aria-label={`Remove ${stock.ticker} from portfolio`}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
});

PortfolioCardMobile.displayName = 'PortfolioCardMobile';

