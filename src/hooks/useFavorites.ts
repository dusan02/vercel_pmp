'use client';

import { useCallback, useMemo, useEffect } from 'react';
import { useUserPreferences } from './useUserPreferences';
import { useSession } from 'next-auth/react';

export function useFavorites() {
  const { data: session } = useSession();
  const {
    preferences,
    hasConsent,
    addFavorite: addPrefFavorite,
    removeFavorite: removePrefFavorite,
    toggleFavorite: togglePrefFavorite,
    savePreferences
  } = useUserPreferences();

  // Sync with DB on login
  useEffect(() => {
    async function syncFavorites() {
      if (session?.user?.id && preferences.favorites.length > 0) {
        // Check if we need to sync local favorites to DB (first time login)
        // We will do a 'sync' call which merges
        try {
          await fetch('/api/user/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'sync',
              favorites: preferences.favorites
            })
          });

          // Then fetch the merged list
          const res = await fetch('/api/user/favorites');
          if (res.ok) {
            const data = await res.json();
            if (data.favorites && Array.isArray(data.favorites)) {
              // Update local preferences to match DB
              savePreferences({ favorites: data.favorites });
            }
          }
        } catch (e) {
          console.error('Error syncing favorites:', e);
        }
      } else if (session?.user?.id && preferences.favorites.length === 0) {
        // Just fetch from DB
        try {
          const res = await fetch('/api/user/favorites');
          if (res.ok) {
            const data = await res.json();
            if (data.favorites && Array.isArray(data.favorites) && data.favorites.length > 0) {
              savePreferences({ favorites: data.favorites });
            }
          }
        } catch (e) {
          console.error('Error fetching favorites:', e);
        }
      }
    }

    // Run sync when session becomes available
    if (session?.user?.id) {
      syncFavorites();
    }
  }, [session?.user?.id]); // Only run on session change/login

  // Add favorite
  const addFavorite = useCallback(async (ticker: string) => {
    if (!hasConsent) return false;

    // Update local state immediately (optimistic)
    addPrefFavorite(ticker);

    // If logged in, update DB
    if (session?.user?.id) {
      try {
        await fetch('/api/user/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', ticker })
        });
      } catch (e) {
        console.error('Failed to add favorite to DB:', e);
        // Could revert local state here if strict consistency needed
      }
    }
    return true;
  }, [hasConsent, addPrefFavorite, session?.user?.id]);

  // Remove favorite
  const removeFavorite = useCallback(async (ticker: string) => {
    if (!hasConsent) return false;

    // Update local state immediately
    removePrefFavorite(ticker);

    // If logged in, update DB
    if (session?.user?.id) {
      try {
        await fetch('/api/user/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove', ticker })
        });
      } catch (e) {
        console.error('Failed to remove favorite from DB:', e);
      }
    }
    return true;
  }, [hasConsent, removePrefFavorite, session?.user?.id]);

  // Toggle favorite status
  const toggleFavorite = useCallback(async (ticker: string) => {
    if (!hasConsent) {
      console.warn('Cannot toggle favorite: Cookie consent not given');
      return false;
    }

    const isFav = preferences.favorites.includes(ticker);
    if (isFav) {
      return removeFavorite(ticker);
    } else {
      return addFavorite(ticker);
    }
  }, [hasConsent, preferences.favorites, addFavorite, removeFavorite]);

  // Convert string array to objects for backward compatibility if needed by consumers
  const favorites = useMemo(() =>
    preferences.favorites.map(ticker => ({
      ticker,
      added_at: new Date().toISOString()
    })),
    [preferences.favorites]
  );

  return {
    favorites, // Returns array of objects { ticker, added_at }
    favoriteTickers: preferences.favorites, // Returns string array
    loading: false,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite: (ticker: string) => preferences.favorites.includes(ticker),
    refresh: () => { },
  };
} 