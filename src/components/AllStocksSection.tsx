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
import { Star } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  selectedSectors: string[];
  selectedIndustries: string[];
  onSectorsChange: (value: string[]) => void;
  onIndustriesChange: (value: string[]) => void;
  uniqueSectors: string[];
  availableIndustries: string[];
}

// Table header configuration - Desktop (full)
const TABLE_HEADERS_DESKTOP: { key?: SortKey; label: string; sortable: boolean; className?: string }[] = [
  { label: 'Logo', sortable: false, className: 'hidden md:table-cell text-center' }, // Changed from lg to md
  { key: 'ticker', label: 'Ticker', sortable: true },
  { label: 'Company', sortable: false, className: 'hidden md:table-cell' }, // Changed from lg to md
  { key: 'sector', label: 'Sector', sortable: true, className: 'hidden md:table-cell' }, // Changed from lg to md
  { key: 'industry', label: 'Industry', sortable: true, className: '!text-left hidden md:table-cell' }, // Changed from lg to md
  { key: 'marketCap', label: 'Market Cap', sortable: true, className: 'whitespace-nowrap hidden md:table-cell text-center' }, // Changed from lg to md
  { key: 'marketCapDiff', label: 'Cap Diff', sortable: true, className: 'hidden md:table-cell text-center' }, // Changed from lg to md
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
  selectedSectors,
  selectedIndustries,
  onSectorsChange,
  onIndustriesChange,
  uniqueSectors,
  availableIndustries
}: AllStocksSectionProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const handleRowClick = useCallback((stock: StockData) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mobile-nav-change', {
        detail: { tab: 'analysis', ticker: stock.ticker }
      }));
    }
  }, []);

  // Reset industries when sectors change
  const handleSectorsChange = useCallback((value: string[]) => {
    onSectorsChange(value);
    if (value.length === 0) {
      onIndustriesChange([]);
    }
  }, [onSectorsChange, onIndustriesChange]);

  // Reset industries when sector changes and current industries are not available
  useEffect(() => {
    if (selectedSectors.length > 0 && selectedIndustries.length > 0) {
      const stillAvailable = selectedIndustries.filter(i => availableIndustries.includes(i));
      if (stillAvailable.length !== selectedIndustries.length) {
        onIndustriesChange(stillAvailable);
      }
    }
  }, [selectedSectors, availableIndustries, selectedIndustries, onIndustriesChange]);

  // Prepare dropdown options (no "All" option needed — empty selection = all)
  const sectorOptions = useMemo(() =>
    uniqueSectors.map(sector => ({ value: sector, label: formatSectorName(sector) }))
  , [uniqueSectors]);

  const industryOptions = useMemo(() =>
    availableIndustries.map(industry => ({ value: industry, label: industry }))
  , [availableIndustries]);

  // Column Definitions for UniversalTable
  const columns: ColumnDef<StockData>[] = useMemo(() => [
    {
      key: 'logo',
      header: 'Logo',
      align: 'left',
      className: 'hidden lg:table-cell',
      width: '72px',
      render: (stock) => (
        <div className="flex justify-center items-center w-full">
          <CompanyLogo ticker={stock.ticker} size={44} />
        </div>
      )
    },
    {
      key: 'ticker',
      header: 'Stock', // Renamed from 'Ticker' to unify Stock/Name space
      sortable: true,
      align: 'left',
      showInMobileSort: true,
      mobileWidth: 'w-28', // Increased to cover logo + ticker space
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
      key: isDesktop ? 'marketCap' : 'marketCapDiffMobile',
      header: isDesktop ? 'Market Cap' : 'M Cap',
      sortable: true,
      align: 'right',
      className: 'whitespace-nowrap hidden lg:table-cell',
      showInMobileSort: true,
      mobileWidth: 'flex-1',
      render: (stock) => <span className="tabular-nums block w-full text-right">{formatBillions(stock.marketCap)}</span>
    },
    {
      key: 'marketCapDiff',
      header: 'Cap Diff',
      sortable: isDesktop, // Only sortable on desktop, on mobile we use merged Cap column
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
      key: isDesktop ? 'currentPrice' : 'percentChange',
      header: 'Price',
      sortable: true,
      align: 'right',
      showInMobileSort: true,
      mobileWidth: 'w-20',
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
      sortable: isDesktop, // Only sortable on desktop, on mobile we use merged Price column
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
      header: <Star size={18} />,
      align: 'center',
      width: '88px',
      showInMobileSort: true,
      mobileWidth: 'w-10', // Slightly smaller for the icon
      render: (stock) => {
        const fav = isFavorite(stock.ticker);
        return (
          <button
            className={`favorite-btn ${fav ? 'favorited' : ''} flex justify-center w-full`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(stock.ticker);
            }}
            aria-label={fav ? `Remove ${stock.ticker} from favorites` : `Add ${stock.ticker} to favorites`}
          >
            <Star size={20} fill={fav ? "currentColor" : "none"} strokeWidth={2} />
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
            <h2 className="flex items-center gap-3 text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white m-0 relative -top-1.5">
              <SectionIcon type="globe" size={28} className="text-gray-900 dark:text-white shrink-0" />
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
                value={selectedSectors}
                onChange={handleSectorsChange}
                options={sectorOptions}
                className="sector-filter w-72"
                ariaLabel="Filter by sector"
                placeholder="All Sectors"
                multiple
                searchable
              />
              <CustomDropdown
                value={selectedIndustries}
                onChange={onIndustriesChange}
                options={industryOptions}
                className="industry-filter w-72"
                ariaLabel="Filter by industry"
                placeholder="All Industries"
                multiple
                searchable
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Header: Title + Search Row */}
      <div className="lg:hidden px-4 mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl lg:text-3xl font-bold text-gray-900 dark:text-white m-0 relative -top-0.5 whitespace-nowrap">
          <SectionIcon type="globe" size={28} className="text-gray-900 dark:text-white shrink-0" />
          <span>All Stocks</span>
        </h2>
        <div className="flex-1 min-w-0">
          <StockSearchBar
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            placeholder="Search..."
          />
        </div>
      </div>

      {/* Mobile: Sticky Filter Bar */}
      <div className="lg:hidden mobile-filters">
        <div className="mobile-filters-container">

          {/* Dropdowns - side by side */}
          <div className="mobile-filters-row mb-2 flex gap-2">
            <div className="flex-1 min-w-0">
              <CustomDropdown
                value={selectedSectors}
                onChange={handleSectorsChange}
                options={sectorOptions}
                className="sector-filter w-full"
                ariaLabel="Filter by sector"
                placeholder="All Sectors"
                multiple
                searchable
              />
            </div>
            <div className="flex-1 min-w-0">
              <CustomDropdown
                value={selectedIndustries}
                onChange={onIndustriesChange}
                options={industryOptions}
                className="industry-filter w-full"
                ariaLabel="Filter by industry"
                placeholder="All Industries"
                multiple
                searchable
              />
            </div>
          </div>

          {/* Active filters chips */}
          {(selectedSectors.length > 0 || selectedIndustries.length > 0 || searchTerm.trim().length > 0) && (
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
              {selectedSectors.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSectorsChange(selectedSectors.filter(x => x !== s))}
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1"
                  aria-label={`Remove ${s} filter`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <span className="max-w-[160px] truncate">{formatSectorName(s)}</span>
                  <span className="opacity-80">×</span>
                </button>
              ))}
              {selectedIndustries.map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onIndustriesChange(selectedIndustries.filter(x => x !== i))}
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center gap-1"
                  aria-label={`Remove ${i} filter`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <span className="max-w-[160px] truncate">{i}</span>
                  <span className="opacity-80">×</span>
                </button>
              ))}
            </div>
          )}

          {/* Results count removed as requested */}
          {(selectedSectors.length > 0 || selectedIndustries.length > 0 || searchTerm.trim().length > 0) && (
            <div className="mobile-results-row">
              <button
                type="button"
                className="mobile-clear-btn ml-auto"
                onClick={() => {
                  onSearchChange('');
                  handleSectorsChange([]);
                  onIndustriesChange([]);
                }}
              >
                Clear all filters
              </button>
            </div>
          )}
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
        onRowClick={handleRowClick}
        emptyMessage={(selectedSectors.length > 0 || selectedIndustries.length > 0 || searchTerm.trim().length > 0)
          ? 'No results for the selected filters.'
          : 'No stocks to display.'}
        renderMobileCard={(stock) => (
          <StockCardMobile
            stock={stock}
            isFavorite={isFavorite(stock.ticker)}
            onToggleFavorite={() => onToggleFavorite(stock.ticker)}
            onClick={() => handleRowClick(stock)}
          />
        )}
      />


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
