/**
 * Heatmap Color Utilities
 * Color scale functions for different timeframes
 */

import { scaleLinear } from 'd3-scale';
import type { HeatmapMetric } from '@/lib/heatmap/types';

export type Timeframe = 'day' | 'week' | 'month';
export type HeatmapColorMetric = HeatmapMetric;

// Scores (0-100): <35 red, ~50 neutral, >65 green
const scoreScale = {
  domain: [0, 35, 50, 65, 100],
  range: ['#dc2626', '#f87171', '#1f2937', '#22c55e', '#16a34a'],
};

// Piotroski F-Score (0-9): <=3 weak, 4-6 neutral, >=7 strong
const piotroskiScale = {
  domain: [0, 3, 5, 7, 9],
  range: ['#dc2626', '#f87171', '#1f2937', '#22c55e', '#16a34a'],
};

// Movers Z-score: |z| > 3 = extreme mover
const zscoreScale = {
  domain: [-3, -1.5, 0, 1.5, 3],
  range: ['#dc2626', '#f87171', '#1f2937', '#22c55e', '#16a34a'],
};

// Altman Z: <1.8 distress, 1.8-3 grey zone, >3 safe
const altmanScale = {
  domain: [0, 1.8, 3, 6, 10],
  range: ['#dc2626', '#f87171', '#1f2937', '#22c55e', '#16a34a'],
};

// RVOL: relative volume — >2× heavy trading
const rvolScale = {
  domain: [0.3, 0.7, 1, 2, 5],
  range: ['#dc2626', '#f87171', '#1f2937', '#22c55e', '#16a34a'],
};

// Fundamentals % (higher = better)
const makeFundamentalScale = (domain: number[]) => ({
  domain,
  range: ['#dc2626', '#f87171', '#1f2937', '#22c55e', '#16a34a'],
});

// Inverted scales — lower value = better = green (cheap valuation, low risk).
// Domain ascending, range goes green→red.
const makeInvertedScale = (domain: number[]) => ({
  domain,
  range: ['#16a34a', '#22c55e', '#1f2937', '#f87171', '#dc2626'],
});

// Beneish M-score: > -1.78 = likely manipulator (red), < -2.22 = clean (green)
const beneishScale = {
  domain: [-4.5, -3.5, -2.5, -2, -1.5],
  range: ['#16a34a', '#22c55e', '#1f2937', '#f87171', '#dc2626'],
};

function scaleConfig(
  metric: HeatmapColorMetric,
  timeframe: Timeframe,
): { domain: number[]; range: string[] } {
  switch (metric) {
    case 'mcap':          return mcapScales[timeframe];
    case 'week':          return percentScales.week;
    case 'month':         return { domain: [-15, -8, 0, 8, 15], range: percentScales.week.range };
    case 'ytd':           return { domain: [-30, -15, 0, 15, 30], range: percentScales.month.range };
    case 'year':          return { domain: [-40, -20, 0, 20, 40], range: percentScales.month.range };
    case 'health':
    case 'valuation':
    case 'profitability': return scoreScale;
    case 'piotroski':     return piotroskiScale;
    case 'altman':        return altmanScale;
    case 'beneish':       return beneishScale;
    case 'pe':
    case 'fpe':           return makeInvertedScale([5, 15, 25, 40, 80]);
    case 'ps':            return makeInvertedScale([0.5, 2, 5, 10, 25]);
    case 'pb':            return makeInvertedScale([0.5, 1.5, 3, 8, 20]);
    case 'peg':           return makeInvertedScale([0.5, 1, 1.5, 2.5, 5]);
    case 'evebitda':      return makeInvertedScale([5, 10, 15, 25, 50]);
    case 'roe':           return makeFundamentalScale([-20, 0, 10, 20, 40]);
    case 'netmargin':     return makeFundamentalScale([-20, 0, 10, 20, 40]);
    case 'revgrowth':     return makeFundamentalScale([-20, 0, 10, 25, 50]);
    case 'epsgrowth':     return makeFundamentalScale([-30, 0, 10, 25, 60]);
    case 'divyield':      return makeFundamentalScale([0, 1, 2, 3.5, 6]);
    case 'fcfmargin':     return makeFundamentalScale([-10, 0, 10, 20, 35]);
    case 'rvol':          return rvolScale;
    case 'beta':          return makeInvertedScale([0.3, 0.8, 1.0, 1.5, 2.5]);
    case 'zscore':        return zscoreScale;
    case 'percent':
    default:              return percentScales[timeframe];
  }
}

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
  const config = scaleConfig(metric, timeframe);
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
  const config = scaleConfig(metric, timeframe);
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
