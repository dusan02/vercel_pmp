'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';

interface AddToFavoritesProps {
  ticker: string;
}

/**
 * Client-side "Add to Favorites" button for analysis pages.
 * Shares the same favorites store as the rest of the app (useFavorites →
 * useUserPreferences + DB sync) — previously wrote a separate
 * 'pmp-favorites' key, which diverged and silently un-favorited tickers.
 */
export function AddToWatchlist({ ticker }: AddToFavoritesProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fav = isFavorite(ticker);

  // Avoid hydration mismatch — render placeholder until mounted
  if (!mounted) {
    return (
      <button
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
        aria-label="Add to favorites"
      >
        <Star className="w-4 h-4" />
        <span className="hidden sm:inline">Favorites</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => toggleFavorite(ticker)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
        fav
          ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:text-yellow-600 dark:hover:text-yellow-400 hover:border-yellow-200 dark:hover:border-yellow-800'
      }`}
      aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
      title={fav ? 'Remove from favorites' : 'Add to favorites — no sign-up needed'}
    >
      <Star className={`w-4 h-4 ${fav ? 'fill-current' : ''}`} />
      <span className="hidden sm:inline">{fav ? 'In Favorites' : 'Add to Favorites'}</span>
    </button>
  );
}
