/**
 * Math utilities for analysis history calculations.
 */

export type PerSharePoint = { date: string; value: number };

export function summarizeLossYears(statements: {
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  netIncome?: number | null;
  endDate?: Date | string;
}[]) {
  const annual = statements.filter(s => s.fiscalPeriod === 'FY' && s.fiscalYear != null
    && Number.isFinite(s.fiscalYear) && s.netIncome != null && Number.isFinite(s.netIncome))
    .sort((a, b) => new Date(b.endDate ?? 0).getTime() - new Date(a.endDate ?? 0).getTime());
  const byYear = new Map<number, number>();
  for (const s of annual) if (!byYear.has(s.fiscalYear!)) byYear.set(s.fiscalYear!, s.netIncome!);
  const years = [...byYear.keys()].sort((a, b) => b - a).slice(0, 10);
  return {
    lossYears: years.filter(y => byYear.get(y)! < 0).length,
    reportedYears: years.length,
    firstYear: years.at(-1) ?? null,
    lastYear: years[0] ?? null,
  };
}

/**
 * Project forward n quarters using CAGR from recent history only (last 12 quarters = 3 years).
 * This avoids the "low-base effect" where early startup-era EPS inflates long-term CAGR.
 * Guards against negative EPS (transition from loss to profit) to prevent NaN.
 * Growth rate is clamped to [-10%, +10%] per quarter (~[-34%, +46%] annually).
 */
export function projectForward(
  base: PerSharePoint[],
  quarters: number,
  startDate?: string | null,
): (PerSharePoint & { isForecast: boolean })[] {
  if (!base || base.length === 0) return [];
  const last = base[base.length - 1]!;
  const lastPerShareDate = new Date(last.date);

  // Forecast should start AFTER the latest known data point (price or per-share),
  // whichever is later. This prevents forecast dates from overlapping with history.
  const anchorDate = startDate
    ? new Date(Math.max(lastPerShareDate.getTime(), new Date(startDate).getTime()))
    : lastPerShareDate;

  // Use last 12 quarters (3 years) for realistic recent trend
  const recentN = Math.min(12, base.length);

  // Not enough data points — return flat forecast
  if (recentN < 2) {
    const forecasts: (PerSharePoint & { isForecast: boolean })[] = [];
    for (let i = 1; i <= quarters; i++) {
      const d = new Date(anchorDate);
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
    const d = new Date(anchorDate);
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

/**
 * Co-movement between price and an implied-value series measured on
 * quarter-over-quarter % changes — NOT on levels. Pearson on two
 * upward-trending level series is spuriously ~+0.9 for almost any growing
 * stock (both simply go up). Quarterly diffs match the statement cadence of
 * the implied line and measure whether price actually moves WITH
 * fundamentals updates. Requires >= 4 usable quarter diffs.
 */
export function quarterlyDiffCorr(
    aligned: { date: string; price: number; implied: number }[],
): number | null {
    const byQuarter = new Map<string, { price: number; implied: number }>();
    for (const pt of aligned) {
        const qKey = `${pt.date.slice(0, 4)}Q${Math.floor((+pt.date.slice(5, 7) - 1) / 3) + 1}`;
        byQuarter.set(qKey, { price: pt.price, implied: pt.implied }); // last write = quarter end
    }
    const rows = [...byQuarter.values()];
    const dPrice: number[] = [];
    const dImplied: number[] = [];
    for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1]!, curr = rows[i]!;
        if (prev.price > 0 && prev.implied > 0) {
            dPrice.push(curr.price / prev.price - 1);
            dImplied.push(curr.implied / prev.implied - 1);
        }
    }
    return dPrice.length >= 4 ? pearson(dPrice, dImplied) : null;
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

/**
 * CapEx intensity vs operating cash flow — contextualizes FCF-based metrics
 * for companies in heavy investment cycles (AMZN/META AI buildout, utilities).
 * A high CapEx/OCF ratio means reported FCF understates normalized earning
 * power, so P/FCF/FCF yield read worse than the underlying business.
 * Tiers: <50% none, 50–75% elevated, 75–100% heavy, ≥100% capex exceeds OCF.
 * OCF ≤ 0 → null (FCF is already negative; the "negative FCF" label says it).
 */
export type CapexCycleTier = 'elevated' | 'heavy' | 'exceeds';

export function capexCycleContext(
  ttmOcf: number | null | undefined,
  ttmCapex: number | null | undefined,
): { ratio: number; tier: CapexCycleTier; label: string; text: string } | null {
  if (ttmOcf == null || ttmCapex == null || !(ttmOcf > 0)) return null;
  const ratio = Math.abs(ttmCapex) / ttmOcf;
  if (ratio < 0.5) return null;
  const pctShare = `${Math.round(ratio * 100)}%`;
  if (ratio >= 1) {
    return {
      ratio, tier: 'exceeds', label: 'CapEx exceeds OCF',
      text: `CapEx exceeds operating cash flow (${pctShare} of OCF) — reported FCF understates normalized earning power in this investment phase`,
    };
  }
  if (ratio >= 0.75) {
    return {
      ratio, tier: 'heavy', label: 'Heavy investment',
      text: `Heavy investment cycle — CapEx = ${pctShare} of operating cash flow, significantly depressing reported FCF`,
    };
  }
  return {
    ratio, tier: 'elevated', label: 'Elevated investment',
    text: `Elevated investment — CapEx = ${pctShare} of operating cash flow, weighing on reported FCF`,
  };
}

/**
 * 90-day insider activity split — separates discretionary open-market trades
 * (P buys / S sells, the directional signal) from compensation-mechanical
 * filings (A grants, M option exercises, F tax withholding, G gifts, D
 * dispositions). Form 4 doesn't flag 10b5-1 plans, so scheduled plan sales
 * land inside S — the footnote must say so rather than claim detection.
 */
export interface InsiderTxLike {
  transactionCode: string;
  change: number;
  transactionPrice?: number | null;
}

export type InsiderSignal = 'buy' | 'sell' | 'mixed' | 'none';

export function summarizeInsiderActivity(rows: InsiderTxLike[]): {
  buyCount: number; sellCount: number;
  buyValue: number; sellValue: number;
  buyShares: number; sellShares: number;
  otherCount: number; otherShares: number;
  signal: InsiderSignal;
} {
  let buyCount = 0, sellCount = 0, otherCount = 0;
  let buyValue = 0, sellValue = 0, buyShares = 0, sellShares = 0, otherShares = 0;
  for (const r of rows) {
    const shares = Math.abs(r.change);
    const value = r.transactionPrice != null ? shares * r.transactionPrice : 0;
    if (r.transactionCode === 'P') { buyCount++; buyShares += shares; buyValue += value; }
    else if (r.transactionCode === 'S') { sellCount++; sellShares += shares; sellValue += value; }
    else { otherCount++; otherShares += shares; }
  }
  let signal: InsiderSignal = 'none';
  if (buyCount > 0 || sellCount > 0) {
    // Prefer $ values; fall back to shares when execution prices are missing.
    const netValue = buyValue - sellValue;
    const netShares = buyShares - sellShares;
    const net = netValue !== 0 ? netValue : netShares;
    signal = net > 0 ? 'buy' : net < 0 ? 'sell' : 'mixed';
  }
  return { buyCount, sellCount, buyValue, sellValue, buyShares, sellShares, otherCount, otherShares, signal };
}
