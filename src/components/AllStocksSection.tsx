/**
 * All Stocks Section Component
 */

import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { SectionIcon } from './SectionIcon';
import { StockSearchBar } from './StockSearchBar';
import { StockTableRow } from './StockTableRow';
import { StockCardMobile } from './StockCardMobile';
import { SectionLoader } from './SectionLoader';
import { CustomDropdown } from './CustomDropdown';
import { StockData } from '@/lib/types';
import { formatSectorName } from '@/lib/utils/format';

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
  // Mobile UX: scroll container is not window, so we need an explicit load trigger
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  totalCount?: number;
  selectedSector: string;
  selectedIndustry: string;
  onSectorChange: (value: string) => void;
  onIndustryChange: (value: string) => void;
  uniqueSectors: string[];
  availableIndustries: string[];
}

// Table header configuration - Desktop (full)
const TABLE_HEADERS_DESKTOP: { key?: SortKey; label: string; sortable: boolean }[] = [
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

// Table header configuration - Mobile (5 columns only)
const TABLE_HEADERS_MOBILE: { key?: SortKey; label: string; sortable: boolean }[] = [
  { label: 'Logo', sortable: false },
  { key: 'ticker', label: 'Ticker', sortable: true },
  { key: 'percentChange', label: '% Change', sortable: true },
  { key: 'marketCapDiff', label: 'Cap Diff', sortable: true },
  { label: 'Action', sortable: false },
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
  onLoadMore,
  isLoadingMore = false,
  totalCount,
  selectedSector,
  selectedIndustry,
  onSectorChange,
  onIndustryChange,
  uniqueSectors,
  availableIndustries
}: AllStocksSectionProps) {
  const [showFilters, setShowFilters] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
    ...uniqueSectors.map(sector => ({ value: sector, label: formatSectorName(sector) }))
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

  // Mobile sort chips
  const mobileSortOptions: { key: SortKey; label: string }[] = useMemo(() => ([
    { key: 'percentChange', label: '% Change' },
    { key: 'marketCapDiff', label: 'Cap Diff' },
    { key: 'currentPrice', label: 'Price' },
    { key: 'marketCap', label: 'Mkt Cap' },
    { key: 'ticker', label: 'Ticker' },
  ]), []);

  // Mobile: Infinite load within the mobile scroll container (not window)
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const root = el.closest('.mobile-app-screen') as HTMLElement | null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (isLoadingMore) return;
        if (!hasMore) return;
        onLoadMore();
      },
      {
        root: root ?? null,
        rootMargin: '600px 0px 600px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore]);

  return (
    <section className="all-stocks">
      {/* Desktop Header */}
      <div className="hidden lg:block section-header">
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

      {/* Mobile: Sticky Filter Bar */}
      <div className="lg:hidden mobile-filters">
        <div className="mobile-filters-container">
          <div className="mobile-search-row">
            <div className="mobile-search-grow">
              <StockSearchBar
                searchTerm={searchTerm}
                onSearchChange={onSearchChange}
              />
            </div>
            <button
              type="button"
              className="mobile-filters-toggle"
              onClick={() => setShowFilters(v => !v)}
              aria-expanded={showFilters}
            >
              Filters
            </button>
          </div>

          <div className="mobile-sort-row" role="tablist" aria-label="Sort stocks">
            {mobileSortOptions.map(opt => {
              const active = sortKey === opt.key;
              const icon = active ? (ascending ? '▲' : '▼') : '';
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`sort-chip ${active ? 'active' : ''}`}
                  onClick={() => onSort(opt.key)}
                  role="tab"
                  aria-selected={active}
                >
                  <span className="sort-chip-label">{opt.label}</span>
                  {icon && <span className="sort-chip-icon">{icon}</span>}
                </button>
              );
            })}
          </div>

          <div className="mobile-results-row">
            <span className="mobile-results-text">
              Showing {displayedStocks.length}{typeof totalCount === 'number' ? ` / ${totalCount}` : ''}
            </span>
            {(selectedSector !== 'all' || selectedIndustry !== 'all' || searchTerm.trim().length > 0) && (
              <button
                type="button"
                className="mobile-clear-btn"
                onClick={() => {
                  onSearchChange('');
                  handleSectorChange('all');
                  onIndustryChange('all');
                }}
              >
                Clear
              </button>
            )}
          </div>

          {showFilters && (
            <div className="mobile-filters-row">
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
          )}
        </div>
      </div>

      {loading ? (
        <SectionLoader message="Loading stocks..." />
      ) : (
        <>
          {/* Mobile: Cards layout */}
          <div className="lg:hidden">
            {displayedStocks.length === 0 ? (
              <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                No stocks to display.
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
                {displayedStocks.map((stock, index) => (
                  <StockCardMobile
                    key={stock.ticker}
                    stock={stock}
                    isFavorite={isFavorite(stock.ticker)}
                    onToggleFavorite={favoriteHandlers.get(stock.ticker) || (() => onToggleFavorite(stock.ticker))}
                    displayMode={
                      sortKey === 'marketCapDiff'
                        ? 'capDiff'
                        : sortKey === 'marketCap'
                          ? 'cap'
                          : 'default'
                    }
                    priority={index < 100}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden lg:block table-wrapper-mobile-safe">
            <table>
              <thead>
                <tr>
                  {TABLE_HEADERS_DESKTOP.map((header, index) => (
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
                      priority={index < 100}
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

          {/* Mobile: infinite loading sentinel + fallback button */}
          <div className="lg:hidden">
            <div ref={sentinelRef} style={{ height: 1 }} />
            {hasMore && onLoadMore && (
              <div className="mobile-load-more">
                <button
                  type="button"
                  className="mobile-load-more-btn"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
});
