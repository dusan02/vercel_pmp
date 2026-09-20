/**
 * Heatmap metric registry — single source for the dropdown options,
 * per-company metric value extraction, and tile label formatting.
 */

import type { CompanyNode, HeatmapMetric } from './types';
import { formatMarketCapDiff, formatPercent } from '@/lib/utils/heatmapFormat';
import { getMetricNeutralPoint } from '@/lib/utils/heatmapColors';

export type HeatmapMetricGroup = 'Performance' | 'Scores' | 'Valuation' | 'Fundamentals' | 'Activity';

export const HEATMAP_METRICS: { id: HeatmapMetric; label: string; group: HeatmapMetricGroup }[] = [
  { id: 'percent',       label: 'Day change %',        group: 'Performance' },
  { id: 'week',          label: '1-week change %',     group: 'Performance' },
  { id: 'month',         label: '1-month change %',    group: 'Performance' },
  { id: 'ytd',           label: 'YTD change %',        group: 'Performance' },
  { id: 'year',          label: '1-year change %',     group: 'Performance' },
  { id: 'mcap',          label: 'Mcap change',         group: 'Performance' },
  { id: 'health',        label: 'Health score',        group: 'Scores' },
  { id: 'valuation',     label: 'Valuation score',     group: 'Scores' },
  { id: 'growth',        label: 'Growth score',        group: 'Scores' },
  { id: 'profitability', label: 'Profitability score', group: 'Scores' },
  { id: 'quality',       label: 'Quality score',       group: 'Scores' },
  { id: 'piotroski',     label: 'Piotroski F-score',   group: 'Scores' },
  { id: 'altman',        label: 'Altman Z-score',      group: 'Scores' },
  { id: 'beneish',       label: 'Beneish M-score',     group: 'Scores' },
  { id: 'pe',            label: 'P/E ratio',           group: 'Valuation' },
  { id: 'fpe',           label: 'Forward P/E',         group: 'Valuation' },
  { id: 'ps',            label: 'P/S ratio',           group: 'Valuation' },
  { id: 'pb',            label: 'P/B ratio',           group: 'Valuation' },
  { id: 'peg',           label: 'PEG ratio',           group: 'Valuation' },
  { id: 'evebitda',      label: 'EV/EBITDA',           group: 'Valuation' },
  { id: 'roe',           label: 'ROE %',               group: 'Fundamentals' },
  { id: 'netmargin',     label: 'Net margin %',        group: 'Fundamentals' },
  { id: 'revgrowth',     label: 'Revenue growth %',    group: 'Fundamentals' },
  { id: 'epsgrowth',     label: 'EPS growth %',        group: 'Fundamentals' },
  { id: 'divyield',      label: 'Dividend yield %',    group: 'Fundamentals' },
  { id: 'fcfmargin',     label: 'FCF margin %',        group: 'Fundamentals' },
  { id: 'rvol',          label: 'Relative volume',     group: 'Activity' },
  { id: 'beta',          label: 'Beta',                group: 'Activity' },
  { id: 'zscore',        label: 'Movers Z-score',      group: 'Activity' },
];

export const HEATMAP_METRIC_GROUPS: HeatmapMetricGroup[] = [
  'Performance', 'Scores', 'Valuation', 'Fundamentals', 'Activity',
];

export const DEFAULT_HEATMAP_METRIC: HeatmapMetric = 'percent';

export function isHeatmapMetric(v: unknown): v is HeatmapMetric {
  return HEATMAP_METRICS.some((m) => m.id === v);
}

/** Tile color for "no data" — must match the neutral midpoint of the scales. */
export const NEUTRAL_TILE_COLOR = '#1f2937';

// Valuation ratios use inverted scales (low = green). A negative ratio means
// losses (negative earnings/EBITDA) — that's the worst case, so pin it to the
// red end instead of letting the inverted scale render it green.
const NEGATIVE_IS_BAD = new Set<HeatmapMetric>(['pe', 'fpe', 'ps', 'pb', 'peg', 'evebitda']);

/** Metrics where a LOWER value is better (cheap valuation, low risk). */
const INVERTED_METRICS = new Set<HeatmapMetric>(['pe', 'fpe', 'ps', 'pb', 'peg', 'evebitda', 'beneish', 'beta']);
export function isInvertedMetric(metric: HeatmapMetric): boolean {
  return INVERTED_METRICS.has(metric);
}

export type MetricSentiment = 'good' | 'bad' | 'neutral';

/**
 * Is a metric value favorable or not — relative to the scale's neutral
 * midpoint (0 for % metrics, 50 for scores, 25 for P/E, …), respecting
 * inversion (for P/E a value of 15 is 'good' even though it's positive).
 */
export function getMetricSentiment(v: number, metric: HeatmapMetric): MetricSentiment {
  if (!isFinite(v)) return 'neutral';
  const neutral = getMetricNeutralPoint(metric);
  if (v === neutral) return 'neutral';
  const better = isInvertedMetric(metric) ? v < neutral : v > neutral;
  return better ? 'good' : 'bad';
}

const BAD_COLOR = '#dc2626';

/** Resolve the tile background color for a company+metric. */
export function getTileColor(
  company: CompanyNode,
  metric: HeatmapMetric,
  colorScale: (v: number) => string,
): string {
  const v = getCompanyMetricValue(company, metric);
  if (v === null || !isFinite(v)) return NEUTRAL_TILE_COLOR;
  if (v < 0 && NEGATIVE_IS_BAD.has(metric)) return BAD_COLOR;
  return colorScale(v);
}

/**
 * Numeric value a tile is colored/labeled by for the given metric.
 * Returns null when the metric has no data for that company (→ neutral tile).
 */
export function getCompanyMetricValue(company: CompanyNode, metric: HeatmapMetric): number | null {
  switch (metric) {
    case 'mcap':          return company.marketCapDiff ?? 0;
    case 'week':          return company.weekChange ?? null;
    case 'month':         return company.monthChange ?? null;
    case 'ytd':           return company.ytdChange ?? null;
    case 'year':          return company.yearChange ?? null;
    case 'health':        return company.healthScore ?? null;
    case 'valuation':     return company.valuationScore ?? null;
    case 'growth':        return company.growthScore ?? null;
    case 'profitability': return company.profitabilityScore ?? null;
    case 'quality':       return company.qualityScore ?? null;
    case 'piotroski':     return company.piotroskiScore ?? null;
    case 'altman':        return company.altmanZ ?? null;
    case 'beneish':       return company.beneishScore ?? null;
    case 'pe':            return company.peRatio ?? null;
    case 'fpe':           return company.forwardPe ?? null;
    case 'ps':            return company.psRatio ?? null;
    case 'pb':            return company.pbRatio ?? null;
    case 'peg':           return company.pegRatio ?? null;
    case 'evebitda':      return company.evEbitda ?? null;
    case 'roe':           return company.roe ?? null;
    case 'netmargin':     return company.netMargin ?? null;
    case 'revgrowth':     return company.revenueGrowth ?? null;
    case 'epsgrowth':     return company.earningsGrowth ?? null;
    case 'divyield':      return company.dividendYield ?? null;
    // fcfMargin is stored as a fraction (0.15 = 15%); scales/formatters work in percent.
    case 'fcfmargin':     return company.fcfMargin != null ? company.fcfMargin * 100 : null;
    case 'rvol':          return company.rvol ?? null;
    case 'beta':          return company.beta ?? null;
    case 'zscore':        return company.zScore ?? null;
    case 'percent':
    default:              return company.changePercent ?? 0;
  }
}

/** Format a raw metric number for display (tile label, sector summary, legend). */
export function formatMetricNumber(v: number, metric: HeatmapMetric): string {
  switch (metric) {
    case 'mcap':      return formatMarketCapDiff(v);
    case 'percent':
    case 'week':
    case 'month':
    case 'ytd':
    case 'year':      return formatPercent(v);
    case 'piotroski': return `${Math.round(v)}/9`;
    case 'zscore':    return `${v > 0 ? '+' : ''}${v.toFixed(1)}σ`;
    case 'altman':    return v.toFixed(1);
    case 'beneish':   return v.toFixed(2);
    case 'rvol':      return `${v.toFixed(1)}×`;
    case 'beta':      return v.toFixed(2);
    case 'roe':
    case 'netmargin':
    case 'revgrowth':
    case 'epsgrowth':
    case 'fcfmargin': return `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
    case 'divyield':  return `${v.toFixed(1)}%`;
    case 'pe':
    case 'fpe':
    case 'ps':
    case 'pb':
    case 'peg':
    case 'evebitda':  return v < 0 ? 'neg' : v.toFixed(1);
    default:          return `${Math.round(v)}`; // 0-100 scores
  }
}

/** Short label rendered inside the tile under the symbol. */
export function formatMetricValue(company: CompanyNode, metric: HeatmapMetric): string {
  const v = getCompanyMetricValue(company, metric);
  if (v === null || !isFinite(v)) return '–';
  return formatMetricNumber(v, metric);
}
