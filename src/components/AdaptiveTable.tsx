'use client';
import React from 'react';
import { useStockTable } from '@/hooks/useAdaptiveTable';
import { SortKey } from '@/hooks/useSortableData';
import CompanyLogo from './CompanyLogo';
import { formatBillions } from '@/lib/utils/format';
import { getCompanyName } from '@/lib/companyNames';
import { StockData } from '@/lib/types';

interface AdaptiveTableProps {
  stocks: StockData[];
  sortKey: SortKey | null;
  ascending: boolean;
  onSort: (key: SortKey) => void;
  onToggleFavorite: (ticker: string) => void;
  isFavorite: (ticker: string) => boolean;
  loading?: boolean;
}

export const AdaptiveTable: React.FC<AdaptiveTableProps> = ({
  stocks,
  sortKey,
  ascending,
  onSort,
  onToggleFavorite,
  isFavorite,
  loading = false
}) => {
  const { visibleColumns, isMobile, isTablet, isDesktop } = useStockTable();


  const renderHeader = () => {
    const headers: React.ReactElement[] = [];

    visibleColumns.forEach(column => {
      switch (column) {
        case 'logo':
          headers.push(<th key="logo">Logo</th>);
          break;
        case 'ticker':
          headers.push(
            <th key="ticker" onClick={() => onSort('ticker' as SortKey)} className={`sortable ${sortKey === 'ticker' ? 'active-sort' : ''}`}>
              Ticker
            </th>
          );
          break;
        case 'companyName':
          headers.push(<th key="companyName">Company Name</th>);
          break;
        case 'currentPrice':
          headers.push(
            <th key="currentPrice" onClick={() => onSort('currentPrice' as SortKey)} className={`sortable ${sortKey === 'currentPrice' ? 'active-sort' : ''}`}>
              Current Price
            </th>
          );
          break;
        case 'percentChange':
          headers.push(
            <th key="percentChange" onClick={() => onSort('percentChange' as SortKey)} className={`sortable ${sortKey === 'percentChange' ? 'active-sort' : ''}`}>
              % Change
            </th>
          );
          break;
        case 'marketCap':
          headers.push(
            <th key="marketCap" onClick={() => onSort('marketCap' as SortKey)} className={`sortable ${sortKey === 'marketCap' ? 'active-sort' : ''}`}>
              Market Cap
            </th>
          );
          break;
        case 'marketCapDiff':
          headers.push(
            <th key="marketCapDiff" onClick={() => onSort('marketCapDiff' as SortKey)} className={`sortable ${sortKey === 'marketCapDiff' ? 'active-sort' : ''}`}>
              Cap Diff
            </th>
          );
          break;
        case 'favorites':
          headers.push(<th key="favorites">Favorites</th>);
          break;
      }
    });

    return headers;
  };

  const renderRow = (stock: StockData, priority: boolean = false) => {
    const cells: React.ReactElement[] = [];

    visibleColumns.forEach(column => {
      switch (column) {
        case 'logo':
          cells.push(
            <td key="logo">
              <div className="logo-container">
                <CompanyLogo ticker={stock.ticker} size={32} priority={priority} />
              </div>
            </td>
          );
          break;
        case 'ticker':
          cells.push(
            <td key="ticker">
              <strong>{stock.ticker}</strong>
            </td>
          );
          break;
        case 'companyName':
          cells.push(
            <td key="companyName" className="company-name">
              {getCompanyName(stock.ticker)}
            </td>
          );
          break;
        case 'currentPrice':
          cells.push(
            <td key="currentPrice">
              {isFinite(Number(stock.currentPrice))
                ? Number(stock.currentPrice).toFixed(2)
                : '0.00'}
            </td>
          );
          break;
        case 'percentChange':
          cells.push(
            <td key="percentChange" className={stock.percentChange >= 0 ? 'positive' : 'negative'}>
              {stock.percentChange >= 0 ? '+' : ''}{stock.percentChange?.toFixed(2) || '0.00'}%
            </td>
          );
          break;
        case 'marketCap':
          cells.push(
            <td key="marketCap">
              {formatBillions(stock.marketCap)}
            </td>
          );
          break;
        case 'marketCapDiff':
          cells.push(
            <td key="marketCapDiff" className={stock.marketCapDiff >= 0 ? 'positive' : 'negative'}>
              {stock.marketCapDiff >= 0 ? '+' : ''}{stock.marketCapDiff?.toFixed(2) || '0.00'}
            </td>
          );
          break;
        case 'favorites':
          const isFavorited = isFavorite(stock.ticker);
          cells.push(
            <td key="favorites">
              <button
                className={`favorite-btn ${isFavorited ? 'favorited' : ''}`}
                onClick={() => onToggleFavorite(stock.ticker)}
                title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFavorited ? '★' : '☆'}
              </button>
            </td>
          );
          break;
      }
    });

    return cells;
  };

  if (loading) {
    return (
      <div className="loading-indicator">
        <div className="animate-spin">Loading...</div>
      </div>
    );
  }

  return (
    <div className="adaptive-table-container">
      {/* Device indicator for debugging */}
      {process.env.NODE_ENV === 'development' && (
        <div className="device-indicator">
          {isMobile ? '📱 Mobile' : isTablet ? '📱 Tablet' : '🖥️ Desktop'}
          - {visibleColumns.length} columns visible
        </div>
      )}

      <table className="adaptive-table">
        <thead>
          <tr>
            {renderHeader()}
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock, index) => (
            <tr key={stock.ticker}>
              {renderRow(stock, index < 25)} {/* Priority loading pre prvých 25 logov */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; 