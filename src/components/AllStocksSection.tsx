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
  // Memoize sort handlers to prevent unnecessary re-renders
  const handleSortTicker = useCallback(() => onSort("ticker" as SortKey), [onSort]);
  const handleSortSector = useCallback(() => onSort("sector" as SortKey), [onSort]);
  const handleSortIndustry = useCallback(() => onSort("industry" as SortKey), [onSort]);
  const handleSortMarketCap = useCallback(() => onSort("marketCap" as SortKey), [onSort]);
  const handleSortCurrentPrice = useCallback(() => onSort("currentPrice" as SortKey), [onSort]);
  const handleSortPercentChange = useCallback(() => onSort("percentChange" as SortKey), [onSort]);
  const handleSortMarketCapDiff = useCallback(() => onSort("marketCapDiff" as SortKey), [onSort]);

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
                <th>Logo</th>
                <th onClick={handleSortTicker} className={`sortable ${sortKey === "ticker" ? "active-sort" : ""}`}>
                  Ticker
                </th>
                <th>Company</th>
                <th onClick={handleSortSector} className={`sortable ${sortKey === "sector" ? "active-sort" : ""}`}>
                  Sector
                </th>
                <th onClick={handleSortIndustry} className={`sortable ${sortKey === "industry" ? "active-sort" : ""}`}>
                  Industry
                </th>
                <th onClick={handleSortMarketCap} className={`sortable ${sortKey === "marketCap" ? "active-sort" : ""}`}>
                  Market Cap
                </th>
                <th onClick={handleSortCurrentPrice} className={`sortable ${sortKey === "currentPrice" ? "active-sort" : ""}`}>
                  Price
                </th>
                <th onClick={handleSortPercentChange} className={`sortable ${sortKey === "percentChange" ? "active-sort" : ""}`}>
                  % Change
                </th>
                <th onClick={handleSortMarketCapDiff} className={`sortable ${sortKey === "marketCapDiff" ? "active-sort" : ""}`}>
                  Cap Diff
                </th>
                <th>Favorites</th>
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
                    priority={index < 25} // Priority loading pre prvých 25 logov (above the fold)
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
