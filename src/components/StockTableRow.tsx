/**
 * Shared Stock Table Row Component
 * Used across Favorites, All Stocks, and other sections
 */

import React, { useMemo, memo } from 'react';
import { StockData } from '@/lib/types';
import { formatBillions, formatPrice, formatPercent, formatMarketCapDiff, formatSectorName } from '@/lib/utils/format';
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
    <>
      {/* Mobile: 5 columns only (CSS gating - lg:hidden) */}
      <SwipeableTableRow
        onToggleFavorite={onToggleFavorite}
        isFavorite={isFavorite}
        className="lg:hidden"
      >
        {/* Logo - smaller on mobile */}
        <td>
          <div className="logo-container">
            <CompanyLogo ticker={stock.ticker} {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} size={24} priority={priority} />
          </div>
        </td>
        
        {/* Ticker */}
        <td><strong>{stock.ticker}</strong></td>
        
        {/* % Change */}
        <td className={stock.percentChange >= 0 ? 'positive' : 'negative'}>
          {formattedPercentChange}
        </td>
        
        {/* Cap Diff */}
        <td className={stock.marketCapDiff >= 0 ? 'positive' : 'negative'}>
          {formattedMarketCapDiff}
        </td>
        
        {/* Action - Favorite button */}
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
    
      {/* Desktop: Full columns (CSS gating - hidden lg:table-row) */}
      <SwipeableTableRow
        onToggleFavorite={onToggleFavorite}
        isFavorite={isFavorite}
        className="hidden lg:table-row"
      >
        {/* Logo */}
        <td>
          <div className="logo-container">
            <CompanyLogo ticker={stock.ticker} {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} size={32} priority={priority} />
          </div>
        </td>
        
        {/* Ticker */}
        <td><strong>{stock.ticker}</strong></td>
        
        {/* Company */}
        <td className="company-name">{companyName}</td>
        
        {/* Sector */}
        <td>{formatSectorName(stock.sector)}</td>
        
        {/* Industry */}
        <td>{stock.industry || 'N/A'}</td>
        
        {/* Market Cap */}
        <td>{formattedMarketCap}</td>
        
        {/* Cap Diff */}
        <td className={stock.marketCapDiff >= 0 ? 'positive' : 'negative'}>
          {formattedMarketCapDiff}
        </td>
        
        {/* Price */}
        <td>${formattedPrice}</td>
        
        {/* % Change */}
        <td className={stock.percentChange >= 0 ? 'positive' : 'negative'}>
          {formattedPercentChange}
        </td>
        
        {/* Favorites */}
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
    </>
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
