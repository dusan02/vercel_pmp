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
  avgCost?: number;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onUpdateCostBasis?: ((ticker: string, avgPrice: number) => void) | undefined;
  onRemove: (ticker: string) => void;
  calculateValue: (stock: StockData) => number;
  onOpenDetails?: (ticker: string) => void;
  onClick?: () => void;
}

export const PortfolioCardMobile = memo(({
  stock,
  quantity,
  avgCost = 0,
  onUpdateQuantity,
  onUpdateCostBasis,
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

  // Total P&L when cost basis is set
  const positionValue = quantity * (stock.currentPrice || stock.closePrice || 0);
  const totalPnl = avgCost > 0 && quantity > 0 ? positionValue - quantity * avgCost : null;
  const totalRetPct = totalPnl !== null ? (positionValue / (quantity * avgCost) - 1) * 100 : null;

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
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base text-gray-900 dark:text-gray-100 leading-tight truncate">{stock.ticker}</span>
            {stock.overallScore != null && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 tabular-nums shrink-0" title="PMP Score">
                {stock.overallScore}
              </span>
            )}
            {stock.earningsDays != null && stock.earningsDays <= 14 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shrink-0">
                Earn {stock.earningsDays === 0 ? 'today' : stock.earningsDays === 1 ? 'tmrw' : `${stock.earningsDays}d`}
              </span>
            )}
          </div>
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

      {/* Cost basis row */}
      {onUpdateCostBasis && (
        <div className="flex items-center gap-2 mt-2 pl-[52px]" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Avg</span>
          <PortfolioQuantityInput
            value={avgCost}
            onChange={(v) => onUpdateCostBasis(stock.ticker, v)}
            className="w-20 text-center h-7 text-xs"
            placeholder="cost"
            decimals={4}
            title="Average buy price — enables total P&L"
          />
          {totalPnl !== null && (
            <span className={`ml-auto text-[11px] font-bold tabular-nums ${totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrencyCompact(totalPnl, true)} ({(totalRetPct ?? 0) >= 0 ? '+' : ''}{(totalRetPct ?? 0).toFixed(1)}%)
            </span>
          )}
        </div>
      )}
    </div>
  );
});

PortfolioCardMobile.displayName = 'PortfolioCardMobile';
