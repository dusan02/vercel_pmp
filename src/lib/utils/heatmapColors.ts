/**
 * Heatmap Color Utilities
 * Color scale functions for different timeframes
 */

import { scaleLinear } from 'd3-scale';

export type Timeframe = 'day' | 'week' | 'month';

/**
 * Farebná škála pre percentuálnu zmenu
 * Definuje prechod od červenej (pokles) po zelenú (rast)
 */
export function createHeatmapColorScale(timeframe: Timeframe = 'day') {
  const scales = {
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

  const config = scales[timeframe];
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
  const colorScale = createHeatmapColorScale(timeframe);
  return colorScale(percentChange);
}

