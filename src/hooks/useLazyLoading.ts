import { useState, useEffect, useCallback } from 'react';

interface UseLazyLoadingOptions {
  initialLimit: number;
  incrementSize: number;
  totalItems: number;
  threshold?: number; // Distance from bottom to trigger loading
  onLoadRemaining?: () => void; // Callback for loading remaining stocks
  enableProgressiveLoading?: boolean; // Enable progressive loading
}

export function useLazyLoading({
  initialLimit,
  incrementSize,
  totalItems,
  threshold = 100,
  onLoadRemaining,
  enableProgressiveLoading = false
}: UseLazyLoadingOptions) {
  const [displayLimit, setDisplayLimit] = useState(initialLimit);
  const [isLoading, setIsLoading] = useState(false);
  const [hasTriggeredRemaining, setHasTriggeredRemaining] = useState(false);

  const loadMore = useCallback(() => {
    if (displayLimit < totalItems && !isLoading) {
      setIsLoading(true);
      
      // Use requestAnimationFrame for smoother rendering
      // Load immediately without delay for better UX
      requestAnimationFrame(() => {
        const newLimit = Math.min(displayLimit + incrementSize, totalItems);
        setDisplayLimit(newLimit);
        
        // Use another RAF to set loading to false after render
        requestAnimationFrame(() => {
          setIsLoading(false);
        });
        
        // 🚀 PROGRESSIVE: Trigger remaining stocks loading if enabled
        // Trigger when we're close to the limit (not just once)
        if (enableProgressiveLoading && onLoadRemaining) {
          // Trigger if we haven't triggered yet OR if we're loading more than 80% of total
          const shouldTrigger = !hasTriggeredRemaining || (newLimit / totalItems > 0.8);
          if (shouldTrigger && !hasTriggeredRemaining) {
            console.log('🔄 Lazy loading triggered remaining stocks load');
            setHasTriggeredRemaining(true);
            // Load remaining stocks in background (non-blocking)
            setTimeout(() => {
              onLoadRemaining();
            }, 0);
          }
        }
      });
    }
  }, [displayLimit, totalItems, isLoading, incrementSize, enableProgressiveLoading, onLoadRemaining, hasTriggeredRemaining]);

  useEffect(() => {
    let rafId: number | null = null;
    let timeoutId: NodeJS.Timeout;
    let lastScrollTop = 0;
    
    const handleScroll = () => {
      // Use requestAnimationFrame for smooth scroll handling
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
        const scrollTop = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const distanceFromBottom = documentHeight - scrollTop - windowHeight;
        
        // Increased threshold for earlier loading (prevent stuttering)
        // Load more when user is 500px from bottom (instead of 200px)
        // Also trigger if we're at the bottom and there's more to load
        const isNearBottom = distanceFromBottom < Math.max(threshold, 500);
        const isAtBottom = distanceFromBottom < 100; // Very close to bottom
        if ((isNearBottom || isAtBottom) && !isLoading && displayLimit < totalItems) {
          // Debounce to prevent rapid triggers, but use shorter delay
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            loadMore();
          }, 16); // ~1 frame at 60fps for smoother experience
        }
        
        lastScrollTop = scrollTop;
        rafId = null;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      clearTimeout(timeoutId);
    };
  }, [loadMore, threshold, isLoading]);

  const reset = useCallback(() => {
    setDisplayLimit(initialLimit);
    setIsLoading(false);
    setHasTriggeredRemaining(false);
  }, []); // Remove initialLimit dependency to prevent infinite loops

  // Auto-update displayLimit when totalItems increases (new data loaded)
  useEffect(() => {
    if (totalItems > displayLimit && !isLoading) {
      // Automatically increase limit to show new data
      const newLimit = Math.min(displayLimit + incrementSize, totalItems);
      if (newLimit > displayLimit) {
        setDisplayLimit(newLimit);
      }
    }
  }, [totalItems, displayLimit, incrementSize, isLoading]);

  return {
    displayLimit,
    isLoading,
    loadMore,
    reset,
    hasMore: displayLimit < totalItems,
    hasTriggeredRemaining
  };
} 