'use client';

import { useState, useEffect, useCallback } from 'react';

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
  showAllStocksSection?: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  favorites: [],
  theme: 'auto',
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
  showAllStocksSection: true
};

const STORAGE_KEY = 'pmp-user-preferences';
const FAVORITES_KEY = 'pmp-favorites';
const CONSENT_KEY = 'pmp-cookie-consent';

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from localStorage
  const loadPreferences = useCallback(() => {
    try {
      // Check cookie consent state
      const consent = localStorage.getItem(CONSENT_KEY);
      setHasConsent(consent === 'true');

      // Load user preferences regardless of consent (functional storage)
      const storedPrefs = localStorage.getItem(STORAGE_KEY);
      if (storedPrefs) {
        const parsedPrefs = JSON.parse(storedPrefs);
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsedPrefs });
      }

      // Load favorites separately for backward compatibility
      const storedFavorites = localStorage.getItem(FAVORITES_KEY);
      if (storedFavorites) {
        const favorites = JSON.parse(storedFavorites);
        setPreferences(prev => ({ ...prev, favorites }));
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save preferences to localStorage
  const savePreferences = useCallback((newPreferences: Partial<UserPreferences>) => {
    // We allow saving functional preferences without explicit tracking consent
    try {
      setPreferences(prevPrefs => {
        const updatedPrefs = { ...prevPrefs, ...newPreferences };
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
        
        // Also save favorites separately for backward compatibility
        if (newPreferences.favorites !== undefined) {
          localStorage.setItem(FAVORITES_KEY, JSON.stringify(newPreferences.favorites));
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
        
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
      
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
      
      return updatedPrefs;
    });
  }, []);

  // Clear all preferences
  const clearPreferences = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(FAVORITES_KEY);
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  // Set cookie consent
  const setConsent = useCallback((consent: boolean) => {
    setHasConsent(consent);
    if (consent) {
      localStorage.setItem(CONSENT_KEY, 'true');
      document.cookie = 'pmp-consent=true; max-age=31536000; path=/';
    } else {
      localStorage.setItem(CONSENT_KEY, 'declined');
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
    clearPreferences,
    setConsent,
    loadPreferences
  };
}
