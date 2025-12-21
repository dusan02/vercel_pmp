/**
 * Heatmap View Button Component
 * Fullscreen button for heatmap preview
 */

'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface HeatmapViewButtonProps {
  className?: string;
}

export function HeatmapViewButton({ className = '' }: HeatmapViewButtonProps) {
  const router = useRouter();

  const handleFullscreen = useCallback(() => {
    // Navigate to full heatmap page
    router.push('/heatmap');
  }, [router]);

  return (
    <button
      onClick={handleFullscreen}
      className={`flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-semibold shadow-md ${className}`}
      aria-label="Enter fullscreen heatmap"
      title="Enter fullscreen heatmap"
    >
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
    </button>
  );
}

