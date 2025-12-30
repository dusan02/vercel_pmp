/**
 * All Stocks Section Component
 */

import React, { useMemo, useCallback, useEffect } from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { SectionIcon } from './SectionIcon';
import { StockSearchBar } from './StockSearchBar';
import { StockTableRow } from './StockTableRow';
import { SectionLoader } from './SectionLoader';
import { CustomDropdown } from './CustomDropdown';
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
  selectedSector: string;
  selectedIndustry: string;
  onSectorChange: (value: string) => void;
  onIndustryChange: (value: string) => void;
  uniqueSectors: string[];
  availableIndustries: string[];
}

// Table header configuration to reduce boilerplate
const TABLE_HEADERS: { key?: SortKey; label: string; sortable: boolean }[] = [
  { label: 'Logo', sortable: false },
  { key: 'ticker', label: 'Ticker', sortable: true },
  { label: 'Company', sortable: false },
  { key: 'sector', label: 'Sector', sortable: true },
  { key: 'industry', label: 'Industry', sortable: true },
  { key: 'marketCap', label: 'Market Cap', sortable: true },
  { key: 'marketCapDiff', label: 'Cap Diff', sortable: true },
  { key: 'currentPrice', label: 'Price', sortable: true },
  { key: 'percentChange', label: '% Change', sortable: true },
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
  hasMore,
  selectedSector,
  selectedIndustry,
  onSectorChange,
  onIndustryChange,
  uniqueSectors,
  availableIndustries
}: AllStocksSectionProps) {

  // Reset industry when sector changes
  const handleSectorChange = useCallback((value: string) => {
    onSectorChange(value);
    if (value === 'all') {
      onIndustryChange('all');
    }
  }, [onSectorChange, onIndustryChange]);

  // Reset industry when sector changes and current industry is not available in new sector
  useEffect(() => {
    if (selectedSector !== 'all' && selectedIndustry !== 'all') {
      const isIndustryAvailable = availableIndustries.includes(selectedIndustry);
      if (!isIndustryAvailable) {
        onIndustryChange('all');
      }
    }
  }, [selectedSector, availableIndustries, selectedIndustry, onIndustryChange]);

  // Prepare dropdown options
  const sectorOptions = useMemo(() => [
    { value: 'all', label: 'All Sectors' },
    ...uniqueSectors.map(sector => ({ value: sector, label: sector }))
  ], [uniqueSectors]);

  const industryOptions = useMemo(() => [
    { value: 'all', label: 'All Industries' },
    ...availableIndustries.map(industry => ({ value: industry, label: industry }))
  ], [availableIndustries]);

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
        <div className="header-controls-inline">
          <div className="header-search-inline">
            <StockSearchBar
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
            />
          </div>
          <div className="header-filters-inline">
            <CustomDropdown
              value={selectedSector}
              onChange={handleSectorChange}
              options={sectorOptions}
              className="sector-filter"
              ariaLabel="Filter by sector"
              placeholder="All Sectors"
            />
            <CustomDropdown
              value={selectedIndustry}
              onChange={onIndustryChange}
              options={industryOptions}
              className="industry-filter"
              ariaLabel="Filter by industry"
              placeholder="All Industries"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <SectionLoader message="Loading stocks..." />
      ) : (
        <>
          {/* Responsive Table - Horizontal scroll on mobile */}
          <div className="table-wrapper-mobile-safe">
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
          </div>

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
