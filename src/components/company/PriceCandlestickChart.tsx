'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  Line,
  Area,
  ReferenceLine,
  Brush,
  AreaChart,
} from 'recharts';
import { CHART_FONT } from '@/components/charts/chartTheme';

interface Candle {
  t: number; // timestamp (ms)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  pe?: number | null; // TTM P/E on the candle's close day
}

interface ChartPoint extends Candle {
  date: string; // ISO yyyy-mm-dd (category key)
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  peFair?: number | null;
  /** implied TTM EPS for this week (close / pe) — used by tooltip + markers */
  eps?: number | null;
  /** this week carries a new TTM EPS (fresh financial statements) */
  epsChanged?: boolean;
  /** [p25, p75] band for the P/E-multiple view */
  peBand?: [number, number];
  volSpike?: boolean;
}

interface PriceCandlestickChartProps {
  ticker: string;
  /** Live/current quote to unify the header price with the page hero.
   *  When provided it overrides the latest-candle close (which may be stale
   *  or split-adjusted); the candle close stays visible as a dated reference. */
  currentPrice?: number | null;
  currentChangePct?: number | null;
  changeLabel?: string;
}

type PeriodLabel = '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'All';

const UP = '#16a34a'; // green
const DOWN = '#dc2626'; // red
const MA20 = '#2563eb'; // blue
const MA50 = '#7c3aed'; // violet
const MA200 = '#0891b2'; // teal — 200-day ≈ 40 weekly bars
const PE_FAIR = '#db2777'; // pink — price-at-median-P/E overlay
const PE_LINE = '#4f46e5'; // indigo — P/E-multiple view
const VOL_SPIKE = '#d97706'; // amber — volume ≫ its own norm
const REF52 = '#64748b'; // slate-500 — 52W hi/lo lines (400 was too light on white)

// User-togglable indicator set; persisted per-browser, default off.
const IND_KEY = 'pmp:pricechart:indicators';
type IndKey = 'ma20' | 'ma50' | 'ma200' | 'pefair' | 'w52' | 'volspike';
type ModeKey = 'price' | 'pe';
const INDICATORS: { key: IndKey; label: string; color: string }[] = [
  { key: 'ma20', label: 'MA 20w', color: MA20 },
  { key: 'ma50', label: 'MA 50w', color: MA50 },
  { key: 'ma200', label: 'MA 200d', color: MA200 },
  { key: 'pefair', label: 'Med P/E', color: PE_FAIR },
  { key: 'w52', label: '52W hi/lo', color: REF52 },
  { key: 'volspike', label: 'Vol spike', color: VOL_SPIKE },
];

// Rolling mean — null until `n` observations exist (line starts later).
function rollingMean(vals: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(vals.length).fill(null);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i]!;
    if (i >= n) sum -= vals[i - n]!;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function formatXTick(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function fmtVol(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${v}`;
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────
function CandleTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: ChartPoint = payload[0].payload;
  if (!p) return null;
  const up = p.c >= p.o;
  const changePct = p.o > 0 ? ((p.c - p.o) / p.o) * 100 : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-xs min-w-[170px]">
      <div className="text-gray-500 dark:text-gray-400 mb-2 font-medium">
        {new Date(p.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
        <span className="text-gray-500 dark:text-gray-400">Open</span>
        <span className="text-right text-gray-900 dark:text-white">${p.o.toFixed(2)}</span>
        <span className="text-gray-500 dark:text-gray-400">High</span>
        <span className="text-right text-gray-900 dark:text-white">${p.h.toFixed(2)}</span>
        <span className="text-gray-500 dark:text-gray-400">Low</span>
        <span className="text-right text-gray-900 dark:text-white">${p.l.toFixed(2)}</span>
        <span className="text-gray-500 dark:text-gray-400">Close</span>
        <span className="text-right font-semibold" style={{ color: up ? UP : DOWN }}>
          ${p.c.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
        </span>
        <span className="text-gray-500 dark:text-gray-400">Volume</span>
        <span className="text-right text-gray-700 dark:text-gray-300">
          {fmtVol(p.v)}{p.volSpike ? ' ⚡' : ''}
        </span>
        {p.sma20 != null && (
          <>
            <span style={{ color: MA20 }}>MA 20w</span>
            <span className="text-right text-gray-700 dark:text-gray-300">${p.sma20.toFixed(2)}</span>
          </>
        )}
        {p.sma50 != null && (
          <>
            <span style={{ color: MA50 }}>MA 50w</span>
            <span className="text-right text-gray-700 dark:text-gray-300">${p.sma50.toFixed(2)}</span>
          </>
        )}
        {p.sma200 != null && (
          <>
            <span style={{ color: MA200 }}>MA 200d</span>
            <span className="text-right text-gray-700 dark:text-gray-300">${p.sma200.toFixed(2)}</span>
          </>
        )}
        {p.pe != null && p.pe > 0 && (
          <>
            <span className="text-gray-500 dark:text-gray-400">P/E (TTM)</span>
            <span className="text-right text-gray-700 dark:text-gray-300">{p.pe.toFixed(1)}×</span>
            {p.eps != null && (
              <>
                <span className="text-gray-500 dark:text-gray-400">TTM EPS</span>
                <span className="text-right text-gray-700 dark:text-gray-300">${p.eps.toFixed(2)}</span>
              </>
            )}
          </>
        )}
        {p.peFair != null && (
          <>
            <span style={{ color: PE_FAIR }}>Med P/E fair</span>
            <span className="text-right text-gray-700 dark:text-gray-300">
              ${p.peFair.toFixed(2)}
              {' '}
              <span className="text-[10px]" style={{ color: p.c <= p.peFair ? UP : DOWN }}>
                ({((p.c - p.peFair) / p.peFair) * 100 >= 0 ? '+' : ''}{(((p.c - p.peFair) / p.peFair) * 100).toFixed(0)}%)
              </span>
            </span>
          </>
        )}
        {p.epsChanged && (
          <div className="col-span-2 mt-1 pt-1 border-t border-gray-200 dark:border-gray-700 text-[10px]" style={{ color: PE_FAIR }}>
            ↑ earnings update — new TTM EPS
          </div>
        )}
      </div>
    </div>
  );
}

// P/E-multiple view tooltip — the multiple itself vs its own distribution.
function PeTooltip({ active, payload, peStats }: any) {
  if (!active || !payload?.length) return null;
  const p: ChartPoint = payload[0].payload;
  if (!p) return null;
  const pe = p.pe != null && p.pe > 0 ? p.pe : null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-xs min-w-[170px]">
      <div className="text-gray-500 dark:text-gray-400 mb-2 font-medium">
        {new Date(p.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
        {pe != null ? (
          <>
            <span style={{ color: PE_LINE }}>P/E (TTM)</span>
            <span className="text-right font-semibold text-gray-900 dark:text-white">{pe.toFixed(1)}×</span>
          </>
        ) : (
          <>
            <span className="text-gray-500 dark:text-gray-400">P/E (TTM)</span>
            <span className="text-right text-gray-400 dark:text-gray-500">n/m</span>
          </>
        )}
        {p.eps != null && (
          <>
            <span className="text-gray-500 dark:text-gray-400">TTM EPS</span>
            <span className="text-right text-gray-700 dark:text-gray-300">${p.eps.toFixed(2)}</span>
          </>
        )}
        {peStats && (
          <>
            <span style={{ color: PE_FAIR }}>Median</span>
            <span className="text-right text-gray-700 dark:text-gray-300">{peStats.median.toFixed(1)}×</span>
            <span className="text-gray-500 dark:text-gray-400">25–75th</span>
            <span className="text-right text-gray-700 dark:text-gray-300">
              {peStats.p25.toFixed(0)}–{peStats.p75.toFixed(0)}×
            </span>
          </>
        )}
        {pe != null && peStats && (
          <>
            <span className="text-gray-500 dark:text-gray-400">vs median</span>
            <span className="text-right" style={{ color: pe <= peStats.median ? UP : DOWN }}>
              {((pe - peStats.median) / peStats.median) * 100 >= 0 ? '+' : ''}
              {(((pe - peStats.median) / peStats.median) * 100).toFixed(0)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}


export function PriceCandlestickChart({ ticker, currentPrice, currentChangePct, changeLabel = 'day' }: PriceCandlestickChartProps) {
  const [allCandles, setAllCandles] = useState<Candle[] | null>(null);
  const [peStats, setPeStats] = useState<{ median: number; p25: number; p75: number; n: number } | null>(null);
  const [mode, setMode] = useState<ModeKey>('price');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodLabel>('5Y');
  const [inds, setInds] = useState<Set<IndKey>>(new Set());
  // Narrow viewport → tighter chart margins / axis so the plot claims more
  // of the mobile screen (390px phone otherwise plots in ~64% of width).
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Hydrate indicator toggles from localStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(IND_KEY);
      if (raw) setInds(new Set(JSON.parse(raw) as IndKey[]));
    } catch { /* ignore corrupt value */ }
  }, []);

  const toggleInd = (k: IndKey) => {
    setInds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem(IND_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/analysis/${ticker}/candles`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => {
        if (!mounted) return;
        setAllCandles(Array.isArray(json.candles) ? json.candles : []);
        setPeStats(json.peStats ?? null);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('Failed to load candles:', err);
        setError('Could not load price chart.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [ticker]);

  // Available span decides which period buttons exist — Polygon Starter
  // returns ~5Y max, so on most tickers "5Y" would show the identical series
  // as "All" (a dead button). A fixed period is only offered when it trims at
  // least ~5 weeks; "All" always covers whatever history exists.
  const spanYears = useMemo(() => {
    if (!allCandles || allCandles.length < 2) return 0;
    const sorted = [...allCandles].sort((a, b) => a.t - b.t);
    return (sorted[sorted.length - 1]!.t - sorted[0]!.t) / (365.25 * 24 * 60 * 60 * 1000);
  }, [allCandles]);

  const periodChoices = useMemo((): { label: PeriodLabel; years: number }[] => {
    const now = Date.now();
    const jan1 = new Date(new Date(now).getFullYear(), 0, 1).getTime();
    const ytdYears = (now - jan1) / (365.25 * 24 * 60 * 60 * 1000);
    const candidates: { label: PeriodLabel; years: number }[] = [
      { label: '3M', years: 0.25 },
      { label: '6M', years: 0.5 },
      { label: 'YTD', years: ytdYears },
      { label: '1Y', years: 1 },
      { label: '3Y', years: 3 },
      { label: '5Y', years: 5 },
    ];
    // Skip periods that don't trim the series (~5+ weeks) or are too short
    // to draw (~4 weekly candles), plus dedupe YTD when it equals 1Y.
    const fixed = candidates.filter(
      (p, i, arr) =>
        p.years < spanYears - 0.1 &&
        p.years > 0.08 &&
        (p.label !== 'YTD' || Math.abs(p.years - 1) > 0.12) &&
        (i === 0 || p.years - arr[i - 1]!.years > 0.03),
    );
    return [...fixed, { label: 'All' as const, years: 99 }];
  }, [spanYears]);

  // Selected period may not be offered for this ticker's span (e.g. '5Y'
  // default on a 2-year IPO) — fall back to 'All' instead of a dead state.
  const activePeriod: PeriodLabel = periodChoices.some((p) => p.label === period)
    ? period
    : 'All';

  // Enriched full series — sorting, SMAs, implied EPS and the valuation band
  // are computed over ALL candles once; the price-mode `data` window and the
  // P/E-mode brush window are slices of this.
  const enriched: ChartPoint[] = useMemo(() => {
    if (!allCandles) return [];
    // Sort the full series first — SMA must see consecutive candles.
    const sorted = [...allCandles].sort((a, b) => a.t - b.t);
    const sma20 = rollingMean(sorted.map((c) => c.c), 20);
    const sma50 = rollingMean(sorted.map((c) => c.c), 50);
    // 40 weekly bars ≈ the 200-day average investors actually mean by SMA200
    const sma200 = rollingMean(sorted.map((c) => c.c), 40);
    const volSma = rollingMean(sorted.map((c) => c.v || 0), 20);
    // Implied TTM EPS on the full series — close ÷ P/E cancels the price out,
    // so week-over-week changes flag a fresh financial statement (earnings
    // marker), not market movement. Computed pre-window so a filing just
    // before the displayed range isn't missed.
    const epsArr: (number | null)[] = sorted.map((c) =>
      c.pe != null && c.pe > 0 && Number.isFinite(c.pe) ? c.c / c.pe : null,
    );
    const epsChanged: boolean[] = epsArr.map((e, i) => {
      if (e == null) return false;
      // find previous non-null eps (skips valuation-coverage gaps)
      for (let j = i - 1; j >= 0; j--) {
        const prev = epsArr[j];
        if (prev != null) return Math.abs(e - prev) > Math.abs(prev) * 0.005;
      }
      return false;
    });
    const out: ChartPoint[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i]!;
      const va = volSma[i];
      out.push({
        ...c,
        date: new Date(c.t).toISOString().slice(0, 10),
        sma20: sma20[i] ?? null,
        sma50: sma50[i] ?? null,
        sma200: sma200[i] ?? null,
        eps: epsArr[i] ?? null,
        epsChanged: epsChanged[i] ?? false,
        // Spike = this week's volume > 2× its own trailing 20w mean (≈ RVOL 2)
        volSpike: va != null && va > 0 && (c.v || 0) > 2 * va,
      });
    }
    // Valuation layer — p25–p75 band + median-P/E fair value. Stats come from
    // the API computed over the FULL valuation series: the timeframe switch
    // changes only what is displayed, never the valuation methodology.
    const medPe = peStats?.median ?? null;
    for (const p of out) {
      if (peStats && p.pe != null) p.peBand = [peStats.p25, peStats.p75];
      if (inds.has('pefair') && medPe != null) {
        // Fair value = TTM EPS × median P/E — independent of market price;
        // it legitimately steps only when new financial statements land.
        p.peFair = p.eps != null ? p.eps * medPe : null;
      }
    }
    return out;
  }, [allCandles, inds, peStats]);

  const periodCutoffMs = useMemo(() => {
    const years = periodChoices.find((p) => p.label === activePeriod)?.years ?? 99;
    return Date.now() - years * 365.25 * 24 * 60 * 60 * 1000;
  }, [periodChoices, activePeriod]);

  // Price-mode window — the P/E chart instead takes the full series and
  // windows it through the Brush navigator below the chart.
  const data: ChartPoint[] = useMemo(
    () => enriched.filter((p) => p.t >= periodCutoffMs),
    [enriched, periodCutoffMs],
  );

  // P/E-mode window. The Brush is UNCONTROLLED: its startIndex/endIndex props
  // are only initial values — the chart remounts via `key` on every period
  // click so a new window is applied. Drag indices are mirrored into peBrush
  // solely for the y-domain and the header label — they must NOT feed back
  // into the Brush props (a controlled loop races recharts' internal store
  // and can leave the displayed slice empty).
  const [peBrush, setPeBrush] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [peEpoch, setPeEpoch] = useState(0);
  useEffect(() => setPeBrush(null), [activePeriod, ticker]);

  const pePeriodStart = useMemo(() => {
    const i = enriched.findIndex((p) => p.t >= periodCutoffMs);
    return i < 0 ? 0 : i;
  }, [enriched, periodCutoffMs]);

  const peWindow = useMemo(() => {
    const n = enriched.length;
    if (!n) return { startIndex: 0, endIndex: 0 };
    if (peBrush) {
      const s = Math.max(0, Math.min(peBrush.startIndex, n - 1));
      const e = Math.max(s, Math.min(peBrush.endIndex, n - 1));
      return { startIndex: s, endIndex: e };
    }
    return { startIndex: pePeriodStart, endIndex: n - 1 };
  }, [enriched, peBrush, pePeriodStart]);

  const peVisible = useMemo(
    () => enriched.slice(peWindow.startIndex, peWindow.endIndex + 1),
    [enriched, peWindow],
  );

  // Trailing 52-week high/low over the FULL series (window-independent).
  const hiLo52 = useMemo(() => {
    if (!allCandles?.length) return null;
    const last52 = [...allCandles].sort((a, b) => a.t - b.t).slice(-52);
    let hi = -Infinity, lo = Infinity;
    for (const c of last52) { if (c.h > hi) hi = c.h; if (c.l < lo) lo = c.l; }
    return Number.isFinite(hi) ? { hi, lo } : null;
  }, [allCandles]);

  // Pre-computed ONCE — the previous per-candle Math.max(...data.map(...))
  // inside the Bar shape was O(n²) per render (~67k iterations for 5Y weekly).
  const maxVolume = useMemo(
    () => Math.max(...data.map(pt => pt.v || 0), 1),
    [data]
  );

  // P/E-multiple view: y-domain hugs the distribution, not extreme outliers.
  // Cap at ~q95 of visible values × 1.08 (always ≥ p75×1.6) so single-name
  // P/E spikes can't flatten the median/band the user came to compare.
  const peDomain = useMemo((): [number, number] => {
    if (!peVisible.length || !peStats) return [0, 1];
    const vals = peVisible
      .map((d) => d.pe)
      .filter((v): v is number => v != null && v > 0 && Number.isFinite(v))
      .sort((a, b) => a - b);
    const q95 = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))]! : 0;
    return [0, Math.ceil(Math.max(q95 * 1.08, peStats.p75 * 1.6))];
  }, [peVisible, peStats]);

  // P/E-mode headline — current multiple (live quote ÷ latest implied TTM EPS
  // when a live price is available, else the last candle's stored P/E), the
  // change over the visible window, and context stats for the caption line.
  const peHeadline = useMemo(() => {
    if (!enriched.length) return null;
    const last = enriched[enriched.length - 1]!;
    const eps = last.eps ?? null;
    const peLive =
      currentPrice != null && eps != null && eps > 0
        ? currentPrice / eps
        : last.pe != null && last.pe > 0
          ? last.pe
          : null;
    const firstVis = peVisible.find((p) => p.pe != null && p.pe > 0);
    const base = firstVis?.pe ?? null;
    const chgPct = peLive != null && base != null && base > 0 ? (peLive / base - 1) * 100 : null;
    // Trailing ~1Y mean of weekly P/E (52 weekly candles).
    const last52 = enriched
      .slice(-52)
      .map((p) => p.pe)
      .filter((v): v is number => v != null && v > 0);
    const avg1y = last52.length ? last52.reduce((a, b) => a + b, 0) / last52.length : null;
    const price = currentPrice ?? last.c;
    return { peLive, chgPct, eps, avg1y, price, date: last.date };
  }, [enriched, peVisible, currentPrice]);

  // "How far from fair" — premium/discount of current price vs the last
  // median-P/E fair value. Shown only while the overlay is on.
  const fairPremium = useMemo(() => {
    if (!inds.has('pefair') || !peStats) return null;
    const last = [...data].reverse().find((d) => d.peFair != null);
    if (!last?.peFair) return null;
    const px = currentPrice ?? last.c;
    return { fair: last.peFair, pct: ((px - last.peFair) / last.peFair) * 100 };
  }, [data, inds, peStats, currentPrice]);

  // Domain is extended below the lowest price so the bottom of the plot is a
  // dedicated volume strip — the lowest candle wick then never renders inside
  // the volume bars and axis ticks don't land inside the strip either.
  // volFrac = the fraction of the plot (from the bottom) reserved for volume.
  const { yDomain, volFrac } = useMemo(() => {
    if (!data.length) return { yDomain: [0, 1] as [number, number], volFrac: 0.16 };
    let min = Infinity;
    let max = -Infinity;
    for (const d of data) {
      if (d.l < min) min = d.l;
      if (d.h > max) max = d.h;
      if (inds.has('ma20') && d.sma20 != null) { if (d.sma20 < min) min = d.sma20; if (d.sma20 > max) max = d.sma20; }
      if (inds.has('ma50') && d.sma50 != null) { if (d.sma50 < min) min = d.sma50; if (d.sma50 > max) max = d.sma50; }
      if (inds.has('ma200') && d.sma200 != null) { if (d.sma200 < min) min = d.sma200; if (d.sma200 > max) max = d.sma200; }
      if (inds.has('pefair') && d.peFair != null) { if (d.peFair < min) min = d.peFair; if (d.peFair > max) max = d.peFair; }
    }
    if (inds.has('w52') && hiLo52) {
      if (hiLo52.lo < min) min = hiLo52.lo;
      if (hiLo52.hi > max) max = hiLo52.hi;
    }
    const pad = (max - min) * 0.06 || 1;
    // Round to whole $10 steps — recharts otherwise adds an unrounded domain-
    // edge tick ($522 next to $464/$314/$164) that reads as a broken scale.
    const hi = Math.ceil((max + pad) / 10) * 10;
    const lo = Math.floor((min - pad) / 10) * 10;
    // Exact 16% of the domain below the price zone: (lo - d) / (hi - d) = 0.16.
    // domMin clamps at 0 — for near-zero-priced stocks lo can also go negative,
    // so volFrac itself is clamped (0 = no volume strip rather than inverted).
    const domMin = Math.max(0, (lo - 0.16 * hi) / 0.84);
    const volFrac = Math.max(0, Math.min(0.4, (lo - domMin) / (hi - domMin)));
    return { yDomain: [domMin, hi] as [number, number], volFrac };
  }, [data, inds, hiLo52]);

  // Distance of latest close from enabled MAs — the "how stretched" sentence.
  const maDistances = useMemo(() => {
    const last = data[data.length - 1];
    if (!last) return null;
    // Measure from the same price the header shows (live quote preferred).
    const px = currentPrice ?? last.c;
    const out: { label: string; pct: number; color: string }[] = [];
    if (inds.has('ma20') && last.sma20) out.push({ label: '20W', pct: ((px - last.sma20) / last.sma20) * 100, color: MA20 });
    if (inds.has('ma50') && last.sma50) out.push({ label: '50W', pct: ((px - last.sma50) / last.sma50) * 100, color: MA50 });
    return out.length ? out : null;
  }, [data, inds, currentPrice]);

  const stats = useMemo(() => {
    if (!data.length) return null;
    const first = data[0]!;
    const last = data[data.length - 1]!;
    const change = last.c - first.o;
    const periodChangePct = first.o > 0 ? (change / first.o) * 100 : 0;
    // One price truth: prefer the live quote (same source as the page hero);
    // fall back to the latest candle close when no live quote exists.
    const headline = currentPrice ?? last.c;
    const changePct = currentChangePct ?? periodChangePct;
    return { last: last.c, date: last.date, headline, changePct, up: changePct >= 0 };
  }, [data, currentPrice, currentChangePct]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-72">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !data.length) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-500 italic py-12 text-center">
        {error ?? 'No price history available for this ticker.'}
      </div>
    );
  }

  return (
    <div>
      {/* Header: current price (price mode) or current P/E (P/E mode) + period toggle */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {mode === 'pe' && peHeadline ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              {peHeadline.peLive != null ? `${peHeadline.peLive.toFixed(1)}×` : 'n/m'}
            </span>
            {peHeadline.chgPct != null && (
              <span
                className={`text-sm font-semibold ${peHeadline.chgPct <= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                title="P/E change across the visible range — falling multiple = cheaper"
              >
                {peHeadline.chgPct >= 0 ? '+' : ''}{peHeadline.chgPct.toFixed(1)}% ({peBrush ? 'range' : activePeriod})
              </span>
            )}
            {peHeadline.peLive == null && (
              <span className="text-xs text-gray-500 dark:text-gray-400">negative TTM EPS</span>
            )}
          </div>
        ) : stats && (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              ${stats.headline.toFixed(2)}
            </span>
            <span
              className={`text-sm font-semibold ${stats.up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {stats.changePct >= 0 ? '+' : ''}{stats.changePct.toFixed(2)}%{currentChangePct == null ? ` (${activePeriod})` : ` (${changeLabel})`}
            </span>
            {currentPrice != null && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                last candle ${stats.last.toFixed(2)} on {stats.date}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode — Price chart vs P/E-multiple chart */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setMode('price')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                mode === 'price'
                  ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Price
            </button>
            <button
              type="button"
              onClick={() => setMode('pe')}
              disabled={!peStats}
              title={peStats ? 'TTM P/E vs its own historical median and quartile band' : 'P/E history not available'}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === 'pe'
                  ? 'bg-white dark:bg-gray-900 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              style={mode === 'pe' ? { color: PE_LINE } : undefined}
            >
              P/E
            </button>
          </div>
          {/* Indicator toggles — colored dot doubles as the line legend.
              Stay mounted (disabled) in P/E mode so the toolbar never
              reflows on mode switch; toggled state persists for the
              return to Price. */}
          <div
            className={`flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5 gap-0.5 transition-opacity ${
              mode === 'pe' ? 'opacity-40' : ''
            }`}
          >
            {INDICATORS.map((ind) => (
              <button
                key={ind.key}
                type="button"
                disabled={mode === 'pe'}
                onClick={() => toggleInd(ind.key)}
                title={
                  mode === 'pe'
                    ? 'Price-chart indicators — switch back to Price view'
                    : ind.key === 'volspike'
                      ? 'Highlight weeks with volume > 2× the 20-week average'
                      : ind.key === 'pefair'
                        ? 'TTM EPS × historical median P/E — steps mark earnings updates, not market moves'
                        : undefined
                }
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 disabled:cursor-not-allowed ${
                  inds.has(ind.key)
                    ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: inds.has(ind.key) ? ind.color : 'rgba(148,163,184,0.4)' }}
                />
                {ind.label}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5 gap-0.5">
            {periodChoices.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setPeriod(p.label); setPeBrush(null); setPeEpoch((e) => e + 1); }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                  activePeriod === p.label
                    ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'pe' && peStats ? (
        <>
        <ResponsiveContainer width="100%" height={narrow ? 400 : 470}>
          <ComposedChart key={`pe-${ticker}-${peEpoch}`} data={enriched} margin={{ top: 8, right: narrow ? 4 : 16, left: narrow ? 0 : 8, bottom: 4 }}>
            <defs>
              <linearGradient id="peAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PE_LINE} stopOpacity={0.30} />
                <stop offset="100%" stopColor={PE_LINE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
            <XAxis
              dataKey="date"
              scale="band"
              tickFormatter={formatXTick}
              minTickGap={40}
              tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-500"
              tickLine={false}
              axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
            />
            <YAxis
              domain={peDomain}
              orientation="right"
              tickFormatter={(v: number) => `${v.toFixed(0)}×`}
              tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-500"
              tickLine={false}
              axisLine={false}
              width={narrow ? 36 : 48}
            />
            <Tooltip content={<PeTooltip peStats={peStats} />} isAnimationActive={false} />
            {/* 25th–75th percentile band — the stock's own normal range */}
            <Area
              type="monotone"
              dataKey="peBand"
              stroke="none"
              fill={PE_LINE}
              fillOpacity={0.08}
              isAnimationActive={false}
              connectNulls={false}
            />
            {/* The multiple itself — gradient area, finance-charts style */}
            <Area
              type="monotone"
              dataKey="pe"
              stroke={PE_LINE}
              strokeWidth={1.8}
              fill="url(#peAreaGrad)"
              isAnimationActive={false}
              connectNulls={false}
              dot={false}
            />
            <ReferenceLine
              y={peStats.median}
              stroke={PE_FAIR}
              strokeDasharray="6 4"
              label={{ value: `median ${peStats.median.toFixed(1)}×`, position: 'insideTopLeft', fontSize: 10, fill: PE_FAIR }}
            />
            {/* Navigator — mini full-history chart; drag handles or use the
                period buttons above. Brush dataKey = the X category (date),
                and its child must be a nested chart element. */}
            <Brush
              dataKey="date"
              height={26}
              stroke={PE_LINE}
              travellerWidth={8}
              startIndex={pePeriodStart}
              endIndex={Math.max(0, enriched.length - 1)}
              onChange={(b: any) => {
                if (b?.startIndex != null && b?.endIndex != null) {
                  setPeBrush({ startIndex: b.startIndex, endIndex: b.endIndex });
                }
              }}
              tickFormatter={(v: any) => (typeof v === 'string' && v.includes('-') ? formatXTick(v) : '')}
            >
              <AreaChart>
                <Area type="monotone" dataKey="pe" stroke={PE_LINE} strokeWidth={1} fill={PE_LINE} fillOpacity={0.15} isAnimationActive={false} />
              </AreaChart>
            </Brush>
          </ComposedChart>
        </ResponsiveContainer>
        {/* Formula caption — how the current multiple is composed */}
        {peHeadline && peHeadline.peLive != null && (
          <div className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
            P/E {peHeadline.peLive.toFixed(1)}× = ${peHeadline.price.toFixed(2)} close ÷ ${peHeadline.eps != null ? peHeadline.eps.toFixed(2) : '—'} TTM EPS
            {peHeadline.avg1y != null && <> · 1Y avg {peHeadline.avg1y.toFixed(1)}×</>}
            {` · median ${peStats.median.toFixed(1)}×`}
          </div>
        )}
        </>
      ) : (
      <ResponsiveContainer width="100%" height={narrow ? 340 : 420}>
        <ComposedChart data={data} margin={{ top: 8, right: narrow ? 4 : 16, left: narrow ? 0 : 8, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
          <XAxis
            dataKey="date"
            scale="band"
            tickFormatter={formatXTick}
            minTickGap={40}
            tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
            className="text-gray-500 dark:text-gray-500"
            tickLine={false}
            axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
          />
          <YAxis
            domain={yDomain}
            orientation="right"
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
            className="text-gray-500 dark:text-gray-500"
            tickLine={false}
            axisLine={false}
            width={narrow ? 40 : 52}
          />
          <Tooltip
            content={<CandleTooltip />}
            cursor={{ fill: 'rgba(148,163,184,0.12)' }}
            isAnimationActive={false}
          />
          {/* Visible candles + volume drawn as a custom shape inside Bar */}
          <Bar 
            dataKey="c" 
            isAnimationActive={false} 
            shape={(props: any) => {
              const { x, width, payload } = props;
              const d = payload as ChartPoint;
              
              if (!d || x == null) return null;
              
              // Calculate Y coordinates manually since Recharts 3 Bar shape only gives y for dataKey
              const [minY, maxY] = yDomain;
              const range = maxY - minY;
              const top = 8;
              const plotHeight = (narrow ? 340 : 420) - 8 - 4; // height - top - bottom
              
              const getY = (val: number) => {
                if (range === 0) return top + plotHeight / 2;
                return top + plotHeight * (1 - (val - minY) / range);
              };
              
              const cx = x + width / 2;
              const up = d.c >= d.o;
              const color = up ? UP : DOWN;
              
              const yHigh = getY(d.h);
              const yLow = getY(d.l);
              const yOpen = getY(d.o);
              const yClose = getY(d.c);
              const bodyTop = Math.min(yOpen, yClose);
              const bodyH = Math.max(1, Math.abs(yClose - yOpen));
              
              // Volume bar — strip height matches the domain extension below
              // the lowest price, so candles never overlap the volume zone
              const volTop = top + plotHeight * (1 - volFrac);
              const yBottom = top + plotHeight;
              const vH = maxVolume > 0 ? ((d.v || 0) / maxVolume) * (yBottom - volTop) : 0;
              
              // Bar width clamp
              const bodyW = Math.max(1, Math.min(width * 0.7, 14));
              const spike = inds.has('volspike') && d.volSpike;

              return (
                <g key={d.t}>
                  {/* volume */}
                  <rect
                    x={cx - bodyW / 2}
                    y={yBottom - vH}
                    width={bodyW}
                    height={vH}
                    fill={spike ? VOL_SPIKE : color}
                    opacity={spike ? 0.55 : 0.18}
                  />
                  {/* wick */}
                  <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
                  {/* body */}
                  <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
                </g>
              );
            }}
          />
          {/* Moving averages — values precomputed on the full candle series */}
          {inds.has('ma20') && (
            <Line type="monotone" dataKey="sma20" stroke={MA20} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          )}
          {inds.has('ma50') && (
            <Line type="monotone" dataKey="sma50" stroke={MA50} strokeWidth={2} dot={false} isAnimationActive={false} />
          )}
          {inds.has('ma200') && (
            <Line type="monotone" dataKey="sma200" stroke={MA200} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          )}
          {/* Median-P/E fair value: stepAfter renders earnings updates as
              honest steps; dots mark the week a new TTM EPS arrived */}
          {inds.has('pefair') && (
            <Line
              type="stepAfter"
              dataKey="peFair"
              stroke={PE_FAIR}
              strokeWidth={1.5}
              isAnimationActive={false}
              connectNulls={false}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (cx == null || cy == null || !payload?.epsChanged || payload?.peFair == null) {
                  return <g key={payload?.t ?? cx ?? 0} />;
                }
                return (
                  <circle
                    key={payload.t}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill={PE_FAIR}
                    stroke="#fff"
                    strokeWidth={1.2}
                  />
                );
              }}
            />
          )}
          {/* Trailing 52-week high/low reference levels */}
          {inds.has('w52') && hiLo52 && (
            <>
              <ReferenceLine
                y={hiLo52.hi}
                stroke={REF52}
                strokeDasharray="6 4"
                label={{ value: `52W High $${hiLo52.hi.toFixed(2)}`, position: 'insideBottomLeft', fontSize: 10, fill: REF52 }}
              />
              <ReferenceLine
                y={hiLo52.lo}
                stroke={REF52}
                strokeDasharray="6 4"
                label={{ value: `52W Low $${hiLo52.lo.toFixed(2)}`, position: 'insideTopLeft', fontSize: 10, fill: REF52 }}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
      )}

      {/* "How far from fair" — premium/discount vs median-P/E fair value */}
      {mode === 'price' && fairPremium && (
        <div className="mt-2 text-xs flex items-center gap-1.5 flex-wrap">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PE_FAIR }} />
          <span className="tabular-nums font-medium" style={{ color: fairPremium.pct <= 0 ? UP : DOWN }}>
            {fairPremium.pct >= 0 ? '+' : ''}{fairPremium.pct.toFixed(0)}%
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            vs median P/E fair value ${fairPremium.fair.toFixed(0)}
          </span>
        </div>
      )}

      {/* "How stretched vs trend" — one line, only for enabled MAs */}
      {mode === 'price' && maDistances && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 flex-wrap">
          {maDistances.map((d) => (
            <span key={d.label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="tabular-nums font-medium text-gray-700 dark:text-gray-300">
                {d.pct >= 0 ? '+' : ''}{d.pct.toFixed(1)}%
              </span>
              {d.pct >= 0 ? 'above' : 'below'} {d.label} MA
            </span>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-snug text-gray-400 dark:text-gray-500">
        Historical prices are adjusted for splits and dividends.
        {mode === 'price' && inds.has('pefair') && peStats && (
          <>
            {' '}Fair value = TTM EPS × {peStats.median.toFixed(1)}× median P/E
            ({Math.max(1, Math.round(peStats.n / 252))}Y history). Steps and dots mark earnings
            updates — fair value changes with reported earnings, not with the market price.
            Illustrative valuation, not a price target.
          </>
        )}
        {mode === 'pe' && peStats && (
          <>
            {' '}Actual TTM P/E vs its own {Math.max(1, Math.round(peStats.n / 252))}Y median
            ({peStats.median.toFixed(1)}×); shaded band = 25th–75th percentile. Gaps mark periods
            with negative or unavailable earnings.
          </>
        )}
      </p>
    </div>
  );
}

export default PriceCandlestickChart;
