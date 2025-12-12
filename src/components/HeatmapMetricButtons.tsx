/**
 * Heatmap Metric Buttons Component
 * Client-only rendering to avoid hydration issues
 */

'use client';

import React, { useState, useEffect } from 'react';
import { 
  HEATMAP_TOGGLE_CONTAINER, 
  getHeatmapToggleButtonClasses 
} from '@/lib/utils/buttonStyles';
import type { HeatmapMetric } from './MarketHeatmap';

interface HeatmapMetricButtonsProps {
  metric: HeatmapMetric;
  onMetricChange: (metric: HeatmapMetric) => void;
  className?: string;
}

export function HeatmapMetricButtons({
  metric,
  onMetricChange,
  className = '',
}: HeatmapMetricButtonsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className={`${HEATMAP_TOGGLE_CONTAINER} ${className}`} aria-hidden="true">
        <div className="w-20 h-7 bg-slate-100 dark:bg-slate-700 rounded animate-pulse mr-1" />
        <div className="w-24 h-7 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`${HEATMAP_TOGGLE_CONTAINER} ${className}`}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMetricChange('percent');
        }}
        className={getHeatmapToggleButtonClasses(metric === 'percent')}
        aria-label="Show percentage change"
        aria-pressed={metric === 'percent'}
      >
        % Change
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMetricChange('mcap');
        }}
        className={getHeatmapToggleButtonClasses(metric === 'mcap')}
        aria-label="Show market cap change"
        aria-pressed={metric === 'mcap'}
      >
        Mcap Change
      </button>
    </div>
  );
}
