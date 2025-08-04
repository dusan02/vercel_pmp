import { useState, useEffect, useCallback } from 'react';

interface UseLazyLoadingOptions {
  initialLimit: number;
  incrementSize: number;
  totalItems: number;
  threshold?: number; // Distance from bottom to trigger loading
}

export function useLazyLoading({
  initialLimit,
  incrementSize,
  totalItems,
  threshold = 100
}: UseLazyLoadingOptions) {
  const [displayLimit, setDisplayLimit] = useState(initialLimit);
  const [isLoading, setIsLoading] = useState(false);

  const loadMore = useCallback(() => {
    if (displayLimit < totalItems && !isLoading) {
      setIsLoading(true);
      
      // Reduced delay for smoother experience
      setTimeout(() => {
        const newLimit = Math.min(displayLimit + incrementSize, totalItems);
        setDisplayLimit(newLimit);
        setIsLoading(false);
      }, 150); // Reduced from 300ms to 150ms
    }
  }, [displayLimit, totalItems, isLoading, incrementSize]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Check if user is near bottom
      if (documentHeight - scrollTop - windowHeight < threshold) {
        // Debounce scroll events to prevent rapid loading
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          loadMore();
        }, 50); // Small delay to prevent rapid triggers
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [loadMore, threshold]);

  const reset = useCallback(() => {
    setDisplayLimit(initialLimit);
    setIsLoading(false);
  }, [initialLimit]);

  return {
    displayLimit,
    isLoading,
    loadMore,
    reset,
    hasMore: displayLimit < totalItems
  };
} 