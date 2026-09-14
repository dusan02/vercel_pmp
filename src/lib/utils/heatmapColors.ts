/**
 * Heatmap Color Utilities
 * Color scale functions for different timeframes
 */

import { scaleLinear } from 'd3-scale';

export type Timeframe = 'day' | 'week' | 'month';
export type HeatmapColorMetric = 'percent' | 'mcap';

/**
 * Adaptive domain for the market-cap metric from the visible dataset.
 * A fixed ±$100B day domain renders a normal session almost black — typical
 * |Δmarket cap| is $0–5B while only mega-movers reach $50B+. Anchoring the
 * scale on the data's own p50/p92 keeps the map readable on quiet AND wild
 * days. Falls back to the fixed domain when the data is degenerate.
 */
function adaptiveMcapDomain(values: number[] | undefined, fallback: number[]): number[] {
  const abs = (values ?? [])
    .filter((v) => typeof v === 'number' && isFinite(v) && v !== 0)
    .map(Math.abs)
    .sort((a, b) => a - b);
  if (abs.length < 5) return fallback;
  const mid = Math.max(abs[Math.floor(abs.length * 0.5)]!, 0.25);
  const max = Math.max(abs[Math.floor(abs.length * 0.92)]!, mid * 2.5, 1);
  return [-max, -mid, 0, mid, max];
}

const percentScales = {
  day: {
    domain: [-5, -2, 0, 2, 5],
    range: ['#dc2626', '#f87171', '#1f2937', '#22c55e', '#16a34a'],
  },
  week: {
    domain: [-10, -5, 0, 5, 10],
    range: ['#dc2626', '#ef4444', '#1f2937', '#16a34a', '#15803d'],
  },
  month: {
    domain: [-20, -10, 0, 10, 20],
    range: ['#b91c1c', '#dc2626', '#1f2937', '#16a34a', '#15803d'],
  },
};

// Market cap change legend is in $B (billions).
// Domain is tuned to keep mid-range moves readable while still clamping extremes.
const mcapScales = {
  day: {
    // Most names move within ~0–100B on a typical day; keep extremes clamped.
    domain: [-100, -30, 0, 30, 100],
    range: ['#dc2626', '#f87171', '#1f2937', '#22c55e', '#16a34a'],
  },
  week: {
    domain: [-30, -10, 0, 10, 30],
    range: ['#dc2626', '#ef4444', '#1f2937', '#22c55e', '#16a34a'],
  },
  month: {
    domain: [-60, -20, 0, 20, 60],
    range: ['#b91c1c', '#dc2626', '#1f2937', '#22c55e', '#16a34a'],
  },
};

/**
 * Domain (extent) of the color scale for a timeframe/metric — the same
 * computation createHeatmapColorScale uses. Legends must derive their ticks
 * from this so they always match the tiles.
 */
export function getHeatmapScaleExtent(
  timeframe: Timeframe = 'day',
  metric: HeatmapColorMetric = 'percent',
  values?: number[],
): number[] {
  const config = metric === 'mcap' ? mcapScales[timeframe] : percentScales[timeframe];
  return metric === 'mcap' ? adaptiveMcapDomain(values, config.domain) : config.domain;
}

/**
 * Farebná škála pre percentuálnu zmenu
 * Definuje prechod od červenej (pokles) po zelenú (rast)
 *
 * @param values optional dataset of marketCapDiff values (in $B) — when
 *               provided for the 'mcap' metric, the domain adapts to the
 *               visible data distribution instead of the fixed ±$100B.
 */
export function createHeatmapColorScale(
  timeframe: Timeframe = 'day',
  metric: HeatmapColorMetric = 'percent',
  values?: number[],
) {
  const config = metric === 'mcap' ? mcapScales[timeframe] : percentScales[timeframe];
  const domain = metric === 'mcap' ? adaptiveMcapDomain(values, config.domain) : config.domain;
  return scaleLinear<string>()
    .domain(domain)
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
