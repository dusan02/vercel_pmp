'use client';

import { useState, useEffect } from 'react';
import { Star, X } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { MoveAlertButton } from '@/components/notifications/MoveAlertButton';

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
  const [showAlertTip, setShowAlertTip] = useState(false);

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

  const handleToggle = () => {
    const nextAdding = !fav;
    toggleFavorite(ticker);
    if (nextAdding) {
      setShowAlertTip(true);
    } else {
      setShowAlertTip(false);
    }
  };

  return (
    <div className="relative inline-flex">
      <button
        onClick={handleToggle}
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

      {showAlertTip && fav && (
        <div
          role="dialog"
          aria-label={`Alert suggestion for ${ticker}`}
          className="absolute right-0 top-full mt-2 z-30 w-64 rounded-xl border border-blue-200 dark:border-blue-800/70 bg-white dark:bg-gray-900 shadow-lg p-3 text-left"
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold text-gray-900 dark:text-white">
              Saved {ticker} to Favorites
            </span>
            <button
              type="button"
              onClick={() => setShowAlertTip(false)}
              aria-label="Dismiss alert suggestion"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug mb-2">
            Get instant push alerts when {ticker} makes an unusual move (&gt;3%) or before earnings.
          </p>
          <MoveAlertButton symbol={ticker} label={`Alert me on ${ticker}`} />
        </div>
      )}
    </div>
  );
}
