/**
 * Safe localStorage utilities that handle:
 * - Incognito mode (SecurityError)
 * - Quota exceeded errors
 * - Browser privacy settings
 * - SSR (server-side rendering)
 */

const isStorageAvailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    const error = e as Error | DOMException;
    return (
      error instanceof DOMException &&
      (error.code === 22 || // QuotaExceededError
       error.code === 1014 || // NS_ERROR_DOM_QUOTA_REACHED
       error.name === 'QuotaExceededError' ||
       error.name === 'NS_ERROR_DOM_QUOTA_REACHED') ||
      // Safari in private mode throws SecurityError
      (error instanceof Error && error.name === 'SecurityError')
    );
  }
};

/**
 * Safely get item from localStorage
 * Returns null if storage is unavailable or item doesn't exist
 */
export function safeGetItem(key: string): string | null {
  if (!isStorageAvailable()) return null;
  
  try {
    return localStorage.getItem(key);
  } catch (error) {
    // Silently fail in incognito/private mode
    if (process.env.NODE_ENV === 'development') {
      console.warn(`⚠️ Could not read localStorage key "${key}":`, error);
    }
    return null;
  }
}

/**
 * Safely set item in localStorage
 * Returns true if successful, false otherwise
 */
export function safeSetItem(key: string, value: string): boolean {
  if (!isStorageAvailable()) return false;
  
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    // Silently fail in incognito/private mode or quota exceeded
    if (process.env.NODE_ENV === 'development') {
      console.warn(`⚠️ Could not write localStorage key "${key}":`, error);
    }
    return false;
  }
}

/**
 * Safely remove item from localStorage
 * Returns true if successful, false otherwise
 */
export function safeRemoveItem(key: string): boolean {
  if (!isStorageAvailable()) return false;
  
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    // Silently fail in incognito/private mode
    if (process.env.NODE_ENV === 'development') {
      console.warn(`⚠️ Could not remove localStorage key "${key}":`, error);
    }
    return false;
  }
}

/**
 * Safely clear all localStorage (use with caution)
 */
export function safeClear(): boolean {
  if (!isStorageAvailable()) return false;
  
  try {
    localStorage.clear();
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Could not clear localStorage:', error);
    }
    return false;
  }
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  return isStorageAvailable();
}

