/**
 * Cache Clear Button Component
 * 
 * Provides a button to clear all caches and reload the page
 * Useful for development and testing
 */

'use client';

import React, { useState } from 'react';
import { clearAllCachesAndReload, clearAllCaches, CacheClearResult } from '@/lib/utils/cacheClear';

interface CacheClearButtonProps {
  variant?: 'button' | 'link';
  className?: string;
  showDetails?: boolean;
}

export function CacheClearButton({ 
  variant = 'button', 
  className = '',
  showDetails = false 
}: CacheClearButtonProps) {
  const [isClearing, setIsClearing] = useState(false);
  const [lastResult, setLastResult] = useState<CacheClearResult | null>(null);

  const handleClear = async () => {
    if (isClearing) return;

    if (!confirm('Vyčistiť všetky cache? Toto vymaže vaše preferencie, portfolio a obľúbené akcie.')) {
      return;
    }

    setIsClearing(true);
    setLastResult(null);

    try {
      // Clear caches
      const result = await clearAllCaches({
        keepLocalStorageKeys: [], // Clear everything
        unregisterSW: true, // Unregister service worker
      });

      setLastResult(result);

      // Reload after a short delay
      setTimeout(() => {
        clearAllCachesAndReload({
          keepLocalStorageKeys: [],
          unregisterSW: true,
        });
      }, 500);
    } catch (error) {
      console.error('Error clearing caches:', error);
      setIsClearing(false);
      alert('Chyba pri vyčisťovaní cache. Skús to znova.');
    }
  };

  if (variant === 'link') {
    return (
      <button
        onClick={handleClear}
        disabled={isClearing}
        className={`text-sm text-blue-600 hover:text-blue-800 underline ${className}`}
        aria-label="Clear all caches"
      >
        {isClearing ? 'Clearing...' : 'Clear Cache'}
      </button>
    );
  }

  return (
    <div className="cache-clear-wrapper">
      <button
        onClick={handleClear}
        disabled={isClearing}
        className={`
          px-4 py-2 text-sm font-medium rounded-md
          bg-blue-600 text-white hover:bg-blue-700
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
          ${className}
        `}
        aria-label="Clear all caches and reload"
      >
        {isClearing ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin">⟳</span>
            Clearing...
          </span>
        ) : (
          'Clear Cache & Reload'
        )}
      </button>

      {showDetails && lastResult && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          <div>Service Worker: {lastResult.cleared.serviceWorker ? '✓' : '✗'}</div>
          <div>localStorage: {lastResult.cleared.localStorage ? '✓' : '✗'}</div>
          <div>sessionStorage: {lastResult.cleared.sessionStorage ? '✓' : '✗'}</div>
          <div>Caches: {lastResult.cleared.caches ? '✓' : '✗'}</div>
          {lastResult.errors.length > 0 && (
            <div className="text-red-600 dark:text-red-400">
              Errors: {lastResult.errors.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

