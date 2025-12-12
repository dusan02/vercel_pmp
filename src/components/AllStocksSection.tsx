/**
 * All Stocks Section Component
 */

import React, { useMemo, useCallback } from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { SectionIcon } from './SectionIcon';
import { StockSearchBar } from './StockSearchBar';
import { StockTableRow } from './StockTableRow';
import { SectionLoader } from './SectionLoader';
import { StockData } from '@/lib/types';

interface AllStocksSectionProps {
  displayedStocks: StockData[];
  loading: boolean;
  sortKey: SortKey | null;
  ascending: boolean;
  onSort: (key: SortKey) => void;
  onToggleFavorite: (ticker: string) => void;
  isFavorite: (ticker: string) => boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  hasMore: boolean;
}

// Table header configuration to reduce boilerplate
const TABLE_HEADERS: { key?: SortKey; label: string; sortable: boolean }[] = [
  { label: 'Logo', sortable: false },
  { key: 'ticker', label: 'Ticker', sortable: true },
  { label: 'Company', sortable: false },
  { key: 'sector', label: 'Sector', sortable: true },
  { key: 'industry', label: 'Industry', sortable: true },
  { key: 'marketCap', label: 'Market Cap', sortable: true },
  { key: 'currentPrice', label: 'Price', sortable: true },
  { key: 'percentChange', label: '% Change', sortable: true },
  { key: 'marketCapDiff', label: 'Cap Diff', sortable: true },
  { label: 'Favorites', sortable: false },
];

export const AllStocksSection = React.memo(function AllStocksSection({
  displayedStocks,
  loading,
  sortKey,
  ascending,
  onSort,
  onToggleFavorite,
  isFavorite,
  searchTerm,
  onSearchChange,
  hasMore
}: AllStocksSectionProps) {
  
  // Memoize favorite handlers per stock
  const favoriteHandlers = useMemo(() => {
    const handlers = new Map<string, () => void>();
    displayedStocks.forEach(stock => {
      handlers.set(stock.ticker, () => onToggleFavorite(stock.ticker));
    });
    return handlers;
  }, [displayedStocks, onToggleFavorite]);

  return (
    <section className="all-stocks">
      <div className="section-header">
        <div className="header-main">
          <h2>
            <SectionIcon type="globe" size={20} className="section-icon" />
            <span>All Stocks</span>
          </h2>
        </div>
        <div className="header-search-inline">
          <StockSearchBar
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
          />
        </div>
      </div>

      {loading ? (
        <SectionLoader message="Loading stocks..." />
      ) : (
        <>
          <table>
            <thead>
              <tr>
                {TABLE_HEADERS.map((header, index) => (
                  <th
                    key={index}
                    onClick={header.sortable && header.key ? () => onSort(header.key!) : undefined}
                    className={header.sortable ? `sortable ${sortKey === header.key ? "active-sort" : ""}` : undefined}
                  >
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedStocks.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--clr-subtext)' }}>
                    No stocks to display.
                  </td>
                </tr>
              ) : (
                displayedStocks.map((stock, index) => (
                  <StockTableRow
                    key={stock.ticker}
                    stock={stock}
                    isFavorite={isFavorite(stock.ticker)}
                    onToggleFavorite={favoriteHandlers.get(stock.ticker) || (() => onToggleFavorite(stock.ticker))}
                    priority={index < 100} // Priority loading for first 100 visible rows
                  />
                ))
              )}
            </tbody>
          </table>

          {/* End of list indicator */}
          {!hasMore && displayedStocks.length > 0 && (
            <div className="end-of-list">
              <span>All stocks are displayed</span>
            </div>
          )}
        </>
      )}
    </section>
  );
});
