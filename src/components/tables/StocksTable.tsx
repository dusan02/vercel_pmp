'use client';

import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { EnhancedTable, ColumnDef } from './EnhancedTable';
import { StockCardMobile } from '../StockCardMobile';
import { SectionIcon } from '../SectionIcon';
import { StockSearchBar } from '../StockSearchBar';
import { CustomDropdown } from '../CustomDropdown';
import { StockData } from '@/lib/types';
import { formatSectorName, formatBillions, formatMarketCapDiff, formatPrice, formatPercent } from '@/lib/utils/format';
import CompanyLogo from '../CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';
import { Star, TrendingUp, TrendingDown, DollarSign, Building } from 'lucide-react';

interface StocksTableProps {
  data: StockData[];
  loading: boolean;
  sortKey: SortKey | null;
  ascending: boolean;
  onSort: (key: SortKey) => void;
  onToggleFavorite: (ticker: string) => void;
  isFavorite: (ticker: string) => boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  totalCount?: number;
  selectedSector: string;
  selectedIndustry: string;
  onSectorChange: (value: string) => void;
  onIndustryChange: (value: string) => void;
  uniqueSectors: string[];
  availableIndustries: string[];
  /** Table variant */
  variant?: 'default' | 'compact' | 'bordered';
  /** Show/hide filters */
  showFilters?: boolean;
  /** Enable sticky header */
  stickyHeader?: boolean;
  /** Custom title */
  title?: string;
  /** Show search bar */
  showSearch?: boolean;
}

export const StocksTable = React.memo(function StocksTable({
  data,
  loading,
  sortKey,
  ascending,
  onSort,
  onToggleFavorite,
  isFavorite,
  searchTerm,
  onSearchChange,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  totalCount,
  selectedSector,
  selectedIndustry,
  onSectorChange,
  onIndustryChange,
  uniqueSectors,
  availableIndustries,
  variant = 'default',
  showFilters = true,
  stickyHeader = true,
  title = 'Stocks',
  showSearch = true
}: StocksTableProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Handle row click - navigate to company analysis
  const handleRowClick = useCallback((stock: StockData) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mobile-nav-change', {
        detail: { tab: 'analysis', ticker: stock.ticker }
      }));
    }
  }, []);

  // Reset industry when sector changes
  const handleSectorChange = useCallback((value: string) => {
    onSectorChange(value);
    if (value === 'all') {
      onIndustryChange('all');
    }
  }, [onSectorChange, onIndustryChange]);

  // Reset industry when sector changes and current industry is not available
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

  // Enhanced column definitions with better UX
  const columns: ColumnDef<StockData>[] = useMemo(() => [
    {
      key: 'logo',
      header: '',
      align: 'center',
      width: '60px',
      priority: 'medium',
      className: 'hidden lg:table-cell',
      render: (stock) => (
        <div className="flex justify-center">
          <CompanyLogo ticker={stock.ticker} size={36} />
        </div>
      )
    },
    {
      key: 'ticker',
      header: 'Ticker',
      sortable: true,
      align: 'left',
      priority: 'high',
      showInMobileSort: true,
      mobileWidth: 'w-24',
      cell: (stock) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-sm">{stock.ticker}</span>
          {stock.isStale && (
            <span className="text-xs text-amber-500" title="Data may be stale">⚠️</span>
          )}
        </div>
      )
    },
    {
      key: 'companyName',
      header: 'Company',
      align: 'left',
      priority: 'low',
      className: 'hidden lg:table-cell',
      cell: (stock) => (
        <span className="block truncate max-w-[200px]" title={getCompanyName(stock.ticker)}>
          {getCompanyName(stock.ticker)}
        </span>
      )
    },
    {
      key: 'sector',
      header: 'Sector',
      sortable: true,
      align: 'left',
      priority: 'low',
      className: 'hidden lg:table-cell',
      cell: (stock) => (
        <div className="flex items-center gap-1">
          <Building className="w-3 h-3 text-gray-400" />
          <span className="truncate">{formatSectorName(stock.sector)}</span>
        </div>
      )
    },
    {
      key: 'industry',
      header: 'Industry',
      sortable: true,
      align: 'left',
      priority: 'low',
      className: 'hidden lg:table-cell',
      cell: (stock) => (
        <span className="truncate text-sm text-gray-600 dark:text-gray-400">
          {stock.industry || 'N/A'}
        </span>
      )
    },
    {
      key: 'marketCap',
      header: 'Market Cap',
      sortable: true,
      align: 'right',
      priority: 'high',
      showInMobileSort: true,
      mobileWidth: 'flex-1',
      cell: (stock) => {
        const marketCap = stock.marketCap || 0;
        return (
          <div className="flex items-center justify-end gap-1">
            <DollarSign className="w-3 h-3 text-gray-400" />
            <span className="font-mono tabular-nums">
              {formatBillions(marketCap)}
            </span>
          </div>
        );
      }
    },
    {
      key: 'marketCapDiffDesktop',
      header: 'Cap Δ',
      sortable: true,
      align: 'right',
      priority: 'medium',
      className: 'hidden lg:table-cell',
      cell: (stock) => {
        const diff = stock.marketCapDiff ?? 0;
        const isPositive = diff >= 0;
        return (
          <div className="flex items-center justify-end gap-1">
            {isPositive ? (
              <TrendingUp className="w-3 h-3 text-green-500" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-500" />
            )}
            <span className={`font-mono tabular-nums text-sm ${
              isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {formatMarketCapDiff(diff)}
            </span>
          </div>
        );
      }
    },
    {
      key: 'currentPrice',
      header: 'Price',
      sortable: true,
      align: 'right',
      priority: 'high',
      showInMobileSort: true,
      mobileWidth: 'w-20',
      cell: (stock) => {
        const price = stock.currentPrice ?? 0;
        return (
          <span className="font-mono tabular-nums font-semibold">
            {isFinite(price) ? formatPrice(price) : '—'}
          </span>
        );
      }
    },
    {
      key: 'percentChange',
      header: 'Change %',
      sortable: true,
      align: 'right',
      priority: 'high',
      showInMobileSort: true,
      mobileWidth: 'w-20',
      cell: (stock) => {
        const pct = stock.percentChange ?? 0;
        const isPositive = pct >= 0;
        return (
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            isPositive 
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
          }`}>
            {isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {formatPercent(pct)}
          </div>
        );
      }
    },
    {
      key: 'favorites',
      header: '',
      align: 'center',
      width: '60px',
      priority: 'medium',
      showInMobileSort: true,
      mobileWidth: 'w-12',
      disableRowClick: true,
      cell: (stock) => {
        const fav = isFavorite(stock.ticker);
        return (
          <button
            className={`p-2 rounded-lg transition-all duration-200 ${
              fav 
                ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' 
                : 'hover:bg-gray-100 text-gray-400 dark:hover:bg-gray-800 dark:text-gray-500'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(stock.ticker);
            }}
            aria-label={fav ? `Remove ${stock.ticker} from favorites` : `Add ${stock.ticker} to favorites`}
            title={fav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star 
              size={16} 
              fill={fav ? "currentColor" : "none"} 
              strokeWidth={2}
              className="transition-transform hover:scale-110"
            />
          </button>
        );
      }
    }
  ], [isFavorite, onToggleFavorite]);

  // Mobile infinite scroll setup
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
    <section className="stocks-table relative">
      {/* Loading Overlay */}
      {isLoadingMore && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center lg:hidden">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-2xl max-w-xs mx-4">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Loading more stocks...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <SectionIcon type="globe" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {title}
          </h2>
          {totalCount !== undefined && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({data.length} of {totalCount})
            </span>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      {showSearch && (
        <div className="mb-6 space-y-4">
          <StockSearchBar
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            placeholder="Search stocks..."
          />
          
          {showFilters && isDesktop && (
            <div className="flex gap-3">
              <CustomDropdown
                value={selectedSector}
                onChange={handleSectorChange}
                options={sectorOptions}
                placeholder="Select sector"
                className="min-w-[200px]"
              />
              <CustomDropdown
                value={selectedIndustry}
                onChange={onIndustryChange}
                options={industryOptions}
                placeholder="Select industry"
                className="min-w-[200px]"
              />
            </div>
          )}
        </div>
      )}

      {/* Enhanced Table */}
      <EnhancedTable
        data={data}
        columns={columns}
        keyExtractor={(item) => item.ticker}
        isLoading={loading}
        sortKey={sortKey}
        ascending={ascending}
        onSort={onSort}
        renderMobileCard={(stock) => (
          <StockCardMobile
            stock={stock}
            isFavorite={isFavorite(stock.ticker)}
            onToggleFavorite={() => onToggleFavorite(stock.ticker)}
          />
        )}
        variant={variant}
        stickyHeader={stickyHeader}
        emptyMessage={
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">
              <Building className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              No stocks found
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Try adjusting your search or filters
            </p>
          </div>
        }
      />

      {/* Load More Trigger for Mobile */}
      {hasMore && !isDesktop && (
        <div 
          ref={sentinelRef} 
          className="py-4 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          {isLoadingMore ? 'Loading...' : 'Scroll for more'}
        </div>
      )}
    </section>
  );
});

StocksTable.displayName = 'StocksTable';
