import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  analyzeFairValueSeries,
  componentsAt,
  computeFairValueSeries,
  dcfPerShare,
  FAIR_CFG,
  type FairValueInput,
} from '@/lib/valuation/fairValue';

jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) =>
      React.createElement(
        'div',
        { style: { width: 900, height: 470 } },
        React.isValidElement(children) ? React.cloneElement(children as any, { width: 900, height: 470 }) : children,
      ),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ValuationHistoryChart } = require('@/components/company/ValuationHistoryChart');

const MS_WEEK = 7 * 86400000;

function makeSeries(
  weeks: number,
  fn: (i: number) => { c: number; eps: number | null; rps: number | null; fcf: number | null },
): FairValueInput[] {
  const t0 = Date.UTC(2021, 0, 4);
  const out: FairValueInput[] = [];
  for (let i = 0; i < weeks; i++) {
    const { c, eps, rps, fcf } = fn(i);
    out.push({
      t: t0 + i * MS_WEEK,
      c,
      pe: eps != null && eps > 0 ? c / eps : null,
      ps: rps != null && rps > 0 ? c / rps : null,
      fcfYield: fcf != null ? fcf / c : null,
    });
  }
  return out;
}

describe('composite fair value engine (point-in-time)', () => {
  it('computes 10Y faded DCF per share and returns null on invalid inputs', () => {
    const v = dcfPerShare(5, 0.10, 0.10);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(60);
    expect(v!).toBeLessThan(160);
    expect(dcfPerShare(0, 0.10, 0.10)).toBeNull();
    expect(dcfPerShare(-2, 0.10, 0.10)).toBeNull();
    expect(dcfPerShare(5, 0.10, 0.02)).toBeNull(); // r <= terminalGrowth
  });

  it('has zero look-ahead bias: changing later multiples never alters earlier points', () => {
    const base = makeSeries(140, (i) => {
      const q = Math.floor(i / 13);
      return {
        c: 100 + (i % 7) * 2,
        eps: 4 + q * 0.2,
        rps: 20 + q * 1.0,
        fcf: 3.5 + q * 0.15,
      };
    });
    const mutated = base.map((p, i) =>
      i >= 100 ? { ...p, c: p.c * 2.5, pe: (p.pe ?? 20) * 2.5 } : p,
    );

    const fvA = computeFairValueSeries(base);
    const fvB = computeFairValueSeries(mutated);
    const earlyA = fvA.filter((p) => p.t < base[100]!.t);
    const earlyB = fvB.filter((p) => p.t < base[100]!.t);

    expect(earlyA.length).toBeGreaterThan(20);
    expect(earlyA).toEqual(earlyB);
  });

  it('renders as a step line: stays constant while market price fluctuates between filings', () => {
    // EPS/Rev/FCF step only every 13 weeks; price oscillates ±15% weekly.
    const series = makeSeries(100, (i) => {
      const q = Math.floor(i / 13);
      const wave = 1 + 0.15 * Math.sin(i * 0.9);
      return {
        c: 100 * wave,
        eps: 5 + q * 0.3,
        rps: 25 + q * 1.5,
        fcf: 4 + q * 0.25,
      };
    });

    const fv = computeFairValueSeries(series);
    expect(fv.length).toBeGreaterThan(20);

    // Every non-filing week after the first emitted point keeps the exact same base
    for (let k = 1; k < fv.length; k++) {
      const idx = series.findIndex((s) => s.t === fv[k]!.t);
      if (idx % 13 !== 0) {
        expect(fv[k]!.base).toBe(fv[k - 1]!.base);
      }
      expect(fv[k]!.bear).toBeLessThanOrEqual(fv[k]!.base);
      expect(fv[k]!.bull).toBeGreaterThanOrEqual(fv[k]!.base);
      expect(fv[k]!.bear).toBeGreaterThanOrEqual(+(fv[k]!.base * FAIR_CFG.bandLo).toFixed(2) - 0.02);
      expect(fv[k]!.bull).toBeLessThanOrEqual(+(fv[k]!.base * FAIR_CFG.bandHi).toFixed(2) + 0.02);
    }
  });

  it('caps hyper-growth historical P/E median via peCapBase + growth% and falls back on distorted P/E', () => {
    // Stock traded at 60× P/E historically while growing ~10%/yr → capped at 15+10 = 25×
    const growthSeries = makeSeries(120, (i) => {
      const q = Math.floor(i / 13);
      const rps = 10 * Math.pow(1.024, q); // ~10%/yr
      const eps = 2 * Math.pow(1.024, q);
      return { c: eps * 60, eps, rps, fcf: eps * 0.9 };
    });
    const comp = componentsAt(growthSeries, growthSeries.length - 1);
    const epsNow = growthSeries.at(-1)!.c / growthSeries.at(-1)!.pe!;
    expect(comp.relKind).toBe('pe');
    expect(comp.relBase!).toBeLessThan(epsNow * 30);

    // Distorted P/E spike (>150× on latest bar) falls back to P/S
    const distorted = makeSeries(100, (i) => ({
      c: 100,
      eps: i >= 95 ? 0.5 : 5, // latest P/E = 200×
      rps: 20,
      fcf: 4,
    }));
    const compDist = componentsAt(distorted, distorted.length - 1);
    expect(compDist.relKind).toBe('ps');
  });

  it('skips FCF DCF for Financial Services and omits extreme outliers via sanity gate', () => {
    const fin = makeSeries(100, () => ({ c: 100, eps: 8, rps: 30, fcf: 25 }));
    const resFin = analyzeFairValueSeries(fin, { ...FAIR_CFG, skipDcf: true });
    expect(resFin.points.length).toBeGreaterThan(20);
    expect(resFin.points.every((p) => p.method === 'pe')).toBe(true);

    // Price collapses to $10 while fundamentals imply ~$100 → ratio > 2.5 → gated!
    const gatedSeries = makeSeries(100, (i) => ({
      c: i >= 90 ? 10 : 100,
      eps: 5,
      rps: 20,
      fcf: 4,
    }));
    const resGated = analyzeFairValueSeries(gatedSeries);
    expect(resGated.latestGated).toBe(true);
    expect(resGated.points.some((p) => p.t >= gatedSeries[90]!.t)).toBe(false);
  });

  it('ValuationHistoryChart renders composite Auto (Fair) basis without falling back to PE/PS', async () => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const history = [
      { date: '2025-11-01', price: 140, intrinsic: 200, undervaluationPct: 30 },
      { date: '2026-11-16', price: 156, intrinsic: 213, undervaluationPct: 26.76 },
    ];
    await act(async () => {
      root.render(
        React.createElement(ValuationHistoryChart, {
          ticker: 'NVDA',
          valuationHistory: history,
          valuationHistoryPE: [{ date: '2026-11-16', price: 156, intrinsic: 445, undervaluationPct: 64.94 }],
          valuationHistoryPS: [{ date: '2026-11-16', price: 156, intrinsic: 300, undervaluationPct: 48 }],
          valuationBasis: 'composite',
          fairValueMethod: 'pe+dcf',
          summary: { currentUndervaluation: 26.76, avg5yUndervaluation: 28.38, intrinsicCagr: 6.2 },
        }),
      );
    });

    expect(container.textContent).toContain('Auto (Fair)');
    expect(container.textContent).toContain('Fair = P/E + FCF DCF');
    expect(container.textContent).toContain('$213.00');
    expect(container.textContent).not.toContain('$445.00');
  });
});
