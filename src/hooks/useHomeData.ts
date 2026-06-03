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
    fetchRemainingStocksData,
    fetchSpecificTickers,
    loadData,
  } = useStockData({ initialData, favorites });

  // Auto-load all stocks when user navigates to All Stocks section
  const allStocksLoadedRef = useRef(false);
  useEffect(() => {
    if (activeSection === 'allStocks' && !allStocksLoadedRef.current && !loadingStates.remainingStocks) {
      fetchRemainingStocksData();
      allStocksLoadedRef.current = true;
    }
  }, [activeSection, fetchRemainingStocksData, loadingStates.remainingStocks]);

  const {
    portfolioHoldings,
    updateQuantity,
    removeStock,
    addStock,
    calculateTotalStockValue,
    calculateDailyChange,
    totalPortfolioValue,
    portfolioStocks,
  } = usePortfolio({ stockData });

  // Load portfolio tickers missing from stockData (debounced)
  useEffect(() => {
    const missing = Object.keys(portfolioHoldings).filter(
      ticker => !stockData.some(s => s.ticker === ticker)
    );
    if (missing.length === 0) return;
    const id = setTimeout(() => fetchSpecificTickers(missing), 300);
    return () => clearTimeout(id);
  }, [portfolioHoldings, stockData, fetchSpecificTickers]);

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

  // Safety net: trigger remaining stocks if count is suspiciously low after 3s
  useEffect(() => {
    const timer = setTimeout(() => {
      if (allStocksSorted.length < 200) {
        logger.data('Auto-triggering remaining stocks load (low count detected)');
        fetchRemainingStocksData();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [allStocksSorted.length, fetchRemainingStocksData]);

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
    loadData,
    // Portfolio
    portfolioHoldings,
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
