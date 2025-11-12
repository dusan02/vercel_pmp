/**
 * Favorites Section Component
 */

import React from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { SectionIcon } from './SectionIcon';
import { formatBillions } from '@/lib/format';
import { StockTableRow } from './StockTableRow';
import { SectionLoader } from './SectionLoader';
import { StockData } from '@/lib/types';
import { LoadingStates } from '@/lib/types';

interface FavoritesSectionProps {
  favoriteStocks: StockData[];
  loading: boolean;
  sortKey: SortKey;
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
    
      <table>
        <thead>
          <tr>
            <th>Logo</th>
            <th onClick={() => onSort("ticker" as SortKey)} className={`sortable ${sortKey === "ticker" ? "active-sort" : ""}`}>
              Ticker
            </th>
            <th>Company Name</th>
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
          {favoriteStocks.map((stock) => (
            <StockTableRow
              key={stock.ticker}
              stock={stock}
              isFavorite={isFavorite(stock.ticker)}
              onToggleFavorite={() => onToggleFavorite(stock.ticker)}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

