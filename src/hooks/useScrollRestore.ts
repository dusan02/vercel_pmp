/**
 * Hook for restoring scroll position per view in mobile navigation
 * Prevents losing scroll position when switching between views
 * 
 * Production-hardened with:
 * - Race condition protection (isRestoringRef)
 * - Double requestAnimationFrame for stable restore timing
 * - Throttled scroll listener for performance
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

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Save scroll position of previous view before switching
    if (previousViewRef.current && previousViewRef.current !== activeView) {
      const prevScrollTop = container.scrollTop;
      // Only save if scroll position > 0 (don't overwrite with 0 during race)
      if (prevScrollTop > 0) {
        scrollPositions.set(previousViewRef.current, prevScrollTop);
      }
    }

    // Restore scroll position for current view
    const savedPosition = scrollPositions.get(activeView);
    
    // Set restoring flag to prevent scroll listener from overwriting
    isRestoringRef.current = true;

    if (savedPosition !== undefined) {
      // Double requestAnimationFrame for stable restore timing
      // First rAF: wait for current frame
      requestAnimationFrame(() => {
        // Second rAF: wait for DOM to be fully ready (especially for dynamic imports)
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = savedPosition;
            // Release restoring flag after restore completes
            requestAnimationFrame(() => {
              isRestoringRef.current = false;
            });
          }
        });
      });
    } else {
      // First time viewing this view - scroll to top
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = 0;
            requestAnimationFrame(() => {
              isRestoringRef.current = false;
            });
          }
        });
      });
    }

    // Update previous view reference
    previousViewRef.current = activeView;
  }, [activeView, scrollContainerRef]);

  // Save scroll position on scroll (throttled)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Ignore scroll events during restore to prevent race condition
      if (isRestoringRef.current) return;
      
      // Throttle scroll events using requestAnimationFrame
      if (tickingRef.current) return;

      tickingRef.current = true;
      requestAnimationFrame(() => {
        if (container && !isRestoringRef.current) {
          const scrollTop = container.scrollTop;
          // Only save if scroll position > 0 (don't overwrite with 0)
          if (scrollTop > 0) {
            scrollPositions.set(activeView, scrollTop);
          }
        }
        tickingRef.current = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      // Save final position on cleanup (if not restoring)
      if (!isRestoringRef.current && container.scrollTop > 0) {
        scrollPositions.set(activeView, container.scrollTop);
      }
    };
  }, [activeView, scrollContainerRef]);
}
