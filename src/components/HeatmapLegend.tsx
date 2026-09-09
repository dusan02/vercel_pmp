'use client';

import React from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';

export const HeatmapLegend: React.FC<{ timeframe: 'day' | 'week' | 'month'; metric?: HeatmapMetric }> = ({ timeframe, metric = 'percent' }) => {
  const colorScale = createHeatmapColorScale(timeframe, metric === 'mcap' ? 'mcap' : 'percent');
  const scales = {
    day: [-5, -3, -1, 0, 1, 3, 5],
    week: [-10, -6, -3, 0, 3, 6, 10],
    month: [-20, -12, -6, 0, 6, 12, 20],
  };
  const scalesB = {
    day: [-100, -30, -10, 0, 10, 30, 100],
    week: [-30, -10, -3, 0, 3, 10, 30],
    month: [-60, -20, -6, 0, 6, 20, 60],
  };
  const points = metric === 'mcap' ? scalesB[timeframe] : scales[timeframe];
  const unit = metric === 'mcap' ? 'B$' : '%';
  const formatTick = (v: number) => `${v}${unit}`;
  const labelIndices = points.length >= 7 ? [0, 2, 3, 4, 6] : points.map((_, i) => i);

  return (
    <div className="bg-gray-900 bg-opacity-70 px-2.5 py-1.5 rounded-lg">
      <div className="flex items-stretch">
        {points.map((p, idx) => (
          <div
            key={p}
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
