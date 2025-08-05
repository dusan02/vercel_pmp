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
      
      // Reduced delay for smoother experience
      setTimeout(() => {
        const newLimit = Math.min(displayLimit + incrementSize, totalItems);
        setDisplayLimit(newLimit);
        setIsLoading(false);
        
        // 🚀 PROGRESSIVE: Trigger remaining stocks loading if enabled
        if (enableProgressiveLoading && onLoadRemaining && !hasTriggeredRemaining) {
          console.log('🔄 Lazy loading triggered remaining stocks load');
          setHasTriggeredRemaining(true);
          onLoadRemaining();
        }
      }, 150); // Reduced from 300ms to 150ms
    }
  }, [displayLimit, totalItems, isLoading, incrementSize, enableProgressiveLoading, onLoadRemaining, hasTriggeredRemaining]);

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
    setHasTriggeredRemaining(false);
  }, [initialLimit]);

  return {
    displayLimit,
    isLoading,
    loadMore,
    reset,
    hasMore: displayLimit < totalItems,
    hasTriggeredRemaining
  };
} 