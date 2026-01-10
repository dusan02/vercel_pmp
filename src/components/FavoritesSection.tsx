/**
 * Favorites Section Component
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { SortKey } from '@/hooks/useSortableData';
import { SectionIcon } from './SectionIcon';
import { StockTableRow } from './StockTableRow';
import { StockCardMobile } from './StockCardMobile';
import { SectionLoader } from './SectionLoader';
import { StockData } from '@/lib/types';

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
    // Update URL and trigger navigation in HomePage
    router.push('/?tab=allStocks');
    // Also try to trigger navigation via custom event (if HomePage listens)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mobile-nav-change', { detail: 'allStocks' }));
    }
  };

  if (loading) {
    return (
      <section className="favorites">
        <div className="section-header">
          <div className="header-main">
            <h2>
              <SectionIcon type="star" size={20} className="section-icon" />
              <span>Favorites</span>
            </h2>
          </div>
        </div>
        <SectionLoader message="Loading favorites..." />
      </section>
    );
  }

  if (favoriteStocks.length === 0) {
    return (
      <section className="favorites">
        <div className="section-header">
          <div className="header-main">
            <h2>
              <SectionIcon type="star" size={20} className="section-icon" />
              <span>Favorites</span>
            </h2>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
          <span>No favorites yet.</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Tap ☆ next to a stock to add it here.
          </span>
          <button
            onClick={handleBrowseStocks}
            className="mt-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            Browse stocks →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="favorites">
      <div className="section-header">
        <div className="header-main">
          <h2>
            <SectionIcon type="star" size={20} className="section-icon" />
            <span>Favorites</span>
          </h2>
        </div>
      </div>

      {/* Mobile: Cards layout */}
      <div className="lg:hidden">
        <div className="w-full bg-white dark:bg-gray-900 border-0 rounded-none overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
          {/* Header row (mobile) - clickable for sorting */}
          <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-white/5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            {sortKey === 'marketCapDiff' ? (
              <div className="grid items-center gap-x-2 min-w-0 [grid-template-columns:40px_minmax(56px,1fr)_72px_72px_44px]">
                <div className="text-center">Logo</div>
                <button
                  type="button"
                  onClick={() => onSort('ticker')}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Sort by ticker"
                >
                  Ticker
                </button>
                <button
                  type="button"
                  onClick={() => onSort('marketCap')}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Sort by market cap"
                >
                  Mkt Cap
                </button>
                <button
                  type="button"
                  onClick={() => onSort('marketCapDiff')}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Sort by market cap diff"
                >
                  Δ
                  <span className="text-[10px]">{ascending ? '▲' : '▼'}</span>
                </button>
                <div className="text-center">★</div>
              </div>
            ) : sortKey === 'marketCap' ? (
              <div className="grid items-center gap-x-2 min-w-0 [grid-template-columns:40px_minmax(56px,1fr)_96px_56px_44px]">
                <div className="text-center">Logo</div>
                <button
                  type="button"
                  onClick={() => onSort('ticker')}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Sort by ticker"
                >
                  Ticker
                </button>
                <button
                  type="button"
                  onClick={() => onSort('marketCap')}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Sort by market cap"
                >
                  Mkt Cap
                  <span className="text-[10px]">{ascending ? '▲' : '▼'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSort('percentChange')}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Sort by percent change"
                >
                  %
                </button>
                <div className="text-center">★</div>
              </div>
            ) : (
              <div className="grid items-center gap-x-2 min-w-0 [grid-template-columns:40px_minmax(56px,1fr)_96px_56px_44px]">
                <div className="text-center">Logo</div>
                <button
                  type="button"
                  onClick={() => onSort('ticker')}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Sort by ticker"
                >
                  Ticker
                  {sortKey === 'ticker' && (
                    <span className="text-[10px]">{ascending ? '▲' : '▼'}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSort('currentPrice')}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Sort by price"
                >
                  Price
                  {sortKey === 'currentPrice' && (
                    <span className="text-[10px]">{ascending ? '▲' : '▼'}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSort('percentChange')}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Sort by percent change"
                >
                  %
                  {sortKey === 'percentChange' && (
                    <span className="text-[10px]">{ascending ? '▲' : '▼'}</span>
                  )}
                </button>
                <div className="text-center">★</div>
              </div>
            )}
          </div>
          {favoriteStocks.map((stock, index) => (
            <StockCardMobile
              key={stock.ticker}
              stock={stock}
              isFavorite={isFavorite(stock.ticker)}
              onToggleFavorite={() => onToggleFavorite(stock.ticker)}
              displayMode={
                sortKey === 'marketCapDiff'
                  ? 'capDiff'
                  : sortKey === 'marketCap'
                    ? 'cap'
                    : 'default'
              }
              priority={index < 10} // Only first 10 items have priority loading
            />
          ))}
        </div>
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden lg:block table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Logo</th>
              <th onClick={() => onSort("ticker" as SortKey)} className={`sortable ${sortKey === "ticker" ? "active-sort" : ""}`}>
                Ticker
              </th>
              <th>Company</th>
              <th onClick={() => onSort("sector" as SortKey)} className={`sortable ${sortKey === "sector" ? "active-sort" : ""}`}>
                Sector
              </th>
              <th onClick={() => onSort("industry" as SortKey)} className={`sortable ${sortKey === "industry" ? "active-sort" : ""}`}>
                Industry
              </th>
              <th onClick={() => onSort("marketCap" as SortKey)} className={`sortable ${sortKey === "marketCap" ? "active-sort" : ""}`}>
                Market Cap
              </th>
              <th onClick={() => onSort("marketCapDiff" as SortKey)} className={`sortable ${sortKey === "marketCapDiff" ? "active-sort" : ""}`}>
                Cap Diff
              </th>
              <th onClick={() => onSort("currentPrice" as SortKey)} className={`sortable ${sortKey === "currentPrice" ? "active-sort" : ""}`}>
                Price
              </th>
              <th onClick={() => onSort("percentChange" as SortKey)} className={`sortable ${sortKey === "percentChange" ? "active-sort" : ""}`}>
                % Change
              </th>
              <th>Favorites</th>
            </tr>
          </thead>
          <tbody>
            {favoriteStocks.map((stock, index) => (
              <StockTableRow
                key={stock.ticker}
                stock={stock}
                isFavorite={isFavorite(stock.ticker)}
                onToggleFavorite={() => onToggleFavorite(stock.ticker)}
                priority={true}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

