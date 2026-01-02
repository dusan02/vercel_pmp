/**
 * Heatmap View Button Component
 * Fullscreen button for heatmap preview
 * Optimized with prefetch on hover for faster navigation
 */

'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { event } from '@/lib/ga';

interface HeatmapViewButtonProps {
  className?: string;
}

export function HeatmapViewButton({ className = '' }: HeatmapViewButtonProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [hasPrefetched, setHasPrefetched] = useState(false);

  // Prefetch route and API endpoint on mount (if component is visible)
  useEffect(() => {
    // Prefetch immediately when component mounts
    router.prefetch('/heatmap');
    setHasPrefetched(true);
  }, [router]);

  // Prefetch route and API endpoint on hover (backup)
  const handleMouseEnter = useCallback(() => {
    if (!hasPrefetched) {
      // Prefetch the route
      router.prefetch('/heatmap');
      // Prefetch the API endpoint to warm up connection
      if (typeof window !== 'undefined') {
        fetch('/api/heatmap', { method: 'HEAD' }).catch(() => {
          // Ignore errors, we just want to warm up the connection
        });
      }
      setHasPrefetched(true);
    }
  }, [router, hasPrefetched]);

  const handleFullscreen = useCallback(() => {
    if (isNavigating) return; // Prevent double clicks
    
    setIsNavigating(true);
    // Track fullscreen toggle event
    event('heatmap_fullscreen_toggle', { enabled: true });
    // Navigate to full heatmap page
    router.push('/heatmap');
  }, [router, isNavigating]);

  return (
    <button
      onClick={handleFullscreen}
      onMouseEnter={handleMouseEnter}
      disabled={isNavigating}
      className={`flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-semibold shadow-md disabled:opacity-75 disabled:cursor-wait ${className}`}
      aria-label="Enter fullscreen heatmap"
      title="Enter fullscreen heatmap"
    >
      {isNavigating ? (
        <>
          <svg 
            className="w-4 h-4 animate-spin" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        <>
          <svg 
            className="w-4 h-4" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" 
            />
          </svg>
          <span>Fullscreen</span>
        </>
      )}
    </button>
  );
}

