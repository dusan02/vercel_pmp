import { useState, useMemo, useCallback } from 'react';
import { StockData } from '@/lib/types';
import { useSortableData } from '@/hooks/useSortableData';
import { getCompanyName } from '@/lib/companyNames';
import { useDebounce } from '@/hooks/useDebounce';

interface UseStockFilterProps {
  stockData: StockData[];
  favorites: { ticker: string }[];
  isFavorite: (ticker: string) => boolean;
}

export function useStockFilter({ stockData, favorites, isFavorite }: UseStockFilterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'gainers' | 'losers' | 'movers' | 'bigMovers'>('all');
  const [selectedSector, setSelectedSector] = useState<string>('all');

  // Debounce search term to reduce filtering computations
  const debouncedSearchTerm = useDebounce(searchTerm, 200);

  // Base filtering logic - use debounced search term for better performance
  const filteredStocks = useMemo(() => {
    return stockData.filter(stock => {
      // Search filter - use debounced term
      const matchesSearch = stock.ticker.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        getCompanyName(stock.ticker).toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      
      if (!matchesSearch) return false;
      
      // Favorites-only filter
      if (favoritesOnly && !isFavorite(stock.ticker)) return false;
      
      // Sector filter
      if (selectedSector !== 'all' && stock.sector !== selectedSector) return false;
      
      // Category filter
      switch (filterCategory) {
        case 'gainers':
          return stock.percentChange > 0;
        case 'losers':
          return stock.percentChange < 0;
        case 'movers':
          return Math.abs(stock.percentChange) > 2;
        case 'bigMovers':
          return Math.abs(stock.marketCapDiff) > 10;
        default:
          return true;
      }
    });
  }, [stockData, debouncedSearchTerm, favoritesOnly, selectedSector, filterCategory, isFavorite]);

  // Favorite stocks subset (always filtered by favorites logic, independent of UI toggle)
  const favoriteStocks = useMemo(() => {
    return stockData.filter(stock => favorites.some(fav => fav.ticker === stock.ticker));
  }, [stockData, favorites]);

  // Sorting hooks
  const { 
    sorted: favoriteStocksSorted, 
    sortKey: favSortKey, 
    ascending: favAscending, 
    requestSort: requestFavSort 
  } = useSortableData(favoriteStocks, "marketCap", false);

  const { 
    sorted: allStocksSorted, 
    sortKey: allSortKey, 
    ascending: allAscending, 
    requestSort: requestAllSort 
  } = useSortableData(filteredStocks, "marketCap", false);

  // Sector stats logic
  const sectorCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    stockData.forEach(stock => {
      const sector = stock.sector || 'Unknown';
      counts[sector] = (counts[sector] || 0) + 1;
    });
    return counts;
  }, [stockData]);

  return {
    searchTerm,
    setSearchTerm,
    favoritesOnly,
    setFavoritesOnly,
    filterCategory,
    setFilterCategory,
    selectedSector,
    setSelectedSector,
    filteredStocks,
    favoriteStocksSorted,
    allStocksSorted,
    favSortKey,
    favAscending,
    requestFavSort,
    allSortKey,
    allAscending,
    requestAllSort,
    sectorCounts
  };
}

