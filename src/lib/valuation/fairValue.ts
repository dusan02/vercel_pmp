/**
 * Composite fair value — 50 % relative (historical multiple) + 50 % simple
 * FCF DCF, computed POINT-IN-TIME on a weekly series: every value at week t
 * uses only multiples and fundamentals known at t (no look-ahead median).
 *
 * Inputs are the per-week TTM ratios already stored in DailyValuationHistory
 * (pe, ps, fcfYield). Per-share fundamentals are recovered from them —
 * close ÷ P/E = TTM EPS, close ÷ P/S = TTM rev/share, close × FCF yield =
 * TTM FCF/share — so the price cancels out and the series moves only when a
 * new statement lands.
 *
 * The line is recomputed only on fundamental-update weeks and carried
 * otherwise → it renders as a step line (like AlphaSpread), not a price echo.
 */
import { isPeDistorted } from '@/lib/analysis/peDistortion';

export interface FairValueInput {
  t: number;              // ms
  c: number;              // close
  pe?: number | null;
  ps?: number | null;
  fcfYield?: number | null; // decimal
}

export type FairMethod = 'pe+dcf' | 'ps+dcf' | 'pe' | 'ps' | 'dcf';

export const FAIR_METHOD_LABEL: Record<FairMethod, string> = {
  'pe+dcf': 'P/E + FCF DCF',
  'ps+dcf': 'P/S + FCF DCF',
  pe: 'P/E multiple',
  ps: 'P/S multiple',
  dcf: 'FCF DCF',
};

/** Format a dollar fair-value level cleanly ($213 for >=$100, $16.40 below). */
export function formatFairDollar(v: number): string {
  return `$${v.toFixed(v >= 100 ? 0 : 2)}`;
}

/** Human-readable valuation gap label from an undervaluation % ((fair - px) / fair × 100). */
export function formatFairStatus(undervalPct: number): string {
  if (Math.abs(undervalPct) < 1) return 'At fair value';
  return undervalPct > 0
    ? `${undervalPct.toFixed(0)}% undervalued`
    : `${Math.abs(undervalPct).toFixed(0)}% overvalued`;
}

export interface FairValuePoint {
  t: number;
  base: number;
  bear: number;
  bull: number;
  method: FairMethod;
}

export interface FairValueComponents {
  relBase: number | null;
  relBear: number | null;
  relBull: number | null;
  relKind: 'pe' | 'ps' | null;
  /** Applied multiple after growth cap (e.g. 35×), and raw trailing 5Y median (e.g. 55×). */
  relMultiple: number | null;
  relMedian: number | null;
  /** TTM EPS (for P/E) or TTM rev/share (for P/S) used by the relative leg. */
  relPerShare: number | null;
  dcfBase: number | null;
  dcfBear: number | null;
  dcfBull: number | null;
  fcfPerShare: number | null;
  growth: number | null;   // g0 used by the DCF base case
}

export const FAIR_CFG = {
  windowWeeks: 260,        // trailing 5Y multiple window
  minWindowWeeks: 52,      // need ≥1Y of multiples for a median
  discount: 0.10,
  terminalGrowth: 0.025,
  fadeTo: 0.03,            // growth fades linearly to this by year 10
  years: 10,
  gMin: -0.05,
  gMax: 0.20,
  growthLookbackWeeks: 260,
  minGrowthLookbackWeeks: 50,
  /** hide when base/price outside [gateLow, gate] — honest gap, not "+400 %".
   *  Asymmetric: a quality compounder at −60 % vs fair (COST, WMT) is a real
   *  view, while +150 % almost always means depressed/peak-cycle inputs. */
  gate: 2.5,
  gateLow: 0.3,
  /** Banks/insurers: operating cash flow includes deposits/float — FCF DCF is
   *  meaningless there, relative multiple only. */
  skipDcf: false,
  /** growth-justified P/E ceiling = peCapBase + growth% */
  peCapBase: 15,
  /** band clamp around base: bear ≥ base×bandLo, bull ≤ base×bandHi */
  bandLo: 0.5,
  bandHi: 2,
  changeTol: 0.005,
};

const MS_WEEK = 7 * 86400000;

function quantiles(vals: number[]): { p25: number; med: number; p75: number } {
  const s = [...vals].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
  return { p25: q(0.25), med: q(0.5), p75: q(0.75) };
}

const pos = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

/** 10-year two-stage FCF DCF per share. Returns null on non-positive FCF. */
export function dcfPerShare(fcf0: number, g0: number, r: number, cfg = FAIR_CFG): number | null {
  if (!(fcf0 > 0) || !(r > cfg.terminalGrowth)) return null;
  let cf = fcf0;
  let pv = 0;
  for (let k = 1; k <= cfg.years; k++) {
    const g = g0 + (cfg.fadeTo - g0) * ((k - 1) / (cfg.years - 1));
    cf *= 1 + g;
    pv += cf / Math.pow(1 + r, k);
  }
  const tv = (cf * (1 + cfg.terminalGrowth)) / (r - cfg.terminalGrowth);
  pv += tv / Math.pow(1 + r, cfg.years);
  return pv;
}

const MS_YEAR = 365.25 * 86400000;

function clampGrowth(g: number, cfg: typeof FAIR_CFG): number {
  return Math.max(cfg.gMin, Math.min(cfg.gMax, g));
}

/**
 * Trailing ≤5Y revenue/share CAGR blended 50/50 with the latest YoY change
 * (±6w around 52 weeks back) so decelerating growers are not valued solely on past pace.
 */
function estimateRevGrowth(series: FairValueInput[], i: number, rpsNow: number, cfg: typeof FAIR_CFG): number | null {
  const p = series[i]!;
  const target = p.t - cfg.growthLookbackWeeks * MS_WEEK;
  const minSpan = cfg.minGrowthLookbackWeeks * MS_WEEK;
  let old: FairValueInput | null = null;
  for (let j = 0; j < i; j++) {
    const s = series[j]!;
    if (s.t >= target && pos(s.ps)) { old = s; break; }
  }
  if (!old || p.t - old.t < minSpan) return null;

  const rpsOld = old.c / old.ps!;
  if (!(rpsOld > 0)) return null;

  let g = clampGrowth(Math.pow(rpsNow / rpsOld, MS_YEAR / (p.t - old.t)) - 1, cfg);
  const yoyAt = p.t - 52 * MS_WEEK;
  let ref: FairValueInput | null = null;
  for (let j = i - 1; j >= 0; j--) {
    const s = series[j]!;
    if (s.t < yoyAt - 6 * MS_WEEK) break;
    if (s.t > yoyAt + 6 * MS_WEEK || !pos(s.ps)) continue;
    if (!ref || Math.abs(s.t - yoyAt) < Math.abs(ref.t - yoyAt)) ref = s;
  }
  if (ref) {
    const yoy = Math.pow(rpsNow / (ref.c / ref.ps!), MS_YEAR / (p.t - ref.t)) - 1;
    g = 0.5 * g + 0.5 * clampGrowth(yoy, cfg);
  }
  return clampGrowth(g, cfg);
}

/** Historical multiple valuation: growth-capped P/E median, falling back to P/S when distorted/absent. */
function computeRelativeFair(
  p: FairValueInput,
  peWin: number[],
  psWin: number[],
  growth: number | null,
  cfg: typeof FAIR_CFG,
): Pick<FairValueComponents, 'relBase' | 'relBear' | 'relBull' | 'relKind' | 'relMultiple' | 'relMedian' | 'relPerShare'> {
  const peQ = peWin.length >= cfg.minWindowWeeks ? quantiles(peWin) : null;
  if (peQ && pos(p.pe) && !isPeDistorted(p.pe, peQ.med)) {
    const eps = p.c / p.pe;
    // Cap historical P/E median by growth-justified ceiling (15 + g%) so slowing growers de-rate honestly.
    const cap = growth != null ? cfg.peCapBase + 100 * Math.max(0, growth) : Infinity;
    const scale = Math.min(1, cap / peQ.med);
    return {
      relBase: eps * peQ.med * scale,
      relBear: eps * peQ.p25 * scale,
      relBull: eps * peQ.p75 * scale,
      relKind: 'pe',
      relMultiple: peQ.med * scale,
      relMedian: peQ.med,
      relPerShare: eps,
    };
  }
  if (psWin.length >= cfg.minWindowWeeks && pos(p.ps)) {
    const q = quantiles(psWin);
    const rps = p.c / p.ps;
    return {
      relBase: rps * q.med,
      relBear: rps * q.p25,
      relBull: rps * q.p75,
      relKind: 'ps',
      relMultiple: q.med,
      relMedian: q.med,
      relPerShare: rps,
    };
  }
  return {
    relBase: null, relBear: null, relBull: null, relKind: null,
    relMultiple: null, relMedian: null, relPerShare: null,
  };
}

/** 10Y FCF/share DCF scenarios (bear / base / bull). */
function computeDcfFair(
  p: FairValueInput,
  growth: number | null,
  cfg: typeof FAIR_CFG,
): Pick<FairValueComponents, 'dcfBase' | 'dcfBear' | 'dcfBull' | 'fcfPerShare'> {
  const fcf0 = p.fcfYield != null && Number.isFinite(p.fcfYield) ? p.c * p.fcfYield : null;
  if (cfg.skipDcf || fcf0 == null || fcf0 <= 0 || growth == null) {
    return { dcfBase: null, dcfBear: null, dcfBull: null, fcfPerShare: fcf0 };
  }
  return {
    dcfBase: dcfPerShare(fcf0, growth, cfg.discount, cfg),
    dcfBear: dcfPerShare(fcf0, growth > 0 ? growth * 0.6 : growth * 1.4, cfg.discount + 0.01, cfg),
    dcfBull: dcfPerShare(fcf0, growth > 0 ? Math.min(0.3, growth * 1.3) : growth * 0.6, cfg.discount - 0.01, cfg),
    fcfPerShare: fcf0,
  };
}

/** Components at index i of the (sorted) series. Exposed for tests/validation. */
export function componentsAt(series: FairValueInput[], i: number, cfg = FAIR_CFG): FairValueComponents {
  const p = series[i]!;
  const winFromT = p.t - cfg.windowWeeks * MS_WEEK;
  const peWin: number[] = [];
  const psWin: number[] = [];
  for (let j = i; j >= 0; j--) {
    const s = series[j]!;
    if (s.t < winFromT) break;
    if (pos(s.pe) && s.pe < 1000) peWin.push(s.pe);
    if (pos(s.ps) && s.ps < 1000) psWin.push(s.ps);
  }
  const rpsNow = pos(p.ps) ? p.c / p.ps : null;
  const growth = rpsNow != null ? estimateRevGrowth(series, i, rpsNow, cfg) : null;
  const rel = computeRelativeFair(p, peWin, psWin, growth, cfg);
  const dcf = computeDcfFair(p, growth, cfg);
  return { ...rel, ...dcf, growth };
}

export function combine(c: FairValueComponents, cfg = FAIR_CFG): Omit<FairValuePoint, 't'> | null {
  const r = combineRaw(c);
  if (!r) return null;
  // Depressed-EPS years inflate P75 P/E (BP: bull 7× base) — keep the band readable.
  return {
    ...r,
    bear: Math.min(r.base, Math.max(r.bear, r.base * cfg.bandLo)),
    bull: Math.max(r.base, Math.min(r.bull, r.base * cfg.bandHi)),
  };
}

function combineRaw(c: FairValueComponents): Omit<FairValuePoint, 't'> | null {
  const hasRel = c.relBase != null && c.relBase > 0;
  const hasDcf = c.dcfBase != null && c.dcfBase > 0;
  if (hasRel && hasDcf) {
    return {
      base: 0.5 * (c.relBase! + c.dcfBase!),
      bear: 0.5 * (c.relBear! + c.dcfBear!),
      bull: 0.5 * (c.relBull! + c.dcfBull!),
      method: c.relKind === 'pe' ? 'pe+dcf' : 'ps+dcf',
    };
  }
  if (hasRel) return { base: c.relBase!, bear: c.relBear!, bull: c.relBull!, method: c.relKind! };
  if (hasDcf) return { base: c.dcfBase!, bear: c.dcfBear!, bull: c.dcfBull!, method: 'dcf' };
  return null;
}

function changed(a: number | null, b: number | null, tol: number): boolean {
  if (a == null || b == null) return a !== b;
  return Math.abs(a - b) > Math.abs(b) * tol;
}

export interface FairValueAnalysis {
  points: FairValuePoint[];
  /** True when the latest bar had valid fundamentals/multiples but tripped the sanity gate. */
  latestGated: boolean;
  /** Method of the latest bar (even if gated), or of the latest emitted point. */
  latestMethod: FairMethod | null;
  /** Component breakdown from the most recent computed fundamental step. */
  latestComponents: FairValueComponents | null;
}

/**
 * Weekly fair-value series plus latest-bar gate status.
 * Points failing the price sanity gate are omitted (the chart draws a gap).
 * Input must be sorted ascending by t.
 */
export function analyzeFairValueSeries(series: FairValueInput[], cfg = FAIR_CFG): FairValueAnalysis {
  const points: FairValuePoint[] = [];
  let prevEps: number | null = null, prevRps: number | null = null, prevFcf: number | null = null;
  let cur: Omit<FairValuePoint, 't'> | null = null;
  let curComp: FairValueComponents | null = null;
  let started = false;
  let latestGated = false;
  let latestMethod: FairMethod | null = null;
  let latestComponents: FairValueComponents | null = null;
  for (let i = 0; i < series.length; i++) {
    const p = series[i]!;
    const eps = pos(p.pe) ? p.c / p.pe : null;
    const rps = pos(p.ps) ? p.c / p.ps : null;
    const fcf = p.fcfYield != null && Number.isFinite(p.fcfYield) ? p.c * p.fcfYield : null;
    if (eps == null && rps == null && fcf == null) {
      // no valuation coverage this week — break the line, force recompute
      cur = null; curComp = null; started = false; prevEps = prevRps = prevFcf = null;
      latestGated = false;
      continue;
    }
    const fundamentalsMoved = !started
      || cur == null
      || changed(eps, prevEps, cfg.changeTol)
      || changed(rps, prevRps, cfg.changeTol)
      || changed(fcf, prevFcf, cfg.changeTol);
    if (fundamentalsMoved) {
      curComp = componentsAt(series, i, cfg);
      cur = combine(curComp, cfg);
      prevEps = eps; prevRps = rps; prevFcf = fcf; started = true;
    }
    if (!cur) {
      latestGated = false;
      continue;
    }
    latestMethod = cur.method;
    latestComponents = curComp;
    const ratio = cur.base / p.c;
    if (!(ratio <= cfg.gate && ratio >= cfg.gateLow)) {
      latestGated = true;
      continue;
    }
    latestGated = false;
    points.push({
      t: p.t,
      base: +cur.base.toFixed(2),
      bear: +cur.bear.toFixed(2),
      bull: +cur.bull.toFixed(2),
      method: cur.method,
    });
  }
  return { points, latestGated, latestMethod, latestComponents };
}

/**
 * Weekly fair-value series. Points failing the price sanity gate are omitted
 * (the chart draws a gap). Input must be sorted ascending by t.
 */
export function computeFairValueSeries(series: FairValueInput[], cfg = FAIR_CFG): FairValuePoint[] {
  return analyzeFairValueSeries(series, cfg).points;
}
