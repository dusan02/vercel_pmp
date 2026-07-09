'use client';

import { useEffect } from 'react';

/**
 * Prefetch API endpoints for inactive mobile screens.
 * Fires after 3s delay to avoid blocking initial load.
 */
export function useMobilePrefetch(activeView: string) {
  useEffect(() => {
    const prefetchAPIs = () => {
      if (activeView !== 'allStocks') {
        fetch('/api/stocks?getAll=true&limit=50', {
          cache: 'force-cache',
          priority: 'low' as RequestPriority
        }).catch(() => {});
      }

      if (activeView !== 'earnings') {
        fetch('/api/earnings/today', {
          cache: 'force-cache',
          priority: 'low' as RequestPriority
        }).catch(() => {});
      }
    };

    const timer = setTimeout(prefetchAPIs, 3000);
    return () => clearTimeout(timer);
  }, [activeView]);
}
