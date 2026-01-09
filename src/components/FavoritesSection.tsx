/**
 * Favorites Section Component
 */

import React from 'react';
import Link from 'next/link';
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
          <Link
            href="/stocks"
            className="mt-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            Browse stocks →
          </Link>
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

      {/* Mobile: Sort chips */}
      <div className="lg:hidden px-3 pb-2">
        <div className="mobile-sort-row" role="tablist" aria-label="Sort favorites">
          {[
            { key: 'ticker' as SortKey, label: 'Ticker' },
            { key: 'currentPrice' as SortKey, label: 'Price' },
            { key: 'percentChange' as SortKey, label: '% Change' },
            { key: 'marketCap' as SortKey, label: 'Mkt Cap' },
          ].map((opt) => {
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
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <span className="sort-chip-label">{opt.label}</span>
                {icon && <span className="sort-chip-icon">{icon}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile: Cards layout */}
      <div className="lg:hidden">
        <div className="w-full bg-white dark:bg-gray-900 border-0 rounded-none overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
          {/* Header row (mobile) */}
          <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-white/5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            {sortKey === 'marketCapDiff' ? (
              <div className="grid items-center gap-x-2 min-w-0 [grid-template-columns:40px_minmax(56px,1fr)_72px_72px_44px]">
                <div className="text-center">Logo</div>
                <div className="text-center">Ticker</div>
                <div className="text-center">Mkt Cap</div>
                <div className="text-center">Δ</div>
                <div className="text-center">★</div>
              </div>
            ) : sortKey === 'marketCap' ? (
              <div className="grid items-center gap-x-2 min-w-0 [grid-template-columns:40px_minmax(56px,1fr)_96px_56px_44px]">
                <div className="text-center">Logo</div>
                <div className="text-center">Ticker</div>
                <div className="text-center">Mkt Cap</div>
                <div className="text-center">%</div>
                <div className="text-center">★</div>
              </div>
            ) : (
              <div className="grid items-center gap-x-2 min-w-0 [grid-template-columns:40px_minmax(56px,1fr)_96px_56px_44px]">
                <div className="text-center">Logo</div>
                <div className="text-center">Ticker</div>
                <div className="text-center">Price</div>
                <div className="text-center">%</div>
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

