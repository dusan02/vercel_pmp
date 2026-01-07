'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook pre prefetching neaktívnych mobile screens a API endpoints
 * Optimalizuje rýchlosť prepínania medzi tabmi
 */
export function useMobilePrefetch(activeView: string) {
  const router = useRouter();

  useEffect(() => {
    // Prefetch routes pre neaktívne views
    const viewsToPrefetch = ['heatmap', 'portfolio', 'favorites', 'earnings', 'allStocks'];
    viewsToPrefetch.forEach(view => {
      if (view !== activeView) {
        // Prefetch route (ak existuje)
        // router.prefetch(`/${view}`); // Ak máš routes pre jednotlivé views
      }
    });

    // Prefetch API endpoints pre neaktívne views
    const prefetchAPIs = () => {
      // Heatmap API - prefetch ak nie je aktívny
      if (activeView !== 'heatmap') {
        // Prefetch s low priority (neblokuje hlavné requesty)
        fetch('/api/heatmap?timeframe=day&metric=percent', { 
          method: 'HEAD',
          cache: 'force-cache',
          priority: 'low' as RequestPriority
        }).catch(() => {});
      }

      // Stocks API - prefetch ak nie je aktívny allStocks
      if (activeView !== 'allStocks') {
        fetch('/api/stocks?getAll=true&limit=50', { 
          method: 'HEAD',
          cache: 'force-cache',
          priority: 'low' as RequestPriority
        }).catch(() => {});
      }

      // Earnings API - prefetch ak nie je aktívny
      if (activeView !== 'earnings') {
        fetch('/api/earnings/today', { 
          method: 'HEAD',
          cache: 'force-cache',
          priority: 'low' as RequestPriority
        }).catch(() => {});
      }
    };

    // Prefetch po 3 sekundách (neblokuje initial load, dá čas na načítanie hlavného obsahu)
    const timer = setTimeout(prefetchAPIs, 3000);
    return () => clearTimeout(timer);
  }, [activeView, router]);
}
