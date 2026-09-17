/**
 * Heatmap Metric Selector — dropdown for choosing what colors the tiles
 * (day %, week %, mcap Δ, health/valuation/profitability scores, Piotroski,
 * Z-score). Mobile-friendly native <select>.
 */

'use client';

import React, { useState, useEffect } from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';
import { HEATMAP_METRICS } from '@/lib/heatmap/metricValue';
import { event } from '@/lib/ga';

interface HeatmapMetricButtonsProps {
  metric: HeatmapMetric;
  onMetricChange: (metric: HeatmapMetric) => void;
  className?: string;
  variant?: 'light' | 'dark'; // 'light' for light background (homepage), 'dark' for dark background (heatmap page)
  size?: 'sm' | 'md';
}

export function HeatmapMetricButtons({
  metric,
  onMetricChange,
  className = '',
  variant = 'light',
  size = 'md',
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

  const isDark = variant === 'dark';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMetric = e.target.value as HeatmapMetric;
    if (newMetric === metric) return;
    onMetricChange(newMetric);

    // Track heatmap metric change event
    event('heatmap_change', {
      metric: newMetric,
      timeframe: 'day' // Heatmap page uses fixed 'day' timeframe
    });
  };

  const surface = isDark
    ? 'bg-white/10 text-white border-white/15'
    : 'bg-slate-100 text-slate-800 border-slate-200';
  const sizeClasses = size === 'sm'
    ? 'h-7 px-2 text-[11px]'
    : 'h-8 px-2.5 text-xs';

  return (
    <div className={`inline-flex items-center ${className}`}>
      <select
        value={metric}
        onChange={handleChange}
        aria-label="Heatmap metric"
        className={`${sizeClasses} font-bold rounded-lg border ${surface} cursor-pointer appearance-none pr-6 bg-no-repeat`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${isDark ? '%23ffffff' : '%23334155'}' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 8px center',
        }}
      >
        {HEATMAP_METRICS.map((m) => (
          <option key={m.id} value={m.id} className="text-slate-800 bg-white">
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
