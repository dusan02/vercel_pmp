/**
 * Heatmap Metric Toggle Switch Component
 * Toggle switch with sliding ball for metric selection
 */

'use client';

import React, { useState, useEffect } from 'react';
import type { HeatmapMetric } from './MarketHeatmap';
import { event } from '@/lib/ga';

interface HeatmapMetricButtonsProps {
  metric: HeatmapMetric;
  onMetricChange: (metric: HeatmapMetric) => void;
  className?: string;
  variant?: 'light' | 'dark'; // 'light' for light background (homepage), 'dark' for dark background (heatmap page)
}

export function HeatmapMetricButtons({
  metric,
  onMetricChange,
  className = '',
  variant = 'light', // Default to light for homepage
}: HeatmapMetricButtonsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className={`inline-flex items-center ${className}`} aria-hidden="true">
        <div className="w-32 h-8 bg-slate-100 dark:bg-slate-700 rounded-full animate-pulse" />
      </div>
    );
  }

  const isPercent = metric === 'percent';
  const isDark = variant === 'dark';

  const handleToggle = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const newMetric = isPercent ? 'mcap' : 'percent';
    onMetricChange(newMetric);
    
    // Track heatmap metric change event
    event('heatmap_change', {
      metric: newMetric,
      timeframe: 'day' // Heatmap page uses fixed 'day' timeframe
    });
  };

  // Text colors based on variant - improved contrast
  const activeTextColor = isDark ? 'text-white' : 'text-gray-900';
  const inactiveTextColor = isDark ? 'text-gray-300' : 'text-gray-600';
  
  // Toggle switch colors based on variant
  const toggleInactiveBg = isDark ? 'bg-gray-600' : 'bg-gray-300';
  const toggleActiveBg = 'bg-blue-600';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Left label */}
      <span
        className={`text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
          isPercent ? `${activeTextColor} font-semibold` : `${inactiveTextColor}`
        }`}
      >
        % Change
      </span>
      
      {/* Toggle switch - Smaller, more compact design */}
      <button
        onClick={handleToggle}
        onKeyDown={(e) => {
          // Keyboard support: Space or Enter toggles
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            handleToggle(e);
          }
        }}
        className={`
          relative inline-flex items-center
          h-5 w-9
          rounded-full
          transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1
          ${isDark ? 'focus:ring-offset-black' : 'focus:ring-offset-white'}
          ${isPercent 
            ? toggleInactiveBg
            : toggleActiveBg
          }
          cursor-pointer
          active:scale-95
          touch-action: manipulation
        `}
        aria-label={`Switch to ${isPercent ? 'market cap change' : 'percentage change'}`}
        role="switch"
        aria-checked={!isPercent}
        tabIndex={0}
      >
        {/* Sliding ball - smaller, more compact */}
        <span
          className={`
            absolute
            top-0.5
            left-0.5
            w-4 h-4
            bg-white
            rounded-full
            shadow-sm
            transition-all duration-200 ease-in-out
            ${isPercent ? 'translate-x-0' : 'translate-x-4'}
            z-10
          `}
          style={{ 
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.15)'
          }}
        />
      </button>
      
      {/* Right label */}
      <span
        className={`text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
          !isPercent ? `${activeTextColor} font-semibold` : `${inactiveTextColor}`
        }`}
      >
        Mcap Change
      </span>
    </div>
  );
}
