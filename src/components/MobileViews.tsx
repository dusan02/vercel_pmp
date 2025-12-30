'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { StockData } from '@/lib/types';
import { MobileView } from './MobileShell';

// Dynamic imports for mobile views
const HeatmapPreview = dynamic(
  () => import('@/components/HeatmapPreview').then((mod) => mod.HeatmapPreview),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading heatmap...</div> }
);

const PortfolioSection = dynamic(
  () => import('@/components/PortfolioSection').then((mod) => mod.PortfolioSection),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading portfolio...</div> }
);

const FavoritesSection = dynamic(
  () => import('@/components/FavoritesSection').then((mod) => mod.FavoritesSection),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading favorites...</div> }
);

const TodaysEarningsFinnhub = dynamic(
  () => import('@/components/TodaysEarningsFinnhub'),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading earnings...</div> }
);

const AllStocksSection = dynamic(
  () => import('@/components/AllStocksSection').then((mod) => mod.AllStocksSection),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading stocks...</div> }
);

interface MobileViewsProps {
  activeView: MobileView;
  // Portfolio props
  portfolioStocks: StockData[];
  portfolioHoldings: Record<string, number>;
  allStocks: StockData[];
  portfolioLoading: boolean;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onRemoveStock: (ticker: string) => void;
  onAddStock: (ticker: string, quantity?: number) => void;
  calculatePortfolioValue: (stock: StockData) => number;
  totalPortfolioValue: number;
  // Favorites props
  favoriteStocks: StockData[];
  favoritesLoading: boolean;
  favSortKey: any;
  favAscending: boolean;
  onFavSort: (key: any) => void;
  onToggleFavorite: (ticker: string) => void;
  isFavorite: (ticker: string) => boolean;
  // All Stocks props
  displayedStocks: StockData[];
  allStocksLoading: boolean;
  allSortKey: any;
  allAscending: boolean;
  onAllSort: (key: any) => void;
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

/**
 * MobileViews - Renders only the active view (no scroll-to-sections)
 * Each view is a separate screen, switched via bottom navigation
 */
export const MobileViews: React.FC<MobileViewsProps> = ({
  activeView,
  // Portfolio
  portfolioHoldings,
  updateQuantity,
  removeStock,
  addStock,
  calculateStockValue,
  totalPortfolioValue,
  portfolioStocks,
  // Favorites
  favorites,
  toggleFavorite,
  isFavorite,
  favoriteStocks,
  // All Stocks
  displayedStocks,
  loading,
  sortKey,
  ascending,
  onSort,
  onToggleFavorite,
  searchTerm,
  onSearchChange,
  hasMore,
  selectedSector,
  selectedIndustry,
  onSectorChange,
  onIndustryChange,
  uniqueSectors,
  availableIndustries,
}) => {
  // Render only the active view
  switch (activeView) {
    case 'heatmap':
      return (
        <div className="mobile-view mobile-view-heatmap">
          <HeatmapPreview />
        </div>
      );

    case 'portfolio':
      return (
        <div className="mobile-view mobile-view-portfolio">
          <PortfolioSection
            portfolioStocks={portfolioStocks}
            portfolioHoldings={portfolioHoldings}
            allStocks={allStocks}
            loading={portfolioLoading}
            onUpdateQuantity={onUpdateQuantity}
            onRemoveStock={onRemoveStock}
            onAddStock={onAddStock}
            calculatePortfolioValue={calculatePortfolioValue}
            totalPortfolioValue={totalPortfolioValue}
          />
        </div>
      );

    case 'favorites':
      return (
        <div className="mobile-view mobile-view-favorites">
          <FavoritesSection
            favoriteStocks={favoriteStocks}
            loading={favoritesLoading}
            sortKey={favSortKey}
            ascending={favAscending}
            onSort={onFavSort}
            onToggleFavorite={onToggleFavorite}
            isFavorite={isFavorite}
          />
        </div>
      );

    case 'earnings':
      return (
        <div className="mobile-view mobile-view-earnings">
          <TodaysEarningsFinnhub />
        </div>
      );

    case 'allStocks':
      return (
        <div className="mobile-view mobile-view-all-stocks">
          <AllStocksSection
            displayedStocks={displayedStocks}
            loading={allStocksLoading}
            sortKey={allSortKey}
            ascending={allAscending}
            onSort={onAllSort}
            onToggleFavorite={onToggleFavorite}
            isFavorite={isFavorite}
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            hasMore={hasMore}
            selectedSector={selectedSector}
            selectedIndustry={selectedIndustry}
            onSectorChange={onSectorChange}
            onIndustryChange={onIndustryChange}
            uniqueSectors={uniqueSectors}
            availableIndustries={availableIndustries}
          />
        </div>
      );

    default:
      return (
        <div className="mobile-view">
          <div className="p-4 text-center text-gray-500">Unknown view</div>
        </div>
      );
  }
};

