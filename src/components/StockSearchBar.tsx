/**
 * Stock Search Bar Component
 * Includes debounced search for better performance
 */

import React, { useState, useEffect, useCallback } from 'react';

interface StockSearchBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

// Simple debounce helper
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function StockSearchBar({
  searchTerm,
  onSearchChange,
  placeholder = 'Search by ticker or company name...',
  debounceMs = 250
}: StockSearchBarProps) {
  const [localValue, setLocalValue] = useState(searchTerm);

  // Debounced callback
  const debouncedOnSearchChange = useCallback(
    debounce((value: string) => {
      onSearchChange(value);
    }, debounceMs),
    [onSearchChange, debounceMs]
  );

  // Update local value immediately, but debounce the callback
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalValue(value);
    debouncedOnSearchChange(value);
  };

  // Sync with external searchTerm changes
  useEffect(() => {
    setLocalValue(searchTerm);
  }, [searchTerm]);

  return (
    <div className="search-wrapper">
      <input
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        className="w-full px-4 py-2 border rounded-md bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all"
        aria-label="Search stocks by company name or ticker"
      />
    </div>
  );
}

