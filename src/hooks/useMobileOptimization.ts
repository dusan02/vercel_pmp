'use client';

import { useEffect, useRef } from 'react';

/**
 * Hook pre optimalizáciu mobile UX - prioritizuje kritické resources
 * - Preconnect k API endpointom
 * - DNS prefetch
 * - Prioritizuje heatmap API (prvá obrazovka)
 * - Deferuje neaktívne sekcie
 */
export function useMobileOptimization(activeView: string) {
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current || typeof window === 'undefined') return;
    hasInitialized.current = true;

    // CRITICAL: Preconnect k API endpointom (rýchlejšie requesty)
    // Note: Preconnect už je v layout.tsx, takže tu len kontrolujeme
    const existingPreconnect = document.querySelector('link[rel="preconnect"][href*="/api"]');
    if (!existingPreconnect) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = window.location.origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }

    // DNS prefetch pre externé API (ak používaš)
    // const dnsPrefetch = document.createElement('link');
    // dnsPrefetch.rel = 'dns-prefetch';
    // dnsPrefetch.href = 'https://api.polygon.io';
    // document.head.appendChild(dnsPrefetch);

    // CRITICAL: Prioritizuj heatmap API ak je aktívny (prvá obrazovka)
    if (activeView === 'heatmap') {
      // Prefetch heatmap API s high priority
      const prefetchHeatmap = () => {
        // Use fetch with high priority (Chrome/Edge)
        fetch('/api/heatmap?timeframe=day&metric=percent', {
          method: 'GET',
          priority: 'high' as RequestPriority,
          cache: 'default',
        }).catch(() => {
          // Ignore errors, just warm up connection
        });
      };

      // Prefetch okamžite (ak ešte nie je načítaný)
      prefetchHeatmap();
    }

    // Defer neaktívne API calls (low priority)
    const deferNonActiveAPIs = () => {
      if (activeView !== 'allStocks') {
        // Low priority prefetch
        fetch('/api/stocks?getAll=true&limit=50', {
          method: 'HEAD',
          priority: 'low' as RequestPriority,
        }).catch(() => {});
      }

      if (activeView !== 'earnings') {
        fetch('/api/earnings/today', {
          method: 'HEAD',
          priority: 'low' as RequestPriority,
        }).catch(() => {});
      }
    };

    // Defer po 2 sekundách (dá čas na načítanie hlavného obsahu)
    const deferTimer = setTimeout(deferNonActiveAPIs, 2000);

    return () => {
      clearTimeout(deferTimer);
    };
  }, [activeView]);
}
