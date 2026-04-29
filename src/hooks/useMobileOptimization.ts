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

    // NOTE: Heatmap prefetch removed — useHeatmapData already fetches on mount.
    // Stocks/earnings prefetch removed — useMobilePrefetch handles deferred prefetch.
    // This hook now only handles preconnect (above).
  }, [activeView]);
}
