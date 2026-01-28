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
    // On mobile: trigger tab change via custom event
    if (typeof window !== 'undefined') {
      // Check if mobile (tab-based navigation)
      const isMobile = window.innerWidth <= 768;

      if (isMobile) {
        // Mobile: Change tab via custom event
        window.dispatchEvent(new CustomEvent('mobile-nav-change', { detail: 'allStocks' }));
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('tab', 'allStocks');
        window.history.pushState({}, '', url.toString());
      } else {
        // Desktop: Scroll to All Stocks section
        const allStocksSection = document.querySelector('.all-stocks');
        if (allStocksSection) {
          allStocksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
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
        <div
          className="flex flex-col items-center justify-center gap-3 py-16 px-4"
          style={{
            background: '#ffffff',
          }}
        >
          <div
            className="text-6xl mb-2"
            style={{
              opacity: 0.3,
            }}
          >
            ⭐
          </div>
          <span
            className="text-base font-semibold"
            style={{
              color: '#000000',
            }}
          >
            No favorites yet
          </span>
          <span
            className="text-sm text-center max-w-xs"
            style={{
              color: 'rgba(0, 0, 0, 0.6)',
            }}
          >
            Tap ☆ next to a stock to add it here
          </span>
          <button
            onClick={handleBrowseStocks}
            className="mt-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold transition-colors"
            style={{
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
            onTouchStart={(e) => {
              e.currentTarget.style.opacity = '0.8';
            }}
            onTouchEnd={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Browse stocks →
          </button>
        </div>
      </section>
    );
  }

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



      {/* Desktop: Table layout */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th className="hidden lg:table-cell">Logo</th>
              <th onClick={() => onSort("ticker" as SortKey)} className={`sortable ${sortKey === "ticker" ? "active-sort" : ""}`}>
                Ticker
              </th>
              <th className="hidden lg:table-cell">Company</th>
              <th onClick={() => onSort("sector" as SortKey)} className={`hidden lg:table-cell sortable ${sortKey === "sector" ? "active-sort" : ""}`}>
                Sector
              </th>
              <th onClick={() => onSort("industry" as SortKey)} className={`hidden lg:table-cell sortable !text-left ${sortKey === "industry" ? "active-sort" : ""}`}>
                Industry
              </th>
              <th onClick={() => onSort("marketCap" as SortKey)} className={`hidden lg:table-cell sortable whitespace-nowrap ${sortKey === "marketCap" ? "active-sort" : ""}`}>
                Market Cap
              </th>
              <th onClick={() => onSort("marketCapDiff" as SortKey)} className={`hidden lg:table-cell sortable ${sortKey === "marketCapDiff" ? "active-sort" : ""}`}>
                Cap Diff
              </th>
              <th onClick={() => onSort("currentPrice" as SortKey)} className={`sortable ${sortKey === "currentPrice" ? "active-sort" : ""}`}>
                Price
              </th>
              <th onClick={() => onSort("percentChange" as SortKey)} className={`sortable whitespace-nowrap ${sortKey === "percentChange" ? "active-sort" : ""}`}>
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

