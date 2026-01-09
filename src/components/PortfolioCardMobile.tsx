'use client';

import React, { memo } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import CompanyLogo from './CompanyLogo';
import { X } from 'lucide-react';
import { PortfolioQuantityInput } from './PortfolioQuantityInput';

interface PortfolioCardMobileProps {
  stock: StockData;
  quantity: number;
  value: number;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onRemoveStock: (ticker: string) => void;
  priority?: boolean;
}

export const PortfolioCardMobile = memo(({
  stock,
  quantity,
  value,
  onUpdateQuantity,
  onRemoveStock,
  priority = false
}: PortfolioCardMobileProps) => {
  const formattedPrice = formatPrice(stock.currentPrice);
  const formattedPercentChange = formatPercent(stock.percentChange);
  const isPositive = stock.percentChange >= 0;

  return (
    <div className="px-3 py-2 active:bg-gray-50 dark:active:bg-gray-800 transition-colors">
      <div className="flex items-center gap-1.5">
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
        <div className="flex-shrink-0 min-w-[48px]">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 tracking-tight">
            {stock.ticker}
          </h3>
        </div>

        {/* # (Quantity) */}
        <div className="flex-shrink-0 w-12">
          <PortfolioQuantityInput
            value={quantity || 1}
            onChange={(v) => onUpdateQuantity(stock.ticker, v || 1)}
            // iOS best practice: font-size >= 16px prevents Safari zoom on focus
            className="min-w-0 w-full px-1 py-1 text-[16px] rounded-md bg-transparent border border-gray-300/60 dark:border-slate-600/70"
          />
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
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-red-600 bg-transparent active:bg-transparent focus:outline-none"
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

