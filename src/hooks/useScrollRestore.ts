/**
 * Hook for restoring scroll position per view in mobile navigation
 * Prevents losing scroll position when switching between views
 * 
 * Production-hardened with:
 * - Race condition protection (isRestoringRef)
 * - Double requestAnimationFrame for stable restore timing
 * - Throttled scroll listener for performance
 * - Proper handling of scroll position 0
 */

import { useEffect, useRef } from 'react';

type ViewKey = 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks';

const scrollPositions = new Map<ViewKey, number>();

export function useScrollRestore(
  activeView: ViewKey,
  scrollContainerRef: React.RefObject<HTMLElement | null>
) {
  const previousViewRef = useRef<ViewKey | null>(null);
  const isRestoringRef = useRef(false);
  const tickingRef = useRef(false);

  // Restore on view change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    previousViewRef.current = activeView;

    const savedPosition = scrollPositions.get(activeView) ?? 0;

    isRestoringRef.current = true;

    // Double rAF to wait for layout + dynamic content
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = scrollContainerRef.current;
        if (!c) {
          isRestoringRef.current = false;
          return;
        }

        c.scrollTop = savedPosition;
        isRestoringRef.current = false;
      });
    });
  }, [activeView]); // ref object doesn't need to be in deps

  // Track scroll (throttled)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isRestoringRef.current) return;
      if (tickingRef.current) return;

      tickingRef.current = true;
      requestAnimationFrame(() => {
        const c = scrollContainerRef.current;
        if (c && !isRestoringRef.current) {
          scrollPositions.set(activeView, c.scrollTop); // store 0 too
        }
        tickingRef.current = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      const c = scrollContainerRef.current;
      if (c && !isRestoringRef.current) {
        scrollPositions.set(activeView, c.scrollTop);
      }
    };
  }, [activeView]);
}
