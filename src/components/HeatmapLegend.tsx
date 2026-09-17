'use client';

import React from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';
import { createHeatmapColorScale, getHeatmapScaleExtent } from '@/lib/utils/heatmapColors';

interface HeatmapLegendProps {
  timeframe: 'day' | 'week' | 'month';
  metric?: HeatmapMetric;
  /**
   * marketCapDiff values (in $B) of the visible dataset — when provided with
   * metric='mcap', the legend derives its ticks from the same adaptive domain
   * the tiles use, so it always matches the map.
   */
  values?: number[] | undefined;
}

const PERCENT_METRICS = new Set(['percent', 'week', 'month', 'ytd', 'year', 'roe', 'netmargin', 'revgrowth', 'epsgrowth', 'fcfmargin', 'divyield']);

export const HeatmapLegend: React.FC<HeatmapLegendProps> = ({ timeframe, metric = 'percent', values }) => {
  const colorScale = createHeatmapColorScale(timeframe, metric, values);

  // Ticks = the scale domain stops — always consistent with tile colors
  // (mcap uses the same adaptive domain the tiles use).
  const extent = getHeatmapScaleExtent(timeframe, metric, values);
  const points = metric === 'mcap' ? extent.map((v) => Math.round(v)) : extent;

  const unit = metric === 'mcap' ? 'B$'
    : PERCENT_METRICS.has(metric) ? '%'
    : metric === 'zscore' ? 'σ'
    : metric === 'rvol' ? '×'
    : '';
  const formatTick = (v: number) => `${v}${unit}`;
  const labelIndices = points.length >= 7 ? [0, 2, 3, 4, 6] : points.map((_, i) => i);

  return (
    <div className="bg-gray-900 bg-opacity-70 px-2.5 py-1.5 rounded-lg">
      <div className="flex items-stretch">
        {points.map((p, idx) => (
          <div
            key={`${p}-${idx}`}
            className="h-3 w-5 border-y border-gray-700"
            style={{
              backgroundColor: colorScale(p),
              borderLeft: idx === 0 ? '1px solid #4b5563' : 'none',
              borderRight: idx === points.length - 1 ? '1px solid #4b5563' : 'none',
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between text-white text-[10px] leading-none font-mono tabular-nums">
        {labelIndices.map((i) => (
          <span key={`${points[i]}-${i}`} className="opacity-90">
            {formatTick(points[i] ?? 0)}
          </span>
        ))}
      </div>
    </div>
  );
};
