'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFavoritesKey } from '@/lib/projectUtils';

interface Favorite {
  ticker: string;
  added_at: string;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);

  // Load favorites from localStorage
  const loadFavorites = useCallback(() => {
    setLoading(true);
    try {
      const favoritesKey = getFavoritesKey();
      const favoritesData = localStorage.getItem(favoritesKey);
      
      if (favoritesData) {
        const favoritesList = JSON.parse(favoritesData);
        setFavorites(favoritesList);
      } else {
        setFavorites([]);
      }
    } catch (err) {
      console.error('Error loading favorites from localStorage:', err);
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save favorites to localStorage
  const saveFavorites = useCallback((favoritesList: Favorite[]) => {
    try {
      const favoritesKey = getFavoritesKey();
      const favoritesData = JSON.stringify(favoritesList);
      localStorage.setItem(favoritesKey, favoritesData);
    } catch (err) {
      console.error('Error saving favorites to localStorage:', err);
    }
  }, []);

  // Add favorite
  const addFavorite = useCallback((ticker: string) => {
    const newFavorite: Favorite = {
      ticker,
      added_at: new Date().toISOString()
    };
    
    const updatedFavorites = [...favorites, newFavorite];
    setFavorites(updatedFavorites);
    saveFavorites(updatedFavorites);
    return true;
  }, [favorites, saveFavorites]);

  // Remove favorite
  const removeFavorite = useCallback((ticker: string) => {
    const updatedFavorites = favorites.filter(fav => fav.ticker !== ticker);
    setFavorites(updatedFavorites);
    saveFavorites(updatedFavorites);
    return true;
  }, [favorites, saveFavorites]);

  // Check if ticker is in favorites
  const isFavorite = useCallback((ticker: string) => {
    return favorites.some(fav => fav.ticker === ticker);
  }, [favorites]);

  // Toggle favorite status
  const toggleFavorite = useCallback((ticker: string) => {
    if (isFavorite(ticker)) {
      return removeFavorite(ticker);
    } else {
      return addFavorite(ticker);
    }
  }, [isFavorite, addFavorite, removeFavorite]);

  // Load favorites on mount
  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  return {
    favorites,
    loading,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    refresh: loadFavorites,
  };
} 