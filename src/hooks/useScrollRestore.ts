/**
 * Hook for restoring scroll position per view in mobile navigation
 * Prevents losing scroll position when switching between views
 * 
 * Production-hardened with:
 * - Race condition protection (isRestoringRef)
 * - Double requestAnimationFrame for stable restore timing
 * - Throttled scroll listener for performance
 * - Proper handling of scroll position 0
 * - Failsafe timeout for restore completion
 * - Scroll position clamping for content size changes
 */

import { useEffect, useRef } from 'react';

type ViewKey = 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks';

const scrollPositions = new Map<ViewKey, number>();

export function useScrollRestore(
  activeView: ViewKey,
  scrollContainerRef: React.RefObject<HTMLElement | null>
) {
  const isRestoringRef = useRef(false);
  const tickingRef = useRef(false);

  // Restore on view change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const savedPosition = scrollPositions.get(activeView) ?? 0;

    isRestoringRef.current = true;

    // Failsafe timeout: release restoring flag if rAF never completes
    // (can happen in background tabs or low-power mode)
    const failSafe = window.setTimeout(() => {
      isRestoringRef.current = false;
    }, 500);

    // Double rAF to wait for layout + dynamic content
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = scrollContainerRef.current;
        if (!c) {
          clearTimeout(failSafe);
          isRestoringRef.current = false;
          return;
        }

        // Clamp scrollTop to valid range (handles content size changes)
        const maxScroll = Math.max(0, c.scrollHeight - c.clientHeight);
        const clampedPosition = Math.min(savedPosition, Math.max(0, maxScroll));

        c.scrollTop = clampedPosition;
        
        clearTimeout(failSafe);
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
