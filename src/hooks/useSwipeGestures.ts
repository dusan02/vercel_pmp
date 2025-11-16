'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

interface SwipeConfig {
  minSwipeDistance?: number;
  maxSwipeTime?: number;
  preventDefault?: boolean;
}

interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipe?: (direction: 'left' | 'right' | 'up' | 'down') => void;
}

export function useSwipeGestures(
  elementRef: React.RefObject<HTMLElement>,
  callbacks: SwipeCallbacks,
  config: SwipeConfig = {}
) {
  const [isClient, setIsClient] = useState(false);
  
  const {
    minSwipeDistance = 50,
    maxSwipeTime = 300,
    preventDefault = true
  } = config;

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isClient) return;
    
    // Don't handle touch events on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }
    
    if (preventDefault) {
      e.preventDefault();
    }
    
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
  }, [isClient, preventDefault]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isClient) return;
    
    // Don't handle touch events on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }
    
    if (preventDefault) {
      e.preventDefault();
    }
  }, [isClient, preventDefault]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!isClient) return;
    
    // Don't handle touch events on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }
    
    if (preventDefault) {
      e.preventDefault();
    }

    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    if (!touch) return;
    touchEndRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };

    const swipeDistance = {
      x: touchEndRef.current.x - touchStartRef.current.x,
      y: touchEndRef.current.y - touchStartRef.current.y
    };

    const swipeTime = touchEndRef.current.time - touchStartRef.current.time;

    // Check if swipe meets minimum distance and time requirements
    if (swipeTime <= maxSwipeTime) {
      const absX = Math.abs(swipeDistance.x);
      const absY = Math.abs(swipeDistance.y);

      if (absX > minSwipeDistance || absY > minSwipeDistance) {
        // Determine swipe direction
        if (absX > absY) {
          // Horizontal swipe
          if (swipeDistance.x > 0) {
            callbacks.onSwipeRight?.();
            callbacks.onSwipe?.('right');
          } else {
            callbacks.onSwipeLeft?.();
            callbacks.onSwipe?.('left');
          }
        } else {
          // Vertical swipe
          if (swipeDistance.y > 0) {
            callbacks.onSwipeDown?.();
            callbacks.onSwipe?.('down');
          } else {
            callbacks.onSwipeUp?.();
            callbacks.onSwipe?.('up');
          }
        }
      }
    }

    // Reset touch data
    touchStartRef.current = null;
    touchEndRef.current = null;
  }, [isClient, callbacks, minSwipeDistance, maxSwipeTime, preventDefault]);

  useEffect(() => {
    if (!isClient) return;
    
    const element = elementRef.current;
    if (!element) return;

    // Add touch event listeners
    element.addEventListener('touchstart', handleTouchStart, { passive: !preventDefault });
    element.addEventListener('touchmove', handleTouchMove, { passive: !preventDefault });
    element.addEventListener('touchend', handleTouchEnd, { passive: !preventDefault });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isClient, elementRef, handleTouchStart, handleTouchMove, handleTouchEnd, preventDefault]);

  return {
    touchStart: touchStartRef.current,
    touchEnd: touchEndRef.current
  };
}

// Hook for pull-to-refresh functionality
export function usePullToRefresh(
  elementRef: React.RefObject<HTMLElement>,
  onRefresh: () => void,
  config: { threshold?: number; resistance?: number } = {}
) {
  const [isClient, setIsClient] = useState(false);
  
  const { threshold = 80, resistance = 0.6 } = config;
  const pullStartRef = useRef<number | null>(null);
  const pullDistanceRef = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isClient) return;
    
    const element = elementRef.current;
    if (!element) return;

    // Only trigger pull-to-refresh when at the top of the page
    if (element.scrollTop === 0) {
      const touch = e.touches[0];
      if (!touch) return;
      pullStartRef.current = touch.clientY;
      isPullingRef.current = true;
    }
  }, [isClient, elementRef]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isClient) return;
    if (!isPullingRef.current || !pullStartRef.current) return;

    const touch = e.touches[0];
    if (!touch) return;
    const pullDistance = (touch.clientY - pullStartRef.current) * resistance;

    if (pullDistance > 0) {
      pullDistanceRef.current = pullDistance;
      
      // Add visual feedback
      const element = elementRef.current;
      if (element) {
        element.style.transform = `translateY(${Math.min(pullDistance, threshold)}px)`;
        element.style.transition = 'transform 0.1s ease';
      }

      e.preventDefault();
    }
  }, [isClient, elementRef, resistance, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (!isClient) return;
    if (!isPullingRef.current) return;

    const element = elementRef.current;
    if (element) {
      // Reset transform
      element.style.transform = '';
      element.style.transition = 'transform 0.3s ease';
    }

    // Trigger refresh if threshold is met
    if (pullDistanceRef.current >= threshold) {
      onRefresh();
    }

    // Reset state
    pullStartRef.current = null;
    pullDistanceRef.current = 0;
    isPullingRef.current = false;
  }, [isClient, elementRef, threshold, onRefresh]);

  useEffect(() => {
    if (!isClient) return;
    
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isClient, elementRef, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isPulling: isClient ? isPullingRef.current : false,
    pullDistance: isClient ? pullDistanceRef.current : 0
  };
} 