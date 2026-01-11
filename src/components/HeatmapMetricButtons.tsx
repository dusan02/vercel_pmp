/**
 * Heatmap Metric Toggle Switch Component
 * Minimal segmented control for metric selection (mobile-friendly, no knob)
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
        <div className="w-32 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
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

  // Colors (segmented control)
  // Requirement: inactive must be clearly gray; only active is blue.
  const surface = isDark ? 'bg-white/10' : 'bg-slate-100';
  const border = isDark ? 'border-white/15' : 'border-slate-200';
  const active = 'bg-blue-600 text-white';
  const inactive = isDark ? 'bg-white/10 text-white/75' : 'bg-slate-200 text-slate-700';

  return (
    <div
      className={`inline-flex items-center ${className}`}
      role="tablist"
      aria-label="Heatmap metric"
    >
      <div className={`inline-flex items-center rounded-lg border ${surface} ${border} p-0.5`}>
        <button
          type="button"
          role="tab"
          aria-selected={isPercent}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isPercent) onMetricChange('percent');
          }}
          className={`min-w-[32px] px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-200 ${isPercent ? active : inactive}`}
          aria-label="Percent Change"
          title="Percentage Change"
        >
          %
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isPercent}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isPercent) onMetricChange('mcap');
          }}
          className={`min-w-[32px] px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-200 ${!isPercent ? active : inactive}`}
          aria-label="Market Cap Change"
          title="Market Cap Change"
        >
          $
        </button>
      </div>
    </div>
  );
}
