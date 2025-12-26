/**
 * Shared Stock Table Row Component
 * Used across Favorites, All Stocks, and other sections
 */

import React, { useMemo, memo } from 'react';
import { StockData } from '@/lib/types';
import { formatBillions, formatPrice, formatPercent, formatMarketCapDiff } from '@/lib/utils/format';
import { getCompanyName } from '@/lib/companyNames';
import CompanyLogo from './CompanyLogo';
import { SwipeableTableRow } from './SwipeableTableRow';

interface StockTableRowProps {
  stock: StockData;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  priority?: boolean; // Pre priority loading logov (above the fold)
}

export const StockTableRow = memo(({
  stock,
  isFavorite,
  onToggleFavorite,
  priority = false
}: StockTableRowProps) => {
  // Memoize formatted values to prevent recalculation
  const formattedPrice = useMemo(() => formatPrice(stock.currentPrice), [stock.currentPrice]);
  const formattedPercentChange = useMemo(() => formatPercent(stock.percentChange), [stock.percentChange]);
  const formattedMarketCapDiff = useMemo(() => formatMarketCapDiff(stock.marketCapDiff), [stock.marketCapDiff]);
  const companyName = useMemo(() => getCompanyName(stock.ticker), [stock.ticker]);
  const formattedMarketCap = useMemo(() => formatBillions(stock.marketCap), [stock.marketCap]);

  return (
    <SwipeableTableRow
      onToggleFavorite={onToggleFavorite}
      isFavorite={isFavorite}
    >
      {/* Desktop: Separate columns */}
      {/* Mobile: Grouped columns */}
      
      {/* Column 1: Logo + Ticker + Company (grouped on mobile) */}
      <td className="mobile-group-1">
        <div className="flex items-center gap-2 desktop-only">
          <div className="logo-container">
            <CompanyLogo ticker={stock.ticker} {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} size={32} priority={priority} />
          </div>
        </div>
        <div className="mobile-compact-cell">
          <div className="flex items-center gap-2 mb-1">
            <div className="logo-container">
              <CompanyLogo ticker={stock.ticker} {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} size={24} priority={priority} />
            </div>
            <strong className="text-base">{stock.ticker}</strong>
          </div>
          <div className="company-name text-sm text-gray-600 dark:text-gray-400">{companyName}</div>
        </div>
      </td>
      
      {/* Desktop: Ticker (separate) */}
      <td className="desktop-only"><strong>{stock.ticker}</strong></td>
      
      {/* Desktop: Company (separate) */}
      <td className="desktop-only company-name">{companyName}</td>
      
      {/* Column 2: Sector + Industry (grouped on mobile) */}
      <td className="mobile-group-2">
        <div className="desktop-only">{stock.sector || 'N/A'}</div>
        <div className="mobile-compact-cell">
          <div className="text-sm font-medium">{stock.sector || 'N/A'}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">{stock.industry || 'N/A'}</div>
        </div>
      </td>
      
      {/* Desktop: Industry (separate) */}
      <td className="desktop-only">{stock.industry || 'N/A'}</td>
      
      {/* Column 3: Market Cap + Cap Diff (grouped on mobile) */}
      <td className="mobile-group-3">
        <div className="desktop-only">{formattedMarketCap}</div>
        <div className="mobile-compact-cell">
          <div className="text-sm font-medium">{formattedMarketCap}</div>
          <div className={`text-xs ${stock.marketCapDiff >= 0 ? 'positive' : 'negative'}`}>
            {formattedMarketCapDiff}
          </div>
        </div>
      </td>
      
      {/* Column 4: Price + % Change (grouped on mobile) */}
      <td className="mobile-group-4">
        <div className="desktop-only">${formattedPrice}</div>
        <div className="mobile-compact-cell">
          <div className="text-sm font-semibold">${formattedPrice}</div>
          <div className={`text-xs font-medium ${stock.percentChange >= 0 ? 'positive' : 'negative'}`}>
            {formattedPercentChange}
            {stock.isStale && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400 ml-1" title="Data may be outdated">
                (STALE)
              </span>
            )}
          </div>
        </div>
      </td>
      
      {/* Desktop: % Change (separate) */}
      <td className={`desktop-only ${stock.percentChange >= 0 ? 'positive' : 'negative'}`}>
        {formattedPercentChange}
        {stock.isStale && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400 ml-1" title="Data may be outdated">
            (STALE)
          </span>
        )}
      </td>
      
      {/* Desktop: Cap Diff (separate) */}
      <td className={`desktop-only ${stock.marketCapDiff >= 0 ? 'positive' : 'negative'}`}>
        {formattedMarketCapDiff}
      </td>
      
      {/* Column 5: Favorites */}
      <td>
        <button
          className={`favorite-btn ${isFavorite ? 'favorited' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      </td>
    </SwipeableTableRow>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if stock data or favorite status changed
  return (
    prevProps.stock.ticker === nextProps.stock.ticker &&
    prevProps.stock.currentPrice === nextProps.stock.currentPrice &&
    prevProps.stock.percentChange === nextProps.stock.percentChange &&
    prevProps.stock.marketCap === nextProps.stock.marketCap &&
    prevProps.stock.marketCapDiff === nextProps.stock.marketCapDiff &&
    prevProps.stock.logoUrl === nextProps.stock.logoUrl &&
    prevProps.isFavorite === nextProps.isFavorite
  );
});

StockTableRow.displayName = 'StockTableRow';

