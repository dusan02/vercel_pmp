/**
 * Hook for restoring scroll position per view in mobile navigation
 * Prevents losing scroll position when switching between views
 */

import { useEffect, useRef } from 'react';

type ViewKey = 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks';

const scrollPositions = new Map<ViewKey, number>();

export function useScrollRestore(
  activeView: ViewKey,
  scrollContainerRef: React.RefObject<HTMLElement>
) {
  const previousViewRef = useRef<ViewKey | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Save scroll position of previous view before switching
    if (previousViewRef.current && previousViewRef.current !== activeView) {
      scrollPositions.set(previousViewRef.current, container.scrollTop);
    }

    // Restore scroll position for current view
    const savedPosition = scrollPositions.get(activeView);
    if (savedPosition !== undefined) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = savedPosition;
        }
      });
    } else {
      // First time viewing this view - scroll to top
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = 0;
        }
      });
    }

    // Update previous view reference
    previousViewRef.current = activeView;
  }, [activeView, scrollContainerRef]);

  // Save scroll position on unmount
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      scrollPositions.set(activeView, container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      // Save final position on cleanup
      scrollPositions.set(activeView, container.scrollTop);
    };
  }, [activeView, scrollContainerRef]);
}
