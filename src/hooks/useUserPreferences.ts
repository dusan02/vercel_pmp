'use client';

import { useState, useEffect, useCallback } from 'react';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/lib/utils/safeStorage';

export interface UserPreferences {
  favorites: string[];
  theme: 'light' | 'dark' | 'auto';
  defaultTab: 'all' | 'favorites' | 'gainers' | 'losers';
  autoRefresh: boolean;
  refreshInterval: number;
  showEarnings: boolean;
  showNews: boolean;
  tableColumns: string[];
  // Section visibility toggles
  showPortfolioSection?: boolean;
  showFavoritesSection?: boolean;
  showEarningsSection?: boolean;
  showHeatmapSection?: boolean;
  showMoversSection?: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  favorites: [],
  theme: 'light', // Defaulting to light for consistency across Desktop/Mobile
  defaultTab: 'all',
  autoRefresh: true,
  refreshInterval: 30,
  showEarnings: true,
  showNews: true,
  tableColumns: ['symbol', 'price', 'change', 'changePercent', 'marketCap', 'volume'],
  // Default section visibility
  showPortfolioSection: true,
  showFavoritesSection: true,
  showEarningsSection: true,
  showHeatmapSection: true,
  showMoversSection: true
};

const STORAGE_KEY = 'pmp-user-preferences';
const FAVORITES_KEY = 'pmp-favorites';
const CONSENT_KEY = 'pmp-cookie-consent';

/**
 * Merge a server favorites list into local state. The server response is a
 * snapshot relative to `base` (the local list the sync started from); local
 * star toggles that landed after the baseline must survive — otherwise a
 * slow GET raced with a click visibly un-favorites the ticker (the classic
 * "works only on second load" bug). Removals on other devices still
 * propagate because the server list replaces the synced baseline.
 */
export function mergeServerFavorites(prev: string[], base: string[], server: string[]): string[] {
    const pendingAdded = prev.filter(t => !base.includes(t));
    const pendingRemoved = base.filter(t => !prev.includes(t));
    return [
        ...server.filter(t => !pendingRemoved.includes(t)),
        ...pendingAdded.filter(t => !server.includes(t)),
    ];
}

// Version management for preferences migration
const PREFERENCES_VERSION = '2.0.0'; // Increment when preferences structure changes
const LAYOUT_VERSION = '2.0.0'; // Increment when layout changes (e.g., sidebar position)
const VERSION_KEY = 'pmp-preferences-version';
const LAYOUT_VERSION_KEY = 'pmp-layout-version';

// Migrate preferences if version changed
function migratePreferences(prefs: any, storedVersion: string | null, storedLayoutVersion: string | null): UserPreferences {
  let migratedPrefs = { ...prefs };

  // Check if preferences version is outdated
  if (!storedVersion || storedVersion !== PREFERENCES_VERSION) {
    // Reset preferences structure if version mismatch
    if (storedVersion && storedVersion < PREFERENCES_VERSION) {
      console.log(`🔄 Migrating preferences from ${storedVersion} to ${PREFERENCES_VERSION}`);
      // Keep only valid preferences, reset others to defaults
      migratedPrefs = {
        ...DEFAULT_PREFERENCES,
        favorites: Array.isArray(prefs.favorites) ? prefs.favorites : DEFAULT_PREFERENCES.favorites,
        theme: prefs.theme || DEFAULT_PREFERENCES.theme,
      };
    }
    // Update version
    safeSetItem(VERSION_KEY, PREFERENCES_VERSION);
  }

  // Check if layout version changed (critical for layout consistency)
  if (!storedLayoutVersion || storedLayoutVersion !== LAYOUT_VERSION) {
    console.log(`🔄 Layout version changed from ${storedLayoutVersion || 'unknown'} to ${LAYOUT_VERSION} - resetting layout preferences`);
    // Reset layout-related preferences to ensure consistent layout
    // Keep functional preferences (favorites, theme) but reset layout
    migratedPrefs = {
      ...migratedPrefs,
      // Section visibility stays, but layout position is reset
    };
    // Update layout version
    safeSetItem(LAYOUT_VERSION_KEY, LAYOUT_VERSION);
  }

  return migratedPrefs;
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from localStorage
  const loadPreferences = useCallback(() => {
    // Check cookie consent state
    const consent = safeGetItem(CONSENT_KEY);
    setHasConsent(consent === 'true');

    // Check versions
    const storedVersion = safeGetItem(VERSION_KEY);
    const storedLayoutVersion = safeGetItem(LAYOUT_VERSION_KEY);

    // Initialize versions if not present
    if (!storedVersion) {
      safeSetItem(VERSION_KEY, PREFERENCES_VERSION);
    }
    if (!storedLayoutVersion) {
      safeSetItem(LAYOUT_VERSION_KEY, LAYOUT_VERSION);
    }

    // Load user preferences regardless of consent (functional storage)
    const storedPrefs = safeGetItem(STORAGE_KEY);
    if (storedPrefs) {
      try {
        const parsedPrefs = JSON.parse(storedPrefs);
        // Validate parsed data structure
        if (parsedPrefs && typeof parsedPrefs === 'object') {
          // Migrate preferences if needed
          const migratedPrefs = migratePreferences(parsedPrefs, storedVersion, storedLayoutVersion);
          setPreferences({ ...DEFAULT_PREFERENCES, ...migratedPrefs });

          // Save migrated preferences if they changed
          if (JSON.stringify(migratedPrefs) !== JSON.stringify(parsedPrefs)) {
            safeSetItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_PREFERENCES, ...migratedPrefs }));
          }
        } else {
          console.warn('⚠️ Invalid preferences format, using defaults');
          safeRemoveItem(STORAGE_KEY);
        }
      } catch (parseError) {
        console.error('⚠️ Error parsing preferences, clearing corrupted data:', parseError);
        safeRemoveItem(STORAGE_KEY);
      }
    } else {
      // No preferences stored, initialize versions
      safeSetItem(VERSION_KEY, PREFERENCES_VERSION);
      safeSetItem(LAYOUT_VERSION_KEY, LAYOUT_VERSION);
    }

    // Load favorites separately for backward compatibility
    const storedFavorites = safeGetItem(FAVORITES_KEY);
    if (storedFavorites) {
      try {
        const favorites = JSON.parse(storedFavorites);
        // Validate favorites is an array
        if (Array.isArray(favorites)) {
          setPreferences(prev => ({ ...prev, favorites }));
        } else {
          console.warn('⚠️ Invalid favorites format, clearing');
          safeRemoveItem(FAVORITES_KEY);
        }
      } catch (parseError) {
        console.error('⚠️ Error parsing favorites, clearing corrupted data:', parseError);
        safeRemoveItem(FAVORITES_KEY);
      }
    }

    setIsLoaded(true);
  }, []);

  // Save preferences to localStorage
  const savePreferences = useCallback((newPreferences: Partial<UserPreferences>) => {
    // We allow saving functional preferences without explicit tracking consent
    try {
      setPreferences(prevPrefs => {
        const updatedPrefs = { ...prevPrefs, ...newPreferences };

        safeSetItem(STORAGE_KEY, JSON.stringify(updatedPrefs));

        // Also save favorites separately for backward compatibility
        if (newPreferences.favorites !== undefined) {
          safeSetItem(FAVORITES_KEY, JSON.stringify(newPreferences.favorites));
        }

        return updatedPrefs;
      });
    } catch (error) {
      console.error('Error saving user preferences:', error);
    }
  }, []);

  // Add favorite
  const addFavorite = useCallback((symbol: string) => {
    setPreferences(prevPrefs => {
      const newFavorites = [...prevPrefs.favorites];
      if (!newFavorites.includes(symbol)) {
        newFavorites.push(symbol);

        // Save to localStorage
        const updatedPrefs = { ...prevPrefs, favorites: newFavorites };
        safeSetItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
        safeSetItem(FAVORITES_KEY, JSON.stringify(newFavorites));

        return updatedPrefs;
      }
      return prevPrefs;
    });
  }, []);

  // Remove favorite
  const removeFavorite = useCallback((symbol: string) => {
    setPreferences(prevPrefs => {
      const newFavorites = prevPrefs.favorites.filter(fav => fav !== symbol);

      // Save to localStorage
      const updatedPrefs = { ...prevPrefs, favorites: newFavorites };
      safeSetItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
      safeSetItem(FAVORITES_KEY, JSON.stringify(newFavorites));

      return updatedPrefs;
    });
  }, []);

  // Toggle favorite
  const toggleFavorite = useCallback((symbol: string) => {
    setPreferences(prevPrefs => {
      const isCurrentlyFavorite = prevPrefs.favorites.includes(symbol);
      const newFavorites = isCurrentlyFavorite
        ? prevPrefs.favorites.filter(fav => fav !== symbol)
        : [...prevPrefs.favorites, symbol];

      // Save to localStorage
      const updatedPrefs = { ...prevPrefs, favorites: newFavorites };
      safeSetItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
      safeSetItem(FAVORITES_KEY, JSON.stringify(newFavorites));

      return updatedPrefs;
    });
  }, []);

  /**
   * Apply a server favorites snapshot without wiping local edits that
   * landed after `baseList` was captured (see mergeServerFavorites).
   */
  const applyServerFavorites = useCallback((serverList: string[], baseList: string[]) => {
    setPreferences(prev => {
      const merged = mergeServerFavorites(prev.favorites, baseList, serverList);
      if (merged.length === prev.favorites.length && merged.every((t, i) => t === prev.favorites[i])) {
        return prev;
      }
      const updated = { ...prev, favorites: merged };
      safeSetItem(STORAGE_KEY, JSON.stringify(updated));
      safeSetItem(FAVORITES_KEY, JSON.stringify(merged));
      return updated;
    });
  }, []);

  // Clear all preferences
  const clearPreferences = useCallback(() => {
    safeRemoveItem(STORAGE_KEY);
    safeRemoveItem(FAVORITES_KEY);
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  // Set cookie consent
  const setConsent = useCallback((consent: boolean) => {
    setHasConsent(consent);
    if (consent) {
      safeSetItem(CONSENT_KEY, 'true');
      try {
        document.cookie = 'pmp-consent=true; max-age=31536000; path=/';
      } catch (e) {
        // Ignore cookie errors in incognito mode
      }
    } else {
      safeSetItem(CONSENT_KEY, 'declined');
    }
  }, []);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return {
    preferences,
    hasConsent,
    isLoaded,
    savePreferences,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    applyServerFavorites,
    clearPreferences,
    setConsent,
    loadPreferences
  };
}
