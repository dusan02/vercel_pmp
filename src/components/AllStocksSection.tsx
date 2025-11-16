/**
 * All Stocks Section Component
 */

import React from 'react';
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

export function AllStocksSection({
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
                <th onClick={() => onSort("ticker" as SortKey)} className={`sortable ${sortKey === "ticker" ? "active-sort" : ""}`}>
                  Ticker
                </th>
                <th>Company Name</th>
                <th onClick={() => onSort("sector" as SortKey)} className={`sortable ${sortKey === "sector" ? "active-sort" : ""}`}>
                  Sector
                </th>
                <th onClick={() => onSort("industry" as SortKey)} className={`sortable ${sortKey === "industry" ? "active-sort" : ""}`}>
                  Industry
                </th>
                <th onClick={() => onSort("marketCap" as SortKey)} className={`sortable ${sortKey === "marketCap" ? "active-sort" : ""}`}>
                  Market Cap
                </th>
                <th onClick={() => onSort("currentPrice" as SortKey)} className={`sortable ${sortKey === "currentPrice" ? "active-sort" : ""}`}>
                  Current Price
                </th>
                <th onClick={() => onSort("percentChange" as SortKey)} className={`sortable ${sortKey === "percentChange" ? "active-sort" : ""}`}>
                  % Change
                </th>
                <th onClick={() => onSort("marketCapDiff" as SortKey)} className={`sortable ${sortKey === "marketCapDiff" ? "active-sort" : ""}`}>
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
                displayedStocks.map((stock) => (
                  <StockTableRow
                    key={stock.ticker}
                    stock={stock}
                    isFavorite={isFavorite(stock.ticker)}
                    onToggleFavorite={() => onToggleFavorite(stock.ticker)}
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
}

