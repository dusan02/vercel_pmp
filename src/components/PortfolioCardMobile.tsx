'use client';

import React, { memo } from 'react';
import { StockData } from '@/lib/types';
import { formatCurrencyCompact, formatPrice, formatPercent } from '@/lib/utils/format';
import CompanyLogo from './CompanyLogo';
import { X } from 'lucide-react';
import { getCompanyName } from '@/lib/companyNames';
import { PortfolioQuantityInput } from './PortfolioQuantityInput';

interface PortfolioCardMobileProps {
  stock: StockData;
  quantity: number;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onRemove: (ticker: string) => void;
  calculateValue: (stock: StockData) => number;
  onOpenDetails?: (ticker: string) => void;
}

export const PortfolioCardMobile = memo(({
  stock,
  quantity,
  onUpdateQuantity,
  onRemove,
  calculateValue,
  onOpenDetails
}: PortfolioCardMobileProps) => {
  const formattedPrice = formatPrice(stock.currentPrice);
  const formattedPercentChange = formatPercent(stock.percentChange);
  const isPositive = stock.percentChange >= 0;

  // Calculate Value (Daily P&L)
  const value = calculateValue(stock);
  const valueIsPositive = value >= 0;
  const formattedValue = formatCurrencyCompact(value, true);

  return (
    <div
      className="px-3 py-3 bg-white dark:bg-white/5 border-b border-gray-100 dark:border-gray-800 last:border-0"
    >
      {/* Grid Layout similar to table rows but optimized for mobile */}
      <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
        {/* Top Row: Ticker and Price */}
        <div className="flex items-center gap-2 overflow-hidden">
          <CompanyLogo
            ticker={stock.ticker}
            logoUrl={stock.logoUrl || `/logos/${stock.ticker.toLowerCase()}-32.webp`}
            size={24}
          />
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{stock.ticker}</div>
            <div className="text-xs text-gray-500 truncate">{getCompanyName(stock.ticker)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-semibold">${formattedPrice}</div>
          <div className={`text-xs font-mono ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
            {formattedPercentChange}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
        {/* Quantity Input */}
        <PortfolioQuantityInput
          value={quantity}
          onChange={(qty) => onUpdateQuantity(stock.ticker, qty)}
          className="w-20"
        />

        {/* Daily P&L */}
        <div className="text-right">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Daily P&L</div>
          <div className={`font-mono text-sm ${valueIsPositive ? 'text-green-600' : 'text-red-500'}`}>
            {formattedValue}
          </div>
        </div>

        {/* Remove Button */}
        <button
          onClick={() => onRemove(stock.ticker)}
          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
          aria-label="Remove"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
});

PortfolioCardMobile.displayName = 'PortfolioCardMobile';
