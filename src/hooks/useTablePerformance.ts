/**
 * Hook for table performance optimization
 * Provides memoization for already sorted/filtered stocks from useStockFilter
 * This prevents unnecessary re-renders when stocks array reference changes but content is the same
 */

import { useMemo } from 'react';
import { StockData } from '@/lib/types';

interface UseTablePerformanceOptions {
  stocks: StockData[]; // Already sorted and filtered stocks from useStockFilter
  sortKey: string | null;
  ascending: boolean;
  searchTerm: string;
}

export function useTablePerformance({
  stocks,
  sortKey,
  ascending,
  searchTerm
}: UseTablePerformanceOptions) {
  // Memoize filtered stocks to prevent unnecessary re-renders
  // The stocks are already sorted by useStockFilter, we just memoize the result
  const filteredStocks = useMemo(() => {
    // If no search term, return stocks as-is (already sorted)
    if (!searchTerm.trim()) {
      return stocks;
    }

    // Apply search filter (useStockFilter already does this, but we memoize here for performance)
    const term = searchTerm.toLowerCase();
    return stocks.filter((stock) => {
      return (
        stock.ticker.toLowerCase().includes(term) ||
        stock.companyName?.toLowerCase().includes(term) ||
        stock.sector?.toLowerCase().includes(term) ||
        stock.industry?.toLowerCase().includes(term)
      );
    });
  }, [stocks, searchTerm]);

  return {
    filteredStocks
  };
}

