'use client';

import React, { memo } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import CompanyLogo from './CompanyLogo';
import { X } from 'lucide-react';

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

        {/* Action - Remove button */}
        <button
          onClick={() => onRemoveStock(stock.ticker)}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-red-600"
          aria-label={`Remove ${stock.ticker} from portfolio`}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
});

PortfolioCardMobile.displayName = 'PortfolioCardMobile';

