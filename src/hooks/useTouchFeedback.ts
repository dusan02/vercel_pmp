'use client';

import { useCallback } from 'react';

/**
 * Hook for consistent touch feedback on mobile
 * Provides opacity change on touch for better UX
 */
export function useTouchFeedback() {
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    e.currentTarget.style.opacity = '0.8';
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLElement>) => {
    e.currentTarget.style.opacity = '1';
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    style: {
      WebkitTapHighlightColor: 'transparent',
      touchAction: 'manipulation' as const,
    },
  };
}
