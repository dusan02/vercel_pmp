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
  onClick?: () => void;
}

export const PortfolioCardMobile = memo(({
  stock,
  quantity,
  onUpdateQuantity,
  onRemove,
  calculateValue,
  onOpenDetails,
  onClick
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
      className={`px-4 py-3 active:bg-gray-50 dark:active:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 w-full">
        {/* 1. Logo */}
        <CompanyLogo
          ticker={stock.ticker}
          size={40}
          className="rounded-md shrink-0 bg-gray-100 dark:bg-gray-800"
        />

        {/* 2. Ticker & Name */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="font-bold text-base text-gray-900 dark:text-gray-100 leading-tight truncate">{stock.ticker}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">
            {getCompanyName(stock.ticker)}
          </div>
        </div>

        {/* 3. Price & P&L (Vertical Stack) */}
        <div className="flex flex-col items-end justify-center shrink-0 min-w-[70px]">
          <div className="font-mono font-medium text-sm text-gray-900 dark:text-gray-100 tabular-nums">
            ${formattedPrice}
          </div>
          <div className={`px-1.5 py-0.5 rounded text-[11px] font-bold mt-0.5 tabular-nums ${value >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
            {formattedValue}
          </div>
        </div>

        {/* 4. Quantity Input */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <PortfolioQuantityInput
            value={quantity}
            onChange={(qty) => onUpdateQuantity(stock.ticker, qty)}
            className="w-14 text-center h-9 text-sm"
          />
        </div>

        {/* 5. Remove X (Small, unobtrusive) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(stock.ticker);
          }}
          className="p-2 text-gray-300 hover:text-red-500 transition-colors -mr-2 shrink-0"
          aria-label="Remove"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
});

PortfolioCardMobile.displayName = 'PortfolioCardMobile';
