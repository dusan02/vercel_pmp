/**
 * Hook for virtualized table rendering
 * Optimizes rendering of large tables by only rendering visible rows
 * 
 * Note: This is a lightweight virtualization hint hook
 * Full virtualization would require a library like react-window
 */

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';

interface UseTableVirtualizationOptions {
  items: any[];
  itemHeight?: number;
  containerHeight?: number;
  overscan?: number; // Number of items to render outside visible area
}

export function useTableVirtualization({
  items,
  itemHeight = 50, // Default row height in pixels
  containerHeight,
  overscan = 5 // Render 5 extra items above and below
}: UseTableVirtualizationOptions) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visibleHeight, setVisibleHeight] = useState(containerHeight || 0);

  // Calculate visible range
  const { startIndex, endIndex, totalHeight } = useMemo(() => {
    if (items.length === 0) {
      return { startIndex: 0, endIndex: 0, totalHeight: 0 };
    }

    const actualHeight = containerHeight || visibleHeight || window.innerHeight;
    const visibleCount = Math.ceil(actualHeight / itemHeight);
    
    // Calculate which items should be visible
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length,
      startIndex + visibleCount + overscan * 2
    );

    const totalHeight = items.length * itemHeight;

    return { startIndex, endIndex, totalHeight };
  }, [items.length, scrollTop, itemHeight, containerHeight, visibleHeight, overscan]);

  // Visible items
  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);

  // Handle scroll
  const handleScroll = useCallback((event: Event) => {
    const target = event.target as HTMLElement;
    setScrollTop(target.scrollTop);
  }, []);

  // Measure container height
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setVisibleHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  return {
    visibleItems,
    startIndex,
    endIndex,
    totalHeight,
    containerRef,
    // Offset for positioning visible items
    offsetY: startIndex * itemHeight
  };
}

