'use client';

import { useRef, useEffect } from 'react';
import { useStockData } from './useStockData';
import { usePortfolio } from './usePortfolio';
import { useStockFilter } from './useStockFilter';
import { useTablePerformance } from './useTablePerformance';
import { useLazyLoading } from './useLazyLoading';
import { useFavorites } from './useFavorites';
import { logger } from '@/lib/utils/logger';
import { StockData } from '@/lib/types';
import type { ActiveSection } from './useHomeNavigation';

interface UseHomeDataOptions {
  initialData: StockData[];
  activeSection: ActiveSection;
}

export function useHomeData({ initialData, activeSection }: UseHomeDataOptions) {
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  const {
    stockData,
    loadingStates,
    error,
    liveConnected,
    fetchRemainingStocksData,
    fetchSpecificTickers,
    loadData,
  } = useStockData({ initialData, favorites });

  // Auto-load remaining stocks only when user opens Portfolio or Favorites
  // (where the add-stock search bar filters over `allStocks`). Screener uses
  // its own /api/analysis/screener endpoint; Heatmap uses /api/heatmap.
  const allStocksLoadedRef = useRef(false);
  useEffect(() => {
    if ((activeSection === 'portfolio' || activeSection === 'favorites') && !allStocksLoadedRef.current && !loadingStates.remainingStocks) {
      fetchRemainingStocksData();
      allStocksLoadedRef.current = true;
    }
  }, [activeSection, fetchRemainingStocksData, loadingStates.remainingStocks]);

  const {
    portfolioHoldings,
    costBasis,
    updateCostBasis,
    updateQuantity,
    removeStock,
    addStock,
    calculateTotalStockValue,
    calculateDailyChange,
    totalPortfolioValue,
    portfolioStocks,
  } = usePortfolio({ stockData });

  // Load portfolio and favorite tickers missing from stockData (debounced)
  useEffect(() => {
    const wanted = new Set([
      ...Object.keys(portfolioHoldings),
      ...favorites.map(f => f.ticker),
    ]);
    const missing = Array.from(wanted).filter(
      ticker => !stockData.some(s => s.ticker === ticker)
    );
    if (missing.length === 0) return;
    const id = setTimeout(() => fetchSpecificTickers(missing), 300);
    return () => clearTimeout(id);
  }, [portfolioHoldings, favorites, stockData, fetchSpecificTickers]);

  const {
    searchTerm, setSearchTerm,
    favoriteStocksSorted,
    allStocksSorted,
    favSortKey, favAscending, requestFavSort,
    allSortKey, allAscending, requestAllSort,
    selectedSectors, setSelectedSectors,
    selectedIndustries, setSelectedIndustries,
    uniqueSectors, availableIndustries,
  } = useStockFilter({ stockData, favorites, isFavorite });

  const { filteredStocks: optimizedAllStocks } = useTablePerformance({
    stocks: allStocksSorted,
    sortKey: allSortKey,
    ascending: allAscending,
    searchTerm: '', // already applied in useStockFilter
  });

  const {
    displayLimit,
    hasMore,
    loadMore,
    isLoading: isLoadingMore,
  } = useLazyLoading({
    initialLimit: 50,
    incrementSize: 50,
    totalItems: optimizedAllStocks.length,
    threshold: 500,
    onLoadRemaining: fetchRemainingStocksData,
    enableProgressiveLoading: true,
  });

  const displayedStocks = optimizedAllStocks.slice(0, Math.min(displayLimit, optimizedAllStocks.length));

  useEffect(() => {
    if (optimizedAllStocks.length > 0) {
      logger.data(`Stocks: ${optimizedAllStocks.length} total, ${displayedStocks.length} displayed (limit: ${displayLimit})`);
    }
  }, [optimizedAllStocks.length, displayedStocks.length, displayLimit]);

  return {
    // Favorites
    favorites,
    toggleFavorite,
    isFavorite,
    // Stock data
    stockData,
    loadingStates,
    error,
    liveConnected,
    loadData,
    // Portfolio
    portfolioHoldings,
    costBasis,
    updateCostBasis,
    updateQuantity,
    removeStock,
    addStock,
    calculateTotalStockValue,
    calculateDailyChange,
    totalPortfolioValue,
    portfolioStocks,
    // Filter / sort
    searchTerm,
    setSearchTerm,
    favoriteStocksSorted,
    favSortKey,
    favAscending,
    requestFavSort,
    allSortKey,
    allAscending,
    requestAllSort,
    selectedSectors,
    setSelectedSectors,
    selectedIndustries,
    setSelectedIndustries,
    uniqueSectors,
    availableIndustries,
    // Paginated display
    optimizedAllStocks,
    displayedStocks,
    hasMore,
    loadMore,
    isLoadingMore,
  };
}
