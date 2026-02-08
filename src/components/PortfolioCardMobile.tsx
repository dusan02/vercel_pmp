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
    <div className="px-3 py-3 bg-white dark:bg-white/5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-3">
        {/* 1. Logo (Larger ~40px) */}
        <CompanyLogo
          ticker={stock.ticker}
          size={42}
          className="shrink-0"
        />

        {/* 2. Ticker & Name */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="font-bold text-base leading-tight truncate">{stock.ticker}</div>
          <div className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">
            {getCompanyName(stock.ticker)}
          </div>
        </div>

        {/* 3. Price & P&L (Vertical Stack) */}
        <div className="flex flex-col items-end justify-center shrink-0 min-w-[60px]">
          <div className="font-mono text-sm font-semibold leading-tight">
            ${formattedPrice}
          </div>
          <div className={`text-[11px] font-mono leading-tight mt-0.5 ${value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {formattedValue}
          </div>
        </div>

        {/* 4. Quantity Input */}
        <div className="shrink-0">
          <PortfolioQuantityInput
            value={quantity}
            onChange={(qty) => onUpdateQuantity(stock.ticker, qty)}
            className="w-14 text-center h-9 text-sm"
          />
        </div>

        {/* 5. Remove X (Small, unobtrusive) */}
        <button
          onClick={() => onRemove(stock.ticker)}
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
