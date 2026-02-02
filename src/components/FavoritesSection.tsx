/**
 * Favorites Section Component
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { SortKey } from '@/hooks/useSortableData';
import { SectionIcon } from './SectionIcon';
import { UniversalTable, ColumnDef } from './UniversalTable';
import { StockCardMobile } from './StockCardMobile';
import { SectionLoader } from './SectionLoader';
import { StockData } from '@/lib/types';
import { formatSectorName, formatBillions, formatMarketCapDiff, formatPrice, formatPercent } from '@/lib/utils/format';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';

interface FavoritesSectionProps {
  favoriteStocks: StockData[];
  loading: boolean;
  sortKey: SortKey | null;
  ascending: boolean;
  onSort: (key: SortKey) => void;
  onToggleFavorite: (ticker: string) => void;
  isFavorite: (ticker: string) => boolean;
}

export function FavoritesSection({
  favoriteStocks,
  loading,
  sortKey,
  ascending,
  onSort,
  onToggleFavorite,
  isFavorite
}: FavoritesSectionProps) {
  const router = useRouter();

  const handleBrowseStocks = () => {
    // On mobile: trigger tab change via custom event
    if (typeof window !== 'undefined') {
      // Trigger navigation via custom event for both mobile and desktop (since both use tab-based navigation)
      window.dispatchEvent(new CustomEvent('mobile-nav-change', { detail: 'allStocks' }));

      // Update URL
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'allStocks');
      window.history.pushState({}, '', url.toString());
    }
  };

  // Column Definitions for UniversalTable (Identical to AllStocksSection for consistency)
  const columns: ColumnDef<StockData>[] = React.useMemo(() => [
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

  const emptyState = (
    <div
      className="flex flex-col items-center justify-center gap-3 py-16 px-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10"
    >
      <div className="text-6xl mb-2 opacity-30 grayscale">
        ⭐
      </div>
      <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
        No favorites yet
      </span>
      <span className="text-sm text-center max-w-xs text-gray-500 dark:text-gray-400">
        Tap ☆ next to a stock to add it here
      </span>
      <button
        onClick={handleBrowseStocks}
        className="mt-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold transition-colors hover:bg-blue-700"
        style={{
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        }}
        onTouchStart={(e) => { e.currentTarget.style.opacity = '0.8'; }}
        onTouchEnd={(e) => { e.currentTarget.style.opacity = '1'; }}
      >
        Browse stocks →
      </button>
    </div>
  );

  return (
    <section className="favorites">
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center">
          <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--clr-text)] m-0 relative -top-1.5">
            <SectionIcon type="star" size={24} className="text-[var(--clr-text)]" />
            <span>Favorites</span>
          </h2>
        </div>
      </div>

      <UniversalTable
        data={favoriteStocks}
        columns={columns}
        keyExtractor={(item) => item.ticker}
        isLoading={loading}
        sortKey={sortKey}
        ascending={ascending}
        onSort={onSort}
        emptyMessage={emptyState}
        forceTable={true}
      />
    </section>
  );
}
