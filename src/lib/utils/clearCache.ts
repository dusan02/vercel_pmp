/**
 * Utility functions for clearing application cache
 */

import { safeGetItem, safeSetItem, safeRemoveItem } from './safeStorage';

const CACHE_KEYS = {
  PREFERENCES: 'pmp-user-preferences',
  FAVORITES: 'pmp-favorites',
  PORTFOLIO: 'pmp_portfolio_holdings',
  CONSENT: 'pmp-cookie-consent',
  HEATMAP: 'heatmap-cache',
} as const;

/**
 * Clear all application localStorage cache
 */
export function clearAllLocalStorageCache(): void {
  if (typeof window === 'undefined') return;
  
  Object.values(CACHE_KEYS).forEach(key => {
    safeRemoveItem(key);
  });
  console.log('✅ All localStorage cache cleared');
}

/**
 * Clear specific cache key
 */
export function clearCacheKey(key: string): void {
  if (typeof window === 'undefined') return;
  
  safeRemoveItem(key);
  console.log(`✅ Cleared cache key: ${key}`);
}

/**
 * Clear only data cache (keeps user preferences)
 */
export function clearDataCache(): void {
  if (typeof window === 'undefined') return;
  
  try {
    clearCacheKey(CACHE_KEYS.HEATMAP);
    console.log('✅ Data cache cleared (preferences preserved)');
  } catch (error) {
    console.error('⚠️ Error clearing data cache:', error);
  }
}

/**
 * Validate and repair localStorage data
 */
export function repairLocalStorage(): {
  repaired: string[];
  removed: string[];
} {
  if (typeof window === 'undefined') {
    return { repaired: [], removed: [] };
  }
  
  const repaired: string[] = [];
  const removed: string[] = [];
  
  try {
    // Check preferences
    const prefs = safeGetItem(CACHE_KEYS.PREFERENCES);
    if (prefs) {
      try {
        const parsed = JSON.parse(prefs);
        if (!parsed || typeof parsed !== 'object') {
          safeRemoveItem(CACHE_KEYS.PREFERENCES);
          removed.push(CACHE_KEYS.PREFERENCES);
        }
      } catch {
        safeRemoveItem(CACHE_KEYS.PREFERENCES);
        removed.push(CACHE_KEYS.PREFERENCES);
      }
    }
    
    // Check favorites
    const favorites = safeGetItem(CACHE_KEYS.FAVORITES);
    if (favorites) {
      try {
        const parsed = JSON.parse(favorites);
        if (!Array.isArray(parsed)) {
          safeRemoveItem(CACHE_KEYS.FAVORITES);
          removed.push(CACHE_KEYS.FAVORITES);
        }
      } catch {
        safeRemoveItem(CACHE_KEYS.FAVORITES);
        removed.push(CACHE_KEYS.FAVORITES);
      }
    }
    
    // Check portfolio
    const portfolio = safeGetItem(CACHE_KEYS.PORTFOLIO);
    if (portfolio) {
      try {
        const parsed = JSON.parse(portfolio);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          safeRemoveItem(CACHE_KEYS.PORTFOLIO);
          removed.push(CACHE_KEYS.PORTFOLIO);
        }
      } catch {
        safeRemoveItem(CACHE_KEYS.PORTFOLIO);
        removed.push(CACHE_KEYS.PORTFOLIO);
      }
    }
    
    // Check heatmap cache
    const heatmap = safeGetItem(CACHE_KEYS.HEATMAP);
    if (heatmap) {
      try {
        const parsed = JSON.parse(heatmap);
        if (!parsed || !parsed.data || !Array.isArray(parsed.data)) {
          safeRemoveItem(CACHE_KEYS.HEATMAP);
          removed.push(CACHE_KEYS.HEATMAP);
        } else {
          // Check if expired
          const age = Date.now() - (parsed.timestamp || 0);
          if (age > 5 * 60 * 1000) { // 5 minutes
            safeRemoveItem(CACHE_KEYS.HEATMAP);
            removed.push(CACHE_KEYS.HEATMAP);
          }
        }
      } catch {
        safeRemoveItem(CACHE_KEYS.HEATMAP);
        removed.push(CACHE_KEYS.HEATMAP);
      }
    }
    
    console.log('🔧 localStorage repair completed:', { repaired, removed });
  } catch (error) {
    console.error('⚠️ Error repairing localStorage:', error);
  }
  
  return { repaired, removed };
}

/**
 * Auto-repair on load (call this early in app initialization)
 */
export function autoRepairLocalStorage(): void {
  if (typeof window === 'undefined') return;
  
  try {
    repairLocalStorage();
  } catch (error) {
    console.error('⚠️ Error in auto-repair:', error);
    // If repair fails, clear everything as last resort
    try {
      clearAllLocalStorageCache();
    } catch (clearError) {
      console.error('⚠️ Critical: Could not clear localStorage:', clearError);
    }
  }
}

/**
 * Expose to window for manual cache clearing (DevTools)
 * Usage: window.clearPMPCache() or window.repairPMPCache()
 */
if (typeof window !== 'undefined') {
  (window as any).clearPMPCache = clearAllLocalStorageCache;
  (window as any).repairPMPCache = repairLocalStorage;
  console.log('💡 Cache utilities available: window.clearPMPCache() or window.repairPMPCache()');
}

