'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';

interface AddToWatchlistProps {
  ticker: string;
}

const FAVORITES_KEY = 'pmp-favorites';

/**
 * Client-side "Add to Watchlist" button for analysis pages.
 * Uses localStorage — no registration required.
 * Renders a star button that toggles the ticker in the user's favorites.
 */
export function AddToWatchlist({ ticker }: AddToWatchlistProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      const favorites: string[] = stored ? JSON.parse(stored) : [];
      setIsFavorite(favorites.includes(ticker));
    } catch {
      // ignore
    }
  }, [ticker]);

  const toggleFavorite = () => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      let favorites: string[] = stored ? JSON.parse(stored) : [];
      if (favorites.includes(ticker)) {
        favorites = favorites.filter((f) => f !== ticker);
        setIsFavorite(false);
      } else {
        favorites.push(ticker);
        setIsFavorite(true);
      }
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // ignore
    }
  };

  // Avoid hydration mismatch — render placeholder until mounted
  if (!mounted) {
    return (
      <button
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
        aria-label="Add to watchlist"
      >
        <Star className="w-4 h-4" />
        <span className="hidden sm:inline">Watchlist</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleFavorite}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
        isFavorite
          ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:text-yellow-600 dark:hover:text-yellow-400 hover:border-yellow-200 dark:hover:border-yellow-800'
      }`}
      aria-label={isFavorite ? 'Remove from watchlist' : 'Add to watchlist'}
      title={isFavorite ? 'Remove from watchlist' : 'Add to watchlist — no sign-up needed'}
    >
      <Star className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
      <span className="hidden sm:inline">{isFavorite ? 'In Watchlist' : 'Add to Watchlist'}</span>
    </button>
  );
}
