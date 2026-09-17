/**
 * Heatmap metric registry — single source for the dropdown options,
 * per-company metric value extraction, and tile label formatting.
 */

import type { CompanyNode, HeatmapMetric } from './types';
import { formatMarketCapDiff, formatPercent } from '@/lib/utils/heatmapFormat';

export const HEATMAP_METRICS: { id: HeatmapMetric; label: string }[] = [
  { id: 'percent',       label: 'Day change %' },
  { id: 'week',          label: '1-week change %' },
  { id: 'mcap',          label: 'Mcap change' },
  { id: 'health',        label: 'Health score' },
  { id: 'valuation',     label: 'Valuation score' },
  { id: 'profitability', label: 'Profitability score' },
  { id: 'piotroski',     label: 'Piotroski F-score' },
  { id: 'zscore',        label: 'Movers Z-score' },
];

export const DEFAULT_HEATMAP_METRIC: HeatmapMetric = 'percent';

export function isHeatmapMetric(v: unknown): v is HeatmapMetric {
  return HEATMAP_METRICS.some((m) => m.id === v);
}

/** Tile color for "no data" — must match the neutral midpoint of the scales. */
export const NEUTRAL_TILE_COLOR = '#1f2937';

/**
 * Numeric value a tile is colored/labeled by for the given metric.
 * Returns null when the metric has no data for that company (→ neutral tile).
 */
export function getCompanyMetricValue(company: CompanyNode, metric: HeatmapMetric): number | null {
  switch (metric) {
    case 'mcap':          return company.marketCapDiff ?? 0;
    case 'week':          return company.weekChange ?? null;
    case 'health':        return company.healthScore ?? null;
    case 'valuation':     return company.valuationScore ?? null;
    case 'profitability': return company.profitabilityScore ?? null;
    case 'piotroski':     return company.piotroskiScore ?? null;
    case 'zscore':        return company.zScore ?? null;
    case 'percent':
    default:              return company.changePercent ?? 0;
  }
}

/** Short label rendered inside the tile under the symbol. */
export function formatMetricValue(company: CompanyNode, metric: HeatmapMetric): string {
  const v = getCompanyMetricValue(company, metric);
  if (v === null || !isFinite(v)) return '–';
  switch (metric) {
    case 'mcap':      return formatMarketCapDiff(v);
    case 'percent':
    case 'week':      return formatPercent(v);
    case 'piotroski': return `${Math.round(v)}/9`;
    case 'zscore':    return `${v > 0 ? '+' : ''}${v.toFixed(1)}σ`;
    default:          return `${Math.round(v)}`;
  }
}
