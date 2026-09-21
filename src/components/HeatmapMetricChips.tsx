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
}

export function HeatmapMetricChips({
  metric,
  onMetricChange,
  className = '',
  variant = 'light',
}: HeatmapMetricChipsProps) {
  const [mounted, setMounted] = useState(false);
  const isDark = variant === 'dark';

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className={`h-7 rounded-lg animate-pulse ${isDark ? 'bg-slate-800/60' : 'bg-slate-200'} ${className}`} aria-hidden="true" />
    );
  }

  const handleSelect = (id: HeatmapMetric) => {
    if (id === metric) return;
    onMetricChange(id);
    event('heatmap_change', { metric: id, timeframe: 'day' });
  };

  return (
    <div
      className={`flex items-center gap-x-3 gap-y-1 overflow-x-auto whitespace-nowrap scrollbar-none md:flex-wrap md:overflow-visible ${className}`}
      role="group"
      aria-label="Heatmap metric"
    >
      {HEATMAP_METRIC_GROUPS.map((group) => (
        <div key={group} className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[9px] uppercase tracking-wider font-semibold select-none ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>
            {group}
          </span>
          {HEATMAP_METRICS.filter((m) => m.group === group).map((m) => {
            const active = m.id === metric;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSelect(m.id)}
                aria-pressed={active}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${
                  active
                    ? 'bg-green-600 border-green-600 text-white'
                    : isDark
                      ? 'border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white bg-transparent'
                      : 'border-slate-300 text-slate-600 hover:border-slate-500 hover:text-slate-900 bg-white'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
