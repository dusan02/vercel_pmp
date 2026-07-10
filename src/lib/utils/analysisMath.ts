/**
 * Math utilities for analysis history calculations.
 */

export type PerSharePoint = { date: string; value: number };

/**
 * Project forward n quarters using CAGR of last 4 points.
 * Growth rate is clamped to ±50% per quarter to prevent absurd projections.
 */
export function projectForward(base: PerSharePoint[], quarters: number): (PerSharePoint & { isForecast: boolean })[] {
  if (!base.length) return [];
  const last = base[base.length - 1]!;
  const lastDate = new Date(last.date);
  const n = Math.min(4, base.length);
  const first = base[base.length - n]!;
  const growth = first.value > 0 ? Math.pow(last.value / first.value, 1 / Math.max(1, n - 1)) - 1 : 0;
  const clampedGrowth = Math.max(-0.5, Math.min(0.5, growth));
  const forecasts: (PerSharePoint & { isForecast: boolean })[] = [];
  for (let i = 1; i <= quarters; i++) {
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + i * 3);
    const next = last.value * Math.pow(1 + clampedGrowth, i);
    forecasts.push({ date: d.toISOString().split('T')[0] as string, value: parseFloat(next.toFixed(4)), isForecast: true });
  }
  return forecasts;
}

/**
 * Pearson correlation coefficient between two arrays.
 * Returns null if arrays have different lengths, are empty, or have zero variance.
 */
export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length === 0) return null;
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return parseFloat((num / den).toFixed(4));
}

/** Linear interpolation percentile on a sorted array */
export function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(Math.ceil(idx), sorted.length - 1);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (idx - lo);
}

/** Build percentile stats object from a raw (unsorted) value array */
export function buildStats(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    avg: parseFloat(avg.toFixed(2)),
    p10: parseFloat(pct(sorted, 10).toFixed(2)),
    p25: parseFloat(pct(sorted, 25).toFixed(2)),
    median: parseFloat(pct(sorted, 50).toFixed(2)),
    p75: parseFloat(pct(sorted, 75).toFixed(2)),
    p90: parseFloat(pct(sorted, 90).toFixed(2)),
    min: parseFloat((sorted[0] ?? 0).toFixed(2)),
    max: parseFloat((sorted[sorted.length - 1] ?? 0).toFixed(2)),
    count: sorted.length,
  };
}
