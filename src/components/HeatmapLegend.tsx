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
  values?: number[];
}

export const HeatmapLegend: React.FC<HeatmapLegendProps> = ({ timeframe, metric = 'percent', values }) => {
  const isMcap = metric === 'mcap';
  const colorScale = createHeatmapColorScale(timeframe, isMcap ? 'mcap' : 'percent', values);

  const percentTicks = {
    day: [-5, -3, -1, 0, 1, 3, 5],
    week: [-10, -6, -3, 0, 3, 6, 10],
    month: [-20, -12, -6, 0, 6, 12, 20],
  };

  // Adaptive mcap ticks come from the same domain the tiles use
  const extent = getHeatmapScaleExtent(timeframe, isMcap ? 'mcap' : 'percent', values);
  const mcapTicks = [extent[0] ?? 0, extent[1] ?? 0, 0, extent[3] ?? 0, extent[4] ?? 0].map((v) => Math.round(v));

  const points = isMcap ? mcapTicks : percentTicks[timeframe];
  const unit = isMcap ? 'B$' : '%';
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
