/**
 * Heatmap Metric Chips — one-tap pill buttons for choosing what colors the
 * tiles, grouped by metric family. Replaces the dropdown on /heatmap —
 * same interaction model as the screener Quick Screens / filter chips.
 *
 * Horizontally scrollable so it works on mobile too. SSR-safe: renders a
 * placeholder until mount (metric comes from localStorage).
 */

'use client';

import React, { useState, useEffect } from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';
import { HEATMAP_METRICS, HEATMAP_METRIC_GROUPS } from '@/lib/heatmap/metricValue';
import { event } from '@/lib/ga';

interface HeatmapMetricChipsProps {
  metric: HeatmapMetric;
  onMetricChange: (metric: HeatmapMetric) => void;
  className?: string;
  variant?: 'light' | 'dark'; // 'light' for light background (homepage), 'dark' for dark background (heatmap page)
  orientation?: 'horizontal' | 'vertical'; // 'vertical' for side rail (chips wrap under group labels)
}

export function HeatmapMetricChips({
  metric,
  onMetricChange,
  className = '',
  variant = 'light',
  orientation = 'horizontal',
}: HeatmapMetricChipsProps) {
  const [mounted, setMounted] = useState(false);
  const isDark = variant === 'dark';
  const isVertical = orientation === 'vertical';

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className={`h-7 rounded-lg animate-pulse ${isDark ? 'bg-slate-800/60' : 'bg-slate-200 dark:bg-slate-800/60'} ${className}`} aria-hidden="true" />
    );
  }

  const handleSelect = (id: HeatmapMetric) => {
    if (id === metric) return;
    onMetricChange(id);
    event('heatmap_change', { metric: id, timeframe: 'day' });
  };

  const renderGroup = (group: (typeof HEATMAP_METRIC_GROUPS)[number]) => (
    <div key={group} className={isVertical ? 'flex flex-col gap-1' : 'flex items-center gap-1.5 flex-shrink-0'}>
      <span className={`text-[9px] uppercase tracking-wider font-semibold select-none ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>
        {group}
      </span>
      <div className={isVertical ? 'flex flex-wrap gap-1' : 'contents'}>
        {HEATMAP_METRICS.filter((m) => m.group === group).map((m) => {
          const active = m.id === metric;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSelect(m.id)}
              aria-pressed={active}
              title={m.label}
              className={`flex-shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-colors ${
                active
                  ? 'bg-green-600 border-green-600 text-white'
                  : isDark
                    ? 'border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white bg-transparent'
                    // 'light' follows the site theme — white chips look fine
                    // on a light surface but must not stay white in dark mode.
                    : 'border-slate-300 text-slate-600 hover:border-slate-500 hover:text-slate-900 bg-white dark:bg-transparent dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-400 dark:hover:text-white'
              }`}
            >
              {m.short ?? m.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Horizontal (homepage header subnav): exactly two rows — Performance+Scores
  // on top, Valuation+Fundamentals+Activity below. No wrapping (a wrapping row
  // silently becomes 2+ lines); if the viewport is narrower, each row scrolls.
  if (!isVertical) {
    const ROW1 = HEATMAP_METRIC_GROUPS.slice(0, 2); // Performance, Scores
    const ROW2 = HEATMAP_METRIC_GROUPS.slice(2);    // Valuation, Fundamentals, Activity
    return (
      <div className={`flex flex-col gap-y-1 ${className}`} role="group" aria-label="Heatmap metric">
        <div className="flex items-center gap-x-3 overflow-x-auto whitespace-nowrap scrollbar-none">
          {ROW1.map(renderGroup)}
        </div>
        <div className="flex items-center gap-x-3 overflow-x-auto whitespace-nowrap scrollbar-none">
          {ROW2.map(renderGroup)}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`} role="group" aria-label="Heatmap metric">
      {HEATMAP_METRIC_GROUPS.map(renderGroup)}
    </div>
  );
}
