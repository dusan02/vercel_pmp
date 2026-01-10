'use client';

import React, { memo, useMemo } from 'react';
import { StockData } from '@/lib/types';
import { formatCurrencyCompact, formatPrice, formatPercent } from '@/lib/utils/format';
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

  // "Value" requested: daily $ change of the holding, derived from % change and price.
  // Approximate prevClose from percent change: prev = current / (1 + pct/100)
  const holdingDelta = useMemo(() => {
    const price = stock.currentPrice ?? 0;
    const pct = stock.percentChange ?? 0;
    if (!isFinite(price) || price <= 0) return 0;
    if (!isFinite(pct)) return 0;
    // Avoid division blowups around -100%
    if (pct <= -99.999) return 0;
    const prev = price / (1 + pct / 100);
    const perShareDelta = price - prev;
    const v = perShareDelta * (quantity || 0);
    return isFinite(v) ? v : 0;
  }, [quantity, stock.currentPrice, stock.percentChange]);
  const holdingDeltaIsPositive = holdingDelta >= 0;
  const formattedHoldingDelta = useMemo(() => formatCurrencyCompact(holdingDelta, true), [holdingDelta]);

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
      {/* Fixed-column grid so rows align perfectly (like a table) */}
      <div className="grid items-center gap-x-1.5 min-w-0 [grid-template-columns:40px_minmax(56px,1fr)_56px_72px_56px_52px]">
        {/* Logo */}
        <div className="flex-shrink-0 justify-self-center">
          <CompanyLogo
            ticker={stock.ticker}
            {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})}
            size={40}
            priority={priority}
          />
        </div>

        {/* Ticker */}
        <div className="min-w-0 text-center">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 tracking-tight truncate">
            {stock.ticker}
          </h3>
        </div>

        {/* # (Quantity) */}
        <div className="justify-self-center">
          <div className="w-[56px] text-center px-2 py-1 rounded-md text-xs font-semibold tabular-nums bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80">
            #{quantity}
          </div>
        </div>

        {/* Price */}
        <div className="text-center min-w-0 overflow-hidden">
          <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums truncate">
            ${formattedPrice}
          </div>
          <div className={`text-[11px] font-mono tabular-nums truncate ${holdingDeltaIsPositive ? 'text-green-600' : 'text-red-600'}`}>
            {formattedHoldingDelta}
          </div>
        </div>

        {/* % Change */}
        <div className={`text-xs font-semibold text-center tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {formattedPercentChange}
        </div>

        {/* Action - Remove */}
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
          className="w-12 h-12 flex items-center justify-center text-red-600 bg-transparent active:bg-transparent rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 justify-self-center flex-shrink-0"
          aria-label={`Remove ${stock.ticker} from portfolio`}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
});

PortfolioCardMobile.displayName = 'PortfolioCardMobile';

