/**
 * Cache Clearing Utility
 * 
 * Clears all caches to match incognito mode:
 * - Service Worker caches
 * - localStorage
 * - sessionStorage
 * - Browser cache (via hard reload)
 */

export interface CacheClearResult {
  success: boolean;
  cleared: {
    serviceWorker: boolean;
    localStorage: boolean;
    sessionStorage: boolean;
    caches: boolean;
  };
  errors: string[];
}

/**
 * Clear all Service Worker caches
 */
async function clearServiceWorkerCaches(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('caches' in window)) {
      return false;
    }

    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
    
    return true;
  } catch (error) {
    console.error('Error clearing Service Worker caches:', error);
    return false;
  }
}

/**
 * Unregister Service Worker
 */
async function unregisterServiceWorker(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return false;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.unregister();
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error unregistering Service Worker:', error);
    return false;
  }
}

/**
 * Clear localStorage (with option to keep certain keys)
 */
function clearLocalStorage(keepKeys: string[] = []): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }

    // Save keys to keep
    const saved: Record<string, string> = {};
    keepKeys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        saved[key] = value;
      }
    });

    // Clear all
    localStorage.clear();

    // Restore kept keys
    Object.entries(saved).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });

    return true;
  } catch (error) {
    console.error('Error clearing localStorage:', error);
    return false;
  }
}

/**
 * Clear sessionStorage
 */
function clearSessionStorage(): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }

    sessionStorage.clear();
    return true;
  } catch (error) {
    console.error('Error clearing sessionStorage:', error);
    return false;
  }
}

/**
 * Clear all caches (full clear - like incognito mode)
 */
export async function clearAllCaches(options: {
  keepLocalStorageKeys?: string[];
  unregisterSW?: boolean;
} = {}): Promise<CacheClearResult> {
  const result: CacheClearResult = {
    success: true,
    cleared: {
      serviceWorker: false,
      localStorage: false,
      sessionStorage: false,
      caches: false,
    },
    errors: [],
  };

  try {
    // 1. Clear Service Worker caches
    try {
      result.cleared.caches = await clearServiceWorkerCaches();
    } catch (error) {
      result.errors.push(`Service Worker caches: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 2. Unregister Service Worker (optional)
    if (options.unregisterSW) {
      try {
        result.cleared.serviceWorker = await unregisterServiceWorker();
      } catch (error) {
        result.errors.push(`Service Worker unregister: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // 3. Clear localStorage
    try {
      result.cleared.localStorage = clearLocalStorage(options.keepLocalStorageKeys);
    } catch (error) {
      result.errors.push(`localStorage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 4. Clear sessionStorage
    try {
      result.cleared.sessionStorage = clearSessionStorage();
    } catch (error) {
      result.errors.push(`sessionStorage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    result.success = result.errors.length === 0;
  } catch (error) {
    result.success = false;
    result.errors.push(`General error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * Hard reload page (clears browser cache for current page)
 */
export function hardReload(): void {
  if (typeof window !== 'undefined') {
    // Force reload from server, bypassing cache
    window.location.reload();
  }
}

/**
 * Clear all caches and reload (full reset)
 */
export async function clearAllCachesAndReload(options: {
  keepLocalStorageKeys?: string[];
  unregisterSW?: boolean;
} = {}): Promise<void> {
  await clearAllCaches(options);
  
  // Small delay to ensure caches are cleared
  await new Promise(resolve => setTimeout(resolve, 100));
  
  hardReload();
}

/**
 * Force layout consistency by clearing layout-related cache
 * Use this when layout changes to ensure all users see the new layout
 */
export async function forceLayoutUpdate(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Clear layout version to trigger migration
    localStorage.removeItem('pmp-layout-version');
    
    // Clear Service Worker cache
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('premarketprice-'))
          .map(name => caches.delete(name))
      );
    }

    // Unregister and re-register Service Worker
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.unregister();
      }
    }

    // Reload to apply changes
    hardReload();
  } catch (error) {
    console.error('Error forcing layout update:', error);
  }
}

