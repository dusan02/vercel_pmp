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
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);

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
      
      // Sector filter (multi-select: empty = all)
      if (selectedSectors.length > 0 && !selectedSectors.includes(stock.sector || '')) return false;
      
      // Industry filter (multi-select: empty = all)
      if (selectedIndustries.length > 0 && !selectedIndustries.includes(stock.industry || '')) return false;
      
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
  }, [stockData, debouncedSearchTerm, favoritesOnly, selectedSectors, selectedIndustries, filterCategory, isFavorite]);

  // Favorite stocks subset (always filtered by favorites logic, independent of UI toggle)
  const favoriteStocks = useMemo(() => {
    return stockData.filter(stock => favorites.some(fav => fav.ticker === stock.ticker));
  }, [stockData, favorites]);

  // Sorting hooks - persisted in localStorage
  const { 
    sorted: favoriteStocksSorted, 
    sortKey: favSortKey, 
    ascending: favAscending, 
    requestSort: requestFavSort 
  } = useSortableData(favoriteStocks, "marketCap", false, "pmp_favorites");

  const { 
    sorted: allStocksSorted, 
    sortKey: allSortKey, 
    ascending: allAscending, 
    requestSort: requestAllSort 
  } = useSortableData(filteredStocks, "marketCap", false, "pmp_allStocks");

  // Sector stats logic
  const sectorCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    stockData.forEach(stock => {
      const sector = stock.sector || 'Other';
      counts[sector] = (counts[sector] || 0) + 1;
    });
    return counts;
  }, [stockData]);

  // Get unique sectors and industries from stockData
  const uniqueSectors = useMemo(() => {
    const sectors = new Set<string>();
    stockData.forEach(stock => {
      if (stock.sector) sectors.add(stock.sector);
    });
    return Array.from(sectors).sort();
  }, [stockData]);

  const uniqueIndustries = useMemo(() => {
    const industries = new Set<string>();
    stockData.forEach(stock => {
      if (stock.industry) industries.add(stock.industry);
    });
    return Array.from(industries).sort();
  }, [stockData]);

  // Filter industries based on selected sectors (multi-select)
  const availableIndustries = useMemo(() => {
    if (selectedSectors.length === 0) {
      return uniqueIndustries;
    }
    const industries = new Set<string>();
    stockData.forEach(stock => {
      if (selectedSectors.includes(stock.sector || '') && stock.industry) {
        industries.add(stock.industry);
      }
    });
    return Array.from(industries).sort();
  }, [stockData, selectedSectors, uniqueIndustries]);

  return {
    searchTerm,
    setSearchTerm,
    favoritesOnly,
    setFavoritesOnly,
    filterCategory,
    setFilterCategory,
    selectedSectors,
    setSelectedSectors,
    selectedIndustries,
    setSelectedIndustries,
    filteredStocks,
    favoriteStocksSorted,
    allStocksSorted,
    favSortKey,
    favAscending,
    requestFavSort,
    allSortKey,
    allAscending,
    requestAllSort,
    sectorCounts,
    uniqueSectors,
    uniqueIndustries,
    availableIndustries
  };
}

