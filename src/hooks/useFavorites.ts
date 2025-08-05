'use client';

import { useCallback } from 'react';
import { useUserPreferences } from './useUserPreferences';

export function useFavorites() {
  const { 
    preferences, 
    hasConsent, 
    addFavorite: addPrefFavorite, 
    removeFavorite: removePrefFavorite,
    toggleFavorite: togglePrefFavorite 
  } = useUserPreferences();

  // Convert string array to Favorite objects for backward compatibility
  const favorites = preferences.favorites.map(ticker => ({
    ticker,
    added_at: new Date().toISOString() // We don't store timestamps anymore, but keep interface
  }));

  // Add favorite
  const addFavorite = useCallback((ticker: string) => {
    if (!hasConsent) return false;
    addPrefFavorite(ticker);
    return true;
  }, [hasConsent, addPrefFavorite]);

  // Remove favorite
  const removeFavorite = useCallback((ticker: string) => {
    if (!hasConsent) return false;
    removePrefFavorite(ticker);
    return true;
  }, [hasConsent, removePrefFavorite]);

  // Check if ticker is in favorites
  const isFavorite = useCallback((ticker: string) => {
    return preferences.favorites.includes(ticker);
  }, [preferences.favorites]);

  // Toggle favorite status
  const toggleFavorite = useCallback((ticker: string) => {
    if (!hasConsent) return false;
    togglePrefFavorite(ticker);
    return true;
  }, [hasConsent, togglePrefFavorite]);

  return {
    favorites,
    loading: false, // No loading state needed with new system
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    refresh: () => {}, // No refresh needed
  };
} 