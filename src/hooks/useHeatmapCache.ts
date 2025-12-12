/**
 * Heatmap Cache Hook
 * Handles localStorage caching for heatmap data
 */

import { useEffect, useState } from 'react';
import type { CompanyNode } from '@/components/MarketHeatmap';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/lib/utils/safeStorage';

const LOCALSTORAGE_KEY = 'heatmap-cache';
const LOCALSTORAGE_MAX_AGE = 5 * 60 * 1000; // 5 minút - max vek dát v localStorage

interface CachedHeatmapData {
  data: CompanyNode[];
  lastUpdated: string;
  timestamp: number;
  etag: string | null;
}

/**
 * Hook for managing heatmap data cache in localStorage
 */
export function useHeatmapCache() {
  const [cachedData, setCachedData] = useState<CachedHeatmapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    const cached = safeGetItem(LOCALSTORAGE_KEY);
    if (cached) {
      try {
        const parsed: CachedHeatmapData = JSON.parse(cached);
        
        // Validate data structure
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.data)) {
          console.warn('⚠️ Heatmap: Invalid cache format, clearing');
          safeRemoveItem(LOCALSTORAGE_KEY);
          setIsLoading(false);
          return;
        }
        
        const age = Date.now() - (parsed.timestamp || 0);
        
        // Použi cache len ak je fresh (< 5 min) a má validné dáta
        if (age < LOCALSTORAGE_MAX_AGE && age >= 0 && parsed.data && parsed.data.length > 0) {
          console.log(`📦 Heatmap: Loading from localStorage (${Math.floor(age / 1000)}s old, ${parsed.data.length} companies)`);
          setCachedData(parsed);
        } else {
          console.log(`⚠️ Heatmap: localStorage cache expired or invalid (${Math.floor(age / 1000)}s old) - clearing`);
          safeRemoveItem(LOCALSTORAGE_KEY);
        }
      } catch (parseError) {
        console.error('⚠️ Heatmap: Error parsing cache, clearing corrupted data:', parseError);
        safeRemoveItem(LOCALSTORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  // Save to localStorage
  const saveCache = (data: CompanyNode[], lastUpdated: string, etag: string | null) => {
    const cacheData: CachedHeatmapData = {
      data,
      lastUpdated,
      timestamp: Date.now(),
      etag
    };
    try {
      if (safeSetItem(LOCALSTORAGE_KEY, JSON.stringify(cacheData))) {
        setCachedData(cacheData);
        console.log(`💾 Heatmap: Saved to localStorage (${data.length} companies)`);
      }
    } catch (err) {
      console.warn('⚠️ Heatmap: Error saving to localStorage:', err);
    }
  };

  // Clear cache
  const clearCache = () => {
    safeRemoveItem(LOCALSTORAGE_KEY);
    setCachedData(null);
    console.log('🗑️ Heatmap: Cache cleared');
  };

  return {
    cachedData,
    isLoading,
    saveCache,
    clearCache,
  };
}

