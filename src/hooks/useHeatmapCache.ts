/**
 * Heatmap Cache Hook
 * Handles localStorage caching for heatmap data
 */

import { useEffect, useState } from 'react';
import type { CompanyNode } from '@/lib/heatmap/types';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/lib/utils/safeStorage';

const LOCALSTORAGE_KEY = 'heatmap-cache';
// OPTIMIZATION: Zvýšený cache time pre mobile (rýchlejšie načítanie)
// Mobile používa cache aj keď je starší (do 10 min), desktop preferuje fresh data
const getMaxAge = () => {
  if (typeof window === 'undefined') return 5 * 60 * 1000;
  return window.innerWidth <= 768 ? 10 * 60 * 1000 : 5 * 60 * 1000;
};
const LOCALSTORAGE_MAX_AGE = 5 * 60 * 1000; // Default, will be checked dynamically

interface CachedHeatmapData {
  data: CompanyNode[];
  lastUpdated: string;
  timestamp: number;
  etag: string | null;
}

/**
 * Read cache from localStorage synchronously (safe for both SSR and CSR)
 */
function readCacheSync(): CachedHeatmapData | null {
  if (typeof window === 'undefined') return null;
  const cached = safeGetItem(LOCALSTORAGE_KEY);
  if (!cached) return null;
  try {
    const parsed: CachedHeatmapData = JSON.parse(cached);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.data) || !parsed.data.length) return null;
    const age = Date.now() - (parsed.timestamp || 0);
    if (age < 0 || age >= getMaxAge()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Hook for managing heatmap data cache in localStorage
 */
export function useHeatmapCache() {
  // Synchronous read on client — data available on first render without waiting for useEffect
  const [cachedData, setCachedData] = useState<CachedHeatmapData | null>(readCacheSync);
  const [isLoading] = useState(false);

  // On SSR hydration, re-check localStorage in case the synchronous read was skipped (server)
  useEffect(() => {
    if (!cachedData) {
      const fresh = readCacheSync();
      if (fresh) setCachedData(fresh);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

