import { useState, useMemo, useCallback, useEffect } from "react";

export type SortKey = "ticker" | "marketCap" | "currentPrice" | "percentChange" | "marketCapDiff" | "sector" | "industry" | "estimate_eps" | "actual_eps" | "estimate_revenue" | "actual_revenue" | "percent_change" | "market_cap_diff";

export interface UseSortableDataOptions<T> {
  items: T[];
  initialSortKey?: SortKey;
  initialAscending?: boolean;
}

export function useSortableData<T extends Record<string, any>>(
  items: T[], 
  initKey?: SortKey, 
  initAsc: boolean = false,
  storageKey?: string // Optional localStorage key for persistence
): {
  sorted: T[];
  sortKey: SortKey | null;
  ascending: boolean;
  requestSort: (key: SortKey) => void;
  getSortIcon: (key: SortKey) => 'asc' | 'desc' | null;
} {
  // Load from localStorage if storageKey provided
  const [sortKey, setSortKey] = useState<SortKey | null>(() => {
    if (storageKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`${storageKey}_sortKey`);
      if (stored) return stored as SortKey;
    }
    return initKey || null;
  });
  const [ascending, setAscending] = useState<boolean>(() => {
    if (storageKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`${storageKey}_sortAscending`);
      if (stored) return stored === 'true';
    }
    return initAsc;
  });

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    
    const data = [...items];
    data.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      
      // Handle null/undefined values
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      
      // Handle numbers
      if (typeof valA === 'number' && typeof valB === 'number') {
        return ascending ? valA - valB : valB - valA;
      }
      
      // Handle strings
      if (typeof valA === 'string' && typeof valB === 'string') {
        return ascending 
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      
      // Fallback comparison
      if (valA === valB) return 0;
      return (valA > valB ? 1 : -1) * (ascending ? 1 : -1);
    });
    return data;
  }, [items, sortKey, ascending]);

  // Persist to localStorage if storageKey provided
  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      if (sortKey) {
        localStorage.setItem(`${storageKey}_sortKey`, sortKey);
        localStorage.setItem(`${storageKey}_sortAscending`, String(ascending));
      }
    }
  }, [sortKey, ascending, storageKey]);

  const requestSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setAscending(!ascending);
    } else {
      setSortKey(key);
      setAscending(false); // Start with DESC (false = descending)
    }
  }, [sortKey, ascending]);

  const getSortIcon = useCallback((key: SortKey): 'asc' | 'desc' | null => {
    if (key !== sortKey) return null;
    return ascending ? 'asc' : 'desc';
  }, [sortKey, ascending]);

  return { sorted, sortKey, ascending, requestSort, getSortIcon };
} 