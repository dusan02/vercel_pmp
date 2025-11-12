/**
 * Shared Stock Table Row Component
 * Used across Favorites, All Stocks, and other sections
 */

import React, { useMemo, memo } from 'react';
import { StockData } from '@/lib/types';
import { formatBillions, formatPrice, formatPercent, formatMarketCapDiff } from '@/lib/format';
import { getCompanyName } from '@/lib/companyNames';
import CompanyLogo from './CompanyLogo';
import { SwipeableTableRow } from './SwipeableTableRow';

interface StockTableRowProps {
  stock: StockData;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

export const StockTableRow = memo(({ 
  stock, 
  isFavorite, 
  onToggleFavorite 
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
      <td>
        <div className="logo-container">
          <CompanyLogo ticker={stock.ticker} size={32} />
        </div>
      </td>
      <td><strong>{stock.ticker}</strong></td>
      <td className="company-name">{companyName}</td>
      <td>{stock.sector || 'N/A'}</td>
      <td>{stock.industry || 'N/A'}</td>
      <td>{formattedMarketCap}</td>
      <td>${formattedPrice}</td>
      <td className={stock.percentChange >= 0 ? 'positive' : 'negative'}>
        {formattedPercentChange}
      </td>
      <td className={stock.marketCapDiff >= 0 ? 'positive' : 'negative'}>
        {formattedMarketCapDiff}
      </td>
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
    prevProps.isFavorite === nextProps.isFavorite
  );
});

StockTableRow.displayName = 'StockTableRow';

