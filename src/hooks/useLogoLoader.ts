/**
 * Hook for optimized logo loading
 * Handles preloading, lazy loading, and caching of company logos
 */

import { useEffect, useRef, useCallback } from 'react';

interface UseLogoLoaderOptions {
  tickers: string[];
  priorityCount?: number;
  size?: number;
}

export function useLogoLoader({ 
  tickers, 
  priorityCount = 100,
  size = 32 
}: UseLogoLoaderOptions) {
  const preloadedRef = useRef<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Preload priority logos (first N visible)
  const preloadPriorityLogos = useCallback((priorityTickers: string[]) => {
    priorityTickers.forEach((ticker) => {
      const logoUrl = `/api/logo/${ticker}?s=${size}`;
      
      // Skip if already preloaded
      if (preloadedRef.current.has(logoUrl)) return;
      
      // Check if already in DOM
      if (document.querySelector(`link[href="${logoUrl}"]`)) {
        preloadedRef.current.add(logoUrl);
        return;
      }

      // Create preload link
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = logoUrl;
      link.crossOrigin = 'anonymous';
      link.setAttribute('fetchpriority', 'high');
      document.head.appendChild(link);
      
      preloadedRef.current.add(logoUrl);
    });
  }, [size]);

  // Setup Intersection Observer for lazy loading
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;

    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer for all logo images
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            if (img && !img.complete && img.loading === 'lazy') {
              // Force eager loading when visible
              img.loading = 'eager';
            }
            observerRef.current?.unobserve(img);
          }
        });
      },
      {
        rootMargin: '2000px', // Start loading 2000px before visible
        threshold: 0.01
      }
    );

    // Observe all logo images
    const logoImages = document.querySelectorAll<HTMLImageElement>(
      'img[data-logo-ticker]'
    );
    logoImages.forEach((img) => {
      observerRef.current?.observe(img);
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [tickers.length]); // Re-run when tickers change

  // Preload priority logos when tickers change
  useEffect(() => {
    if (tickers.length === 0) return;

    const priorityTickers = tickers.slice(0, priorityCount);
    preloadPriorityLogos(priorityTickers);
  }, [tickers, priorityCount, preloadPriorityLogos]);

  // Cleanup preload links on unmount
  useEffect(() => {
    return () => {
      preloadedRef.current.forEach((logoUrl) => {
        const link = document.querySelector(`link[href="${logoUrl}"]`);
        if (link) link.remove();
      });
      preloadedRef.current.clear();
    };
  }, []);

  return {
    preloadPriorityLogos,
    preloadedCount: preloadedRef.current.size
  };
}

