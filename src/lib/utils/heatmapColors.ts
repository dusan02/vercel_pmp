/**
 * Heatmap Color Utilities
 * Color scale functions for different timeframes
 */

import { scaleLinear } from 'd3-scale';

export type Timeframe = 'day' | 'week' | 'month';
export type HeatmapColorMetric = 'percent' | 'mcap';

/**
 * Farebná škála pre percentuálnu zmenu
 * Definuje prechod od červenej (pokles) po zelenú (rast)
 */
export function createHeatmapColorScale(timeframe: Timeframe = 'day', metric: HeatmapColorMetric = 'percent') {
  const percentScales = {
    day: {
      domain: [-5, -2, 0, 2, 5],
      range: ['#ef4444', '#f87171', '#374151', '#4ade80', '#22c55e'],
    },
    week: {
      domain: [-10, -5, 0, 5, 10],
      range: ['#dc2626', '#ef4444', '#374151', '#22c55e', '#16a34a'],
    },
    month: {
      domain: [-20, -10, 0, 10, 20],
      range: ['#b91c1c', '#dc2626', '#374151', '#16a34a', '#15803d'],
    },
  };

  // Market cap change legend is in $B (billions).
  // Domain is tuned to keep mid-range moves readable while still clamping extremes.
  const mcapScales = {
    day: {
      // Most names move within ~0–10B on a typical day; keep extremes clamped.
      domain: [-10, -3, 0, 3, 10],
      range: ['#ef4444', '#f87171', '#374151', '#4ade80', '#22c55e'],
    },
    week: {
      domain: [-30, -10, 0, 10, 30],
      range: ['#dc2626', '#ef4444', '#374151', '#22c55e', '#16a34a'],
    },
    month: {
      domain: [-60, -20, 0, 20, 60],
      range: ['#b91c1c', '#dc2626', '#374151', '#16a34a', '#15803d'],
    },
  };

  const config = metric === 'mcap' ? mcapScales[timeframe] : percentScales[timeframe];
  return scaleLinear<string>()
    .domain(config.domain)
    .range(config.range)
    .clamp(true);
}

/**
 * Získa farbu pre percentuálnu zmenu
 */
export function getColorForPercentChange(
  percentChange: number,
  timeframe: Timeframe = 'day'
): string {
  const colorScale = createHeatmapColorScale(timeframe, 'percent');
  return colorScale(percentChange);
}

