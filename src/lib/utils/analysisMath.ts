/**
 * Math utilities for analysis history calculations.
 */

export type PerSharePoint = { date: string; value: number };

/**
 * Project forward n quarters using CAGR from recent history only (last 12 quarters = 3 years).
 * This avoids the "low-base effect" where early startup-era EPS inflates long-term CAGR.
 * Guards against negative EPS (transition from loss to profit) to prevent NaN.
 * Growth rate is clamped to [-10%, +10%] per quarter (~[-34%, +46%] annually).
 */
export function projectForward(base: PerSharePoint[], quarters: number): (PerSharePoint & { isForecast: boolean })[] {
  if (!base || base.length === 0) return [];
  const last = base[base.length - 1]!;
  const lastDate = new Date(last.date);

  // Use last 12 quarters (3 years) for realistic recent trend
  const recentN = Math.min(12, base.length);

  // Not enough data points — return flat forecast
  if (recentN < 2) {
    const forecasts: (PerSharePoint & { isForecast: boolean })[] = [];
    for (let i = 1; i <= quarters; i++) {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + i * 3);
      forecasts.push({ date: d.toISOString().split('T')[0] as string, value: parseFloat(last.value.toFixed(4)), isForecast: true });
    }
    return forecasts;
  }

  const first = base[base.length - recentN]!;

  let growth = 0;

  // Guard against negative EPS (CAGR from loss to profit is mathematically undefined)
  if (first.value > 0 && last.value > 0) {
    growth = Math.pow(last.value / first.value, 1 / (recentN - 1)) - 1;
  } else if (first.value <= 0 && last.value > 0) {
    // Transition from loss to profit — conservative +1.5% per quarter (~6% annually)
    growth = 0.015;
  } else if (last.value <= 0) {
    // Currently in loss — flat projection
    growth = 0;
  }

  // Tighter clamp: [-10%, +10%] per quarter
  const clampedGrowth = Math.max(-0.10, Math.min(0.10, growth));

  // Low-base guard: if last value is < 30% of historical average, use average as base
  const avg = base.reduce((sum, p) => sum + p.value, 0) / base.length;
  const projectionBase = (last.value < avg * 0.3 && avg > 0) ? avg : last.value;

  const forecasts: (PerSharePoint & { isForecast: boolean })[] = [];
  for (let i = 1; i <= quarters; i++) {
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + i * 3);
    const next = projectionBase * Math.pow(1 + clampedGrowth, i);
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
