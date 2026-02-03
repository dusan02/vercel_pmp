/**
 * All Stocks Section Component
 */

import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SectionIcon } from './SectionIcon';
import { StockSearchBar } from './StockSearchBar';
import { UniversalTable, ColumnDef } from './UniversalTable';
import { StockCardMobile } from './StockCardMobile';
import { SectionLoader } from './SectionLoader';
import { CustomDropdown } from './CustomDropdown';
import { StockData } from '@/lib/types';
import { formatSectorName, formatBillions, formatMarketCapDiff, formatPrice, formatPercent } from '@/lib/utils/format';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';

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
const TABLE_HEADERS_DESKTOP: { key?: SortKey; label: string; sortable: boolean; className?: string }[] = [
  { label: 'Logo', sortable: false, className: 'hidden lg:table-cell text-center' },
  { key: 'ticker', label: 'Ticker', sortable: true },
  { label: 'Company', sortable: false, className: 'hidden lg:table-cell' },
  { key: 'sector', label: 'Sector', sortable: true, className: 'hidden lg:table-cell' },
  { key: 'industry', label: 'Industry', sortable: true, className: '!text-left hidden lg:table-cell' },
  { key: 'marketCap', label: 'Market Cap', sortable: true, className: 'whitespace-nowrap hidden lg:table-cell text-center' },
  { key: 'marketCapDiff', label: 'Cap Diff', sortable: true, className: 'hidden lg:table-cell text-center' },
  { key: 'currentPrice', label: 'Price', sortable: true, className: 'text-center' },
  { key: 'percentChange', label: '% Change', sortable: true, className: 'whitespace-nowrap text-center' },
  { label: 'Favorites', sortable: false, className: 'text-center' },
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
  const isDesktop = useMediaQuery('(min-width: 1024px)');
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

  // Column Definitions for UniversalTable
  const columns: ColumnDef<StockData>[] = useMemo(() => [
    {
      key: 'logo',
      header: 'Logo',
      align: 'center',
      className: 'hidden lg:table-cell',
      width: '60px',
      render: (stock) => (
        <div className="flex justify-center">
          <CompanyLogo ticker={stock.ticker} {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} size={32} />
        </div>
      )
    },
    {
      key: 'ticker',
      header: 'Ticker',
      sortable: true,
      render: (stock) => <strong>{stock.ticker}</strong>
    },
    {
      key: 'companyName',
      header: 'Company',
      className: 'hidden lg:table-cell',
      render: (stock) => <span className="block truncate max-w-[180px]">{getCompanyName(stock.ticker)}</span>
    },
    {
      key: 'sector',
      header: 'Sector',
      sortable: true,
      className: 'hidden lg:table-cell',
      render: (stock) => formatSectorName(stock.sector)
    },
    {
      key: 'industry',
      header: 'Industry',
      sortable: true,
      className: 'hidden lg:table-cell',
      render: (stock) => stock.industry || 'N/A'
    },
    {
      key: 'marketCap',
      header: 'Market Cap',
      sortable: true,
      align: 'center',
      className: 'whitespace-nowrap hidden lg:table-cell',
      render: (stock) => <span className="tabular-nums block w-full text-right">{formatBillions(stock.marketCap)}</span>
    },
    {
      key: 'marketCapDiff',
      header: 'Cap Diff',
      sortable: true,
      align: 'center',
      className: 'hidden lg:table-cell',
      render: (stock) => {
        const diff = stock.marketCapDiff ?? 0;
        return (
          <span className={`tabular-nums block w-full text-right ${diff >= 0 ? 'positive' : 'negative'}`}>
            {formatMarketCapDiff(diff)}
          </span>
        );
      }
    },
    {
      key: 'currentPrice',
      header: 'Price',
      sortable: true,
      align: 'center',
      render: (stock) => {
        const price = stock.currentPrice ?? 0;
        return (
          <span className="tabular-nums block w-full text-right">
            {isFinite(price) ? formatPrice(price) : '—'}
          </span>
        );
      }
    },
    {
      key: 'percentChange',
      header: '% Change',
      sortable: true,
      align: 'center',
      width: '100px',
      render: (stock) => {
        const pct = stock.percentChange ?? 0;
        return (
          <span className={`tabular-nums block w-full text-right ${pct >= 0 ? 'positive' : 'negative'}`}>
            {formatPercent(pct)}
          </span>
        );
      }
    },
    {
      key: 'favorites',
      header: 'Favorites',
      align: 'center',
      width: '1%',
      render: (stock) => {
        const fav = isFavorite(stock.ticker);
        return (
          <button
            className={`favorite-btn ${fav ? 'favorited' : ''} inline-flex justify-center w-full`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(stock.ticker);
            }}
            title={fav ? 'Remove from favorites' : 'Add to favorites'}
          >
            {fav ? '★' : '☆'}
          </button>
        );
      }
    }
  ], [isFavorite, onToggleFavorite]);


  // Mobile Sort Options (Pass props down implicitly via internal sort handler of component?) 
  // Wait, AllStocksSection receives sortKey and ascending.
  // The component UniversalTable calls onSort(key).
  // Everything aligns.

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
    <section className="all-stocks relative">
      {/* Loading Overlay for Remaining Stocks */}
      {isLoadingMore && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center lg:hidden">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-2xl max-w-xs mx-4">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Loading all stocks...
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This may take a few seconds
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Header - only rendered on desktop */}
      {isDesktop && (
        <div className="flex items-center justify-between mb-4 px-4">
          <div className="flex items-center mr-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--clr-text)] m-0 relative -top-1.5">
              <SectionIcon type="globe" size={24} className="text-[var(--clr-text)]" />
              <span>All Stocks</span>
            </h2>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3 min-w-0">
            <div className="w-80 xl:w-96">
              <StockSearchBar
                searchTerm={searchTerm}
                onSearchChange={onSearchChange}
              />
            </div>
            <div className="flex items-center gap-3">
              <CustomDropdown
                value={selectedSector}
                onChange={handleSectorChange}
                options={sectorOptions}
                className="sector-filter w-72"
                ariaLabel="Filter by sector"
                placeholder="All Sectors"
              />
              <CustomDropdown
                value={selectedIndustry}
                onChange={onIndustryChange}
                options={industryOptions}
                className="industry-filter w-72"
                ariaLabel="Filter by industry"
                placeholder="All Industries"
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Section Title */}
      <div className="lg:hidden px-3 py-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
          <SectionIcon type="globe" size={20} className="section-icon" />
          <span>All Stocks</span>
        </h2>
      </div>

      {/* Mobile: Sticky Filter Bar */}
      <div className="lg:hidden mobile-filters">
        <div className="mobile-filters-container">
          {/* Search bar - always visible */}
          <div className="mobile-search-row mb-3">
            <StockSearchBar
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
            />
          </div>

          {/* Dropdowns - always visible */}
          <div className="mobile-filters-row mb-2">
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

          {/* Active filters chips */}
          {(selectedSector !== 'all' || selectedIndustry !== 'all' || searchTerm.trim().length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2 mb-2">
              {searchTerm.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80 flex items-center gap-1"
                  aria-label="Clear search"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <span className="opacity-80">Search</span>
                  <span className="max-w-[140px] truncate font-mono tabular-nums">{searchTerm}</span>
                  <span className="opacity-80">×</span>
                </button>
              )}
              {selectedSector !== 'all' && (
                <button
                  type="button"
                  onClick={() => handleSectorChange('all')}
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80 flex items-center gap-1"
                  aria-label="Clear sector filter"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <span className="opacity-80">Sector</span>
                  <span className="max-w-[160px] truncate">{formatSectorName(selectedSector)}</span>
                  <span className="opacity-80">×</span>
                </button>
              )}
              {selectedIndustry !== 'all' && (
                <button
                  type="button"
                  onClick={() => onIndustryChange('all')}
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80 flex items-center gap-1"
                  aria-label="Clear industry filter"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <span className="opacity-80">Industry</span>
                  <span className="max-w-[160px] truncate">{selectedIndustry}</span>
                  <span className="opacity-80">×</span>
                </button>
              )}
            </div>
          )}

          {/* Results count */}
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
                Clear all
              </button>
            )}
          </div>
        </div>
      </div>

      <UniversalTable
        data={displayedStocks}
        columns={columns}
        keyExtractor={(item) => item.ticker}
        isLoading={loading}
        sortKey={sortKey}
        ascending={ascending}
        onSort={onSort}
        emptyMessage={(selectedSector !== 'all' || selectedIndustry !== 'all' || searchTerm.trim().length > 0)
          ? 'No results for the selected filters.'
          : 'No stocks to display.'}
        renderMobileCard={(stock) => (
          <StockCardMobile
            stock={stock}
            isFavorite={isFavorite(stock.ticker)}
            onToggleFavorite={() => onToggleFavorite(stock.ticker)}
          />
        )}
      // forceTable={true} // REMOVED to enable mobile cards
      />

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
    </section>
  );
});
