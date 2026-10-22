'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  Line,
  Cell,
  Area,
  ReferenceLine,
  ReferenceDot,
  Brush,
  AreaChart,
} from 'recharts';
import { CHART_FONT } from '@/components/charts/chartTheme';
import { event as gaEvent } from '@/lib/ga';
import { Ruler, TrendingUp, Eraser, Minus, Square, ArrowUpRight, Percent, Save, Check, CloudOff } from 'lucide-react';
import { useSession, signIn } from 'next-auth/react';
import { ChartDrawLayer, loadDrawings, saveDrawings, type Drawing, type DrawTool } from './chart/ChartDrawTools';
import { useTickerNavMode } from '@/components/company/analysis/useTickerNavMode';
import type { NavDimension, NavNeighbor, TickerNav } from '@/lib/analysis/tickerNav';

interface Candle {
  t: number; // timestamp (ms)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  pe?: number | null; // TTM P/E on the candle's close day
  ps?: number | null; // TTM P/S
  pb?: number | null; // price ÷ book value/share
  evEbit?: number | null; // EV ÷ TTM EBIT
  fcfYield?: number | null; // TTM FCF ÷ market cap — decimal, may be negative
  mcap?: number | null; // market cap at this close (USD)
  /** Realized NTM P/E — close ÷ EPS of the four quarters reported after this
   *  week. Not a historical consensus: uses earnings unknowable at the time.
   *  Ends ~3–4 quarters before today. */
  peFwd?: number | null;
  /** Finnhub consensus forward P/E snapshot stored that day — exists only
   *  since collection started, never fabricated backward. */
  peCons?: number | null;
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
  /** [p25, p75] band for the active valuation-metric view */
  band?: [number, number];
  volSpike?: boolean;
  /** Bollinger Bands (20, 2σ) on weekly closes */
  bbUp?: number | null;
  bbLo?: number | null;
  /** Oscillators on weekly closes (pane below the chart) */
  rsi14?: number | null;
  macdL?: number | null; // MACD line = EMA12 − EMA26
  macdS?: number | null; // signal = EMA9 of MACD line
  macdH?: number | null; // histogram = line − signal
  /** Benchmark overlay — raw weekly close of the benchmark (SPY/QQQ/XLF) */
  bm?: number | null;
  /** % change of the ticker's close since the visible window's first close */
  chgPct?: number | null;
  /** % change of the benchmark since the window's first benchmark value */
  bmPct?: number | null;
  /** Compare mode: ticker % split by position vs benchmark (green/red line) */
  chgUp?: number | null;
  chgDn?: number | null;
  /** Divergence bands — [lo, hi] range-area tuples; green ahead, red behind */
  bandG?: [number, number] | null;
  bandR?: [number, number] | null;
}

// ── Valuation metrics ───────────────────────────────────────────────────────
type MetricKey = 'pe' | 'peFwd' | 'ps' | 'pb' | 'evEbit' | 'fcfYield';
type MetricField = 'pe' | 'peFwd' | 'ps' | 'pb' | 'evEbit' | 'fcfYield';

interface MetricDef {
  label: string;
  /** Tooltip/caption name for the drawn series — P/E NTM's line is realized
      history ("what the market paid for the next four quarters"), not the
      consensus estimate, and must never be labelled plain "Fwd P/E". */
  seriesLabel?: string;
  /** unit suffix — '×' multiples, '%' yields (stored as decimal, ×100 shown) */
  unit: '×' | '%';
  field: MetricField;
  /** lower multiple = cheaper → falling change badge is green. FCF yield
      inverts this (higher yield = cheaper). */
  lowerIsBetter: boolean;
  /** negative values are real signal (negative FCF) — others are null-stored */
  allowNegative: boolean;
  formula: string;
  gapNote: string;
  /** Optional plain-English "why this metric exists" — rendered in the
      bottom caption, after the formula/gap note. */
  explain?: string;
}

const METRICS: MetricDef[] = [
  { label: 'P/E', unit: '×', field: 'pe', lowerIsBetter: true, allowNegative: false,
    formula: 'close ÷ TTM EPS', gapNote: 'Gaps mark periods with negative or unavailable earnings.' },
  { label: 'P/E NTM', unit: '×', field: 'peFwd', lowerIsBetter: true, allowNegative: false,
    seriesLabel: 'NTM P/E (realized)',
    formula: 'close ÷ EPS of the next 4 reported quarters (realized — not a historical estimate)',
    gapNote: 'The realized series ends ~3–4 quarters before today — later earnings are not reported yet; the amber dot is today\'s Finnhub consensus.',
    explain: 'Every point prices the four quarters that actually arrived — earnings no analyst had seen yet. When realized NTM P/E sat low while the trailing P/E looked rich, the market had already paid for profits that later showed up. Judge today\'s amber consensus dot against this history.' },
  { label: 'P/S', unit: '×', field: 'ps', lowerIsBetter: true, allowNegative: false,
    formula: 'close ÷ TTM revenue/share', gapNote: 'Gaps mark periods with missing revenue data.' },
  { label: 'P/B', unit: '×', field: 'pb', lowerIsBetter: true, allowNegative: false,
    formula: 'close ÷ book value/share', gapNote: 'Gaps mark periods with missing or negative equity.' },
  { label: 'EV/EBIT', unit: '×', field: 'evEbit', lowerIsBetter: true, allowNegative: false,
    formula: 'enterprise value ÷ TTM EBIT', gapNote: 'Gaps mark periods with negative or unavailable EBIT.' },
  { label: 'FCF yield', unit: '%', field: 'fcfYield', lowerIsBetter: false, allowNegative: true,
    formula: 'TTM FCF ÷ market cap', gapNote: 'Dips below zero mark negative-FCF periods.' },
];

const METRIC_BY_KEY = Object.fromEntries(METRICS.map(m => [m.field, m])) as Record<MetricField, MetricDef>;

interface MetricStats { median: number; p25: number; p75: number; n: number }

/** Format a metric value in display units (× multiple or % yield). */
function fmtMetric(v: number, unit: '×' | '%', digits = 1): string {
  return unit === '%' ? `${(v * 100).toFixed(digits)}%` : `${v.toFixed(digits)}×`;
}

/** Implied per-share denominator for price-linear multiples (EPS, rev/share,
    book/share): close ÷ multiple. */
function impliedPerShare(p: ChartPoint, field: MetricField): number | null {
  const v = p[field];
  return v != null && v > 0 && p.c > 0 ? p.c / v : null;
}

interface PriceCandlestickChartProps {
  ticker: string;
  /** Displayed next to the ticker in the chart's nav strip so the charted
   *  company is unambiguous. */
  companyName?: string | null;
  /** Prev/next neighbors from getTickerNav — feeds the in-chart ticker
   *  slider (same ordering and mode as the page-top navigator). */
  nav?: TickerNav | null;
  /** Live/current quote to unify the header price with the page hero.
   *  When provided it overrides the latest-candle close (which may be stale
   *  or split-adjusted); the candle close stays visible as a dated reference. */
  currentPrice?: number | null;
  currentChangePct?: number | null;
  changeLabel?: string;
  /** Reports the active benchmark label while compare view is on (null when
   *  off) so the section header can swap its subtitle. */
  onCompareChange?: (label: string | null) => void;
}

type PeriodLabel = '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'All';

const UP = '#16a34a'; // green
const DOWN = '#dc2626'; // red
const FWD_CONS = '#d97706'; // amber — consensus forward P/E marker
const MA20 = '#2563eb'; // blue
const MA50 = '#7c3aed'; // violet
const MA200 = '#0891b2'; // teal — 200-day ≈ 40 weekly bars
const PE_FAIR = '#db2777'; // pink — price-at-median-P/E overlay
const PE_LINE = '#4f46e5'; // indigo — P/E-multiple view
const VOL_SPIKE = '#d97706'; // amber — volume ≫ its own norm
const REF52 = '#64748b'; // slate-500 — 52W hi/lo lines (400 was too light on white)
const BM_LINE = '#78716c'; // stone-500 — benchmark compare line (dashed, neutral)

// Monday-anchored week keys — must match the bucketing in the candles route
// and /api/indices/weekly so benchmark closes join to the right candle.
const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_MONDAY_OFFSET = 4 * 24 * 60 * 60 * 1000;
const weekKeyOf = (t: number) => Math.floor((t - MS_MONDAY_OFFSET) / MS_WEEK);

// User-togglable indicator set; persisted per-browser, default off.
const IND_KEY = 'pmp:pricechart:indicators';
// Chart view (price vs valuation mode, metric, period) persisted per-browser
// so the ticker slider keeps the same lens when the page navigates — and a
// hard reload lands back on the last view too.
const VIEW_KEY = 'pmp:pricechart:view';
const PERIOD_LABELS: PeriodLabel[] = ['3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'All'];
type IndKey = 'ma20' | 'ma50' | 'ma200' | 'pefair' | 'w52' | 'volspike' | 'bb' | 'rsi' | 'macd';
type ModeKey = 'price' | 'pe';
// Draw-tool labels for the armed toolbar button + under-chart hint.
const TOOL_LABEL: Record<string, string> = {
  measure: '📐 Measure', trend: '╱ Trend', ray: '➚ Ray',
  hline: '― Level', zone: '▦ Zone', fibo: 'ƒ Fibo',
};
const TOOL_HINT: Record<string, string> = {
  measure: 'Drag to measure a move',
  trend: 'Drag to draw a segment between two points',
  ray: 'Drag to draw a ray — extends forward only',
  hline: 'Click to place the price level',
  zone: 'Drag a rectangle to mark a zone',
  fibo: 'Drag from swing low to swing high',
};
const BB_COLOR = '#94a3b8';   // slate — quiet band behind the price
const RSI_COLOR = '#8b5cf6';  // violet
const MACD_COLOR = '#0ea5e9'; // sky
const INDICATORS: { key: IndKey; label: string; color: string }[] = [
  { key: 'ma20', label: 'MA 20w', color: MA20 },
  { key: 'ma50', label: 'MA 50w', color: MA50 },
  { key: 'ma200', label: 'MA 200d', color: MA200 },
  { key: 'bb', label: 'Bollinger', color: BB_COLOR },
  { key: 'pefair', label: 'Med P/E', color: PE_FAIR },
  { key: 'w52', label: '52W hi/lo', color: REF52 },
  { key: 'volspike', label: 'Vol spike', color: VOL_SPIKE },
  { key: 'rsi', label: 'RSI 14', color: RSI_COLOR },
  { key: 'macd', label: 'MACD', color: MACD_COLOR },
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

// Rolling stdev of window n (population) — for Bollinger Bands.
function rollingStd(vals: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(vals.length).fill(null);
  let sum = 0, sq = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i]!; sq += vals[i]! * vals[i]!;
    if (i >= n) { const o = vals[i - n]!; sum -= o; sq -= o * o; }
    if (i >= n - 1) {
      const m = sum / n;
      out[i] = Math.sqrt(Math.max(0, sq / n - m * m));
    }
  }
  return out;
}

// Exponential MA — seeded with the first value (TradingView-style seeding
// would use an SMA, but the tail difference is negligible at 260+ bars).
function ema(vals: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(vals.length).fill(null);
  const k = 2 / (n + 1);
  let e = 0;
  for (let i = 0; i < vals.length; i++) {
    e = i === 0 ? vals[i]! : vals[i]! * k + e * (1 - k);
    if (i >= n - 1) out[i] = e;
  }
  return out;
}

// Wilder RSI(14) — avgGain/avgLoss seeded with SMA of first n changes.
function rsi(vals: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(vals.length).fill(null);
  if (vals.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const ch = vals[i]! - vals[i - 1]!;
    if (ch > 0) g += ch; else l -= ch;
  }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < vals.length; i++) {
    const ch = vals[i]! - vals[i - 1]!;
    g = (g * (n - 1) + Math.max(0, ch)) / n;
    l = (l * (n - 1) + Math.max(0, -ch)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
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

// Compare-mode line-end tag — a subtle ticker/symbol label rendered right at
// the line's last point so the eye doesn't have to travel to the legend.
// `dy` offsets ticker labels above the line and benchmark labels below it,
// which keeps the two tags apart when the endpoints run close together.
function lineEndTag(text: string, color: string, endIdx: number, dy: number) {
  return function LineEndTag(props: any) {
    if (props.index !== endIdx || props.value == null || props.x == null || props.y == null) return null;
    return (
      <text
        x={props.x + 6}
        y={props.y + dy}
        fontSize={10}
        fontWeight={700}
        fill={color}
        stroke="none"
        style={{ pointerEvents: 'none' }}
      >
        {text}
      </text>
    );
  };
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────

// Valuation-metric view tooltip — the multiple itself vs its own
// distribution. Denominator row shows what the multiple is composed of
// (implied per-share value for price ratios, totals for EV/FCF metrics).
function MetricTooltip({ active, payload, metric, stats }: any) {
  if (!active || !payload?.length) return null;
  const p: ChartPoint = payload[0].payload;
  if (!p) return null;
  const m: MetricDef = METRIC_BY_KEY[metric as MetricField];
  const raw = p[m.field];
  const val = raw != null && (m.allowNegative || raw > 0) ? raw : null;
  const ps = val != null ? impliedPerShare(p, m.field) : null;

  // What's in the denominator of each metric — price-per-share multiples
  // show the implied per-share figure; EV/FCF metrics show the dollar base.
  const denomRows: { label: string; text: string }[] = [];
  if (val != null) {
    if (metric === 'pe' && ps != null) denomRows.push({ label: 'TTM EPS', text: `$${ps.toFixed(2)}` });
    if (metric === 'peFwd' && ps != null) denomRows.push({ label: 'NTM EPS', text: `$${ps.toFixed(2)} (realized)` });
    if (metric === 'ps' && ps != null) denomRows.push({ label: 'TTM rev/sh', text: `$${ps.toFixed(2)}` });
    if (metric === 'pb' && ps != null) denomRows.push({ label: 'Book/sh', text: `$${ps.toFixed(2)}` });
    if (metric === 'evEbit' && p.mcap != null) denomRows.push({ label: 'Mkt cap', text: `$${fmtVol(p.mcap)}` });
    if (metric === 'fcfYield' && p.mcap != null) denomRows.push({ label: 'TTM FCF', text: `$${fmtVol(val * p.mcap)}` });
  }
  // Stored consensus snapshot on this day (only exists since collection
  // started) — shown alongside, never as, the realized value.
  const cons = metric === 'peFwd' && p.peCons != null && p.peCons > 0 ? p.peCons : null;
  const seriesLabel = m.seriesLabel ?? m.label;

  const betterVsMedian = val != null && stats
    ? (m.lowerIsBetter ? val <= stats.median : val >= stats.median)
    : null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-xs min-w-[170px]">
      <div className="text-gray-500 dark:text-gray-400 mb-2 font-medium">
        {new Date(p.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
        {val != null ? (
          <>
            <span style={{ color: PE_LINE }}>{seriesLabel}</span>
            <span className="text-right font-semibold text-gray-900 dark:text-white">{fmtMetric(val, m.unit)}</span>
          </>
        ) : (
          <>
            <span className="text-gray-500 dark:text-gray-400">{seriesLabel}</span>
            <span className="text-right text-gray-400 dark:text-gray-500">n/m</span>
          </>
        )}
        {cons != null && (
          <>
            <span style={{ color: FWD_CONS }}>Consensus fwd P/E</span>
            <span className="text-right font-medium" style={{ color: FWD_CONS }}>{fmtMetric(cons, '×')}</span>
          </>
        )}
        {denomRows.map(r => (
          <React.Fragment key={r.label}>
            <span className="text-gray-500 dark:text-gray-400">{r.label}</span>
            <span className="text-right text-gray-700 dark:text-gray-300">{r.text}</span>
          </React.Fragment>
        ))}
        {val != null && stats && (
          <>
            <span className="text-gray-500 dark:text-gray-400">vs median</span>
            <span className="text-right" style={{ color: betterVsMedian ? UP : DOWN }}>
              {((val - stats.median) / Math.abs(stats.median)) * 100 >= 0 ? '+' : ''}
              {(((val - stats.median) / Math.abs(stats.median)) * 100).toFixed(0)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}


const NAV_ARROW_CLS =
  'inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-800 dark:hover:text-gray-100 transition-colors';

/** Prev/next stepper for the in-chart ticker slider — routes to the
 *  neighbor's analysis page with scroll preserved (scroll={false}), so the
 *  chart stays in view and "slides" to the neighbor's data. The persisted
 *  chart view (mode/metric/period) carries the same lens across the hop. */
function ChartNavArrow({ direction, neighbor, navMode, fromTicker }: {
  direction: 'previous' | 'next';
  neighbor: NavNeighbor | null;
  navMode: NavDimension;
  fromTicker: string;
}) {
  const arrow = direction === 'previous' ? '←' : '→';
  const word = direction === 'previous' ? 'Previous' : 'Next';
  if (!neighbor) {
    return (
      <span className={`${NAV_ARROW_CLS} opacity-30 cursor-not-allowed`} aria-disabled="true" title={`No ${word.toLowerCase()} stock`}>
        <span aria-hidden="true">{arrow}</span>
      </span>
    );
  }
  return (
    <Link
      href={`/analysis/${neighbor.symbol}?nav=${navMode}`}
      scroll={false}
      prefetch
      title={`${word} stock${neighbor.name ? ` — ${neighbor.name}` : ''}`}
      aria-label={`${word} stock: ${neighbor.symbol}`}
      onClick={() => gaEvent('stock_navigator_click', { ticker_from: fromTicker, ticker_to: neighbor.symbol, dimension: navMode, direction, location: 'chart' })}
      className={NAV_ARROW_CLS}
    >
      {direction === 'previous'
        ? <><span aria-hidden="true">{arrow}</span><span>{neighbor.symbol}</span></>
        : <><span>{neighbor.symbol}</span><span aria-hidden="true">{arrow}</span></>}
    </Link>
  );
}

export function PriceCandlestickChart({ ticker, companyName, nav, currentPrice, currentChangePct, changeLabel = 'day', onCompareChange }: PriceCandlestickChartProps) {
  // In-chart prev/next ticker slider — same dimension resolution as the
  // page-top navigator (shared ?nav= param + 'ticker-nav-mode' LS key).
  const { mode: navMode, result: navRes } = useTickerNavMode(nav);
  const [allCandles, setAllCandles] = useState<Candle[] | null>(null);
  const [valStats, setValStats] = useState<Partial<Record<MetricField, MetricStats>>>({});
  const [evNetDebt, setEvNetDebt] = useState<number | null>(null);
  // Today's Finnhub consensus forward P/E — rendered as a labelled dot at the
  // right edge of the P/E-NTM view (realized history can't reach "now").
  const [fwdPeNow, setFwdPeNow] = useState<number | null>(null);
  const [fwdPeAsOf, setFwdPeAsOf] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricField>('pe');
  const [mode, setMode] = useState<ModeKey>('price');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodLabel>('5Y');
  const [inds, setInds] = useState<Set<IndKey>>(new Set());
  // Compact toolbar menus — the secondary controls (metric select, overlay
  // toggles, benchmark compare) collapsed into dropdowns; exactly one open.
  const [openMenu, setOpenMenu] = useState<'metric' | 'overlays' | 'compare' | 'draw' | null>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!menuWrapRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);
  // Mode flip collapses any open menu — an invisible menu would still hover.
  useEffect(() => { setOpenMenu(null); }, [mode]);
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

  // Hydrate the last-used chart view (mode / metric / period) — soft-nav via
  // the ticker slider already keeps these states mounted, this covers hard
  // reloads and direct landings after a slider hop.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as { mode?: unknown; metric?: unknown; period?: unknown };
      if (v.mode === 'price' || v.mode === 'pe') setMode(v.mode);
      if (typeof v.metric === 'string' && v.metric in METRIC_BY_KEY) setMetric(v.metric as MetricField);
      if (typeof v.period === 'string' && (PERIOD_LABELS as string[]).includes(v.period)) setPeriod(v.period as PeriodLabel);
    } catch { /* ignore corrupt value */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ mode, metric, period })); } catch { /* private mode */ }
  }, [mode, metric, period]);

  const toggleInd = (k: IndKey) => {
    setInds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem(IND_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
    // `inds` from closure is pre-toggle — the new state is its negation.
    gaEvent('chart_indicator', { ind: k, state: inds.has(k) ? 'off' : 'on', ticker });
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
        // New payloads carry valuationStats; cached/old responses only have
        // peStats — degrade to just the P/E metric rather than nothing.
        setValStats(
          json.valuationStats ?? (json.peStats ? { pe: json.peStats } : {}),
        );
        setEvNetDebt(json.evNetDebt ?? null);
        setSectorEtf(json.sectorEtf ?? null);
        setSectorName(json.sector ?? null);
        setFwdPeNow(typeof json.fwdPeNow === 'number' && json.fwdPeNow > 0 ? json.fwdPeNow : null);
        setFwdPeAsOf(typeof json.fwdPeAsOf === 'string' ? json.fwdPeAsOf : null);
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

  // Price-mode "median P/E fair value" overlay still needs the P/E stats.
  const peStats = valStats.pe ?? null;
  const activeMetric: MetricDef = METRIC_BY_KEY[metric];
  const metricStats = valStats[metric] ?? null;
  // A ticker may lack a metric's history (e.g. no balance sheet → no P/B) —
  // fall back to P/E so the Valuation tab never opens on a dead chart. The
  // restored/persisted view can also land on 'pe' for a ticker with no
  // valuation data at all — snap back to Price instead of an empty plot.
  useEffect(() => {
    if (mode !== 'pe') return;
    if (!loading && !Object.keys(valStats).length) setMode('price');
    else if (!valStats[metric]) setMetric('pe');
  }, [mode, metric, valStats, loading]);

  // Enriched full series — sorting, SMAs, implied EPS and the valuation band
  // are computed over ALL candles once; the price-mode `data` window and the
  // P/E-mode brush window are slices of this.
  const enriched: ChartPoint[] = useMemo(() => {
    if (!allCandles) return [];
    // Sort the full series first — SMA must see consecutive candles.
    const sorted = [...allCandles].sort((a, b) => a.t - b.t);
    const closes = sorted.map((c) => c.c);
    const sma20 = rollingMean(closes, 20);
    const sma50 = rollingMean(closes, 50);
    // 40 weekly bars ≈ the 200-day average investors actually mean by SMA200
    const sma200 = rollingMean(closes, 40);
    const volSma = rollingMean(sorted.map((c) => c.v || 0), 20);
    // Bollinger (20, 2σ) + RSI14 + MACD(12,26,9) on weekly closes — computed
    // on the full series so window edges don't reset the warmup.
    const std20 = rollingStd(closes, 20);
    const rsiArr = rsi(closes, 14);
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdRaw: (number | null)[] = closes.map((_, i) =>
      ema12[i] != null && ema26[i] != null ? ema12[i]! - ema26[i]! : null);
    const firstMacd = macdRaw.findIndex((v) => v != null);
    const macdTail = firstMacd >= 0 ? ema(macdRaw.slice(firstMacd).map((v) => v!), 9) : [];
    const macdSig: (number | null)[] = new Array(closes.length).fill(null);
    for (let i = 0; i < macdTail.length; i++) macdSig[firstMacd + i] = macdTail[i] ?? null;
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
        bbUp: sma20[i] != null && std20[i] != null ? sma20[i]! + 2 * std20[i]! : null,
        bbLo: sma20[i] != null && std20[i] != null ? sma20[i]! - 2 * std20[i]! : null,
        rsi14: rsiArr[i] ?? null,
        macdL: macdRaw[i] ?? null,
        macdS: macdSig[i] ?? null,
        macdH: macdRaw[i] != null && macdSig[i] != null ? macdRaw[i]! - macdSig[i]! : null,
      });
    }
    // Valuation layer — median-P/E fair value. Stats come from the API
    // computed over the FULL valuation series: the timeframe switch changes
    // only what is displayed, never the valuation methodology.
    const medPe = peStats?.median ?? null;
    for (const p of out) {
      if (inds.has('pefair') && medPe != null) {
        // Fair value = TTM EPS × median P/E — independent of market price;
        // it legitimately steps only when new financial statements land.
        p.peFair = p.eps != null ? p.eps * medPe : null;
      }
    }
    return out;
  }, [allCandles, inds, peStats]);

  // Per-active-metric series — the p25–p75 band field is stamped only where
  // the metric has a value so the band breaks cleanly over coverage gaps.
  const metricSeries: ChartPoint[] = useMemo(() => {
    if (!metricStats) return enriched;
    const f = activeMetric.field;
    const band: [number, number] = [metricStats.p25, metricStats.p75];
    return enriched.map((p) =>
      p[f] != null && (activeMetric.allowNegative || (p[f] as number) > 0)
        ? { ...p, band }
        : p,
    );
  }, [enriched, metricStats, activeMetric]);

  const periodCutoffMs = useMemo(() => {
    const years = periodChoices.find((p) => p.label === activePeriod)?.years ?? 99;
    return Date.now() - years * 365.25 * 24 * 60 * 60 * 1000;
  }, [periodChoices, activePeriod]);

  // Benchmark compare (price mode): sector ETF comes from the candles
  // payload; SPY/QQQ are always offered. The weekly series is fetched lazily
  // from /api/indices/weekly on first toggle and cached per-symbol so a
  // re-toggle (or another ticker page) costs nothing.
  const [sectorEtf, setSectorEtf] = useState<string | null>(null);
  const [sectorName, setSectorName] = useState<string | null>(null);
  const [bmSym, setBmSym] = useState<string | null>(null);
  // Series carries its symbol — on a fast SPY→XLF switch the stale series
  // is ignored instead of briefly rendering under the wrong label.
  const [bmSeries, setBmSeries] = useState<{ sym: string; pts: { t: number; c: number }[] } | null>(null);
  const bmCache = useRef(new Map<string, { t: number; c: number }[]>());
  useEffect(() => setBmSym(null), [ticker]);
  useEffect(() => {
    if (!bmSym) { setBmSeries(null); return; }
    const hit = bmCache.current.get(bmSym);
    if (hit) { setBmSeries({ sym: bmSym, pts: hit }); return; }
    let live = true;
    fetch(`/api/indices/weekly?symbol=${bmSym}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        const pts: { t: number; c: number }[] = Array.isArray(j?.points) ? j.points : [];
        bmCache.current.set(bmSym, pts);
        if (live) setBmSeries({ sym: bmSym, pts });
      })
      .catch(() => { if (live) setBmSeries({ sym: bmSym, pts: [] }); });
    return () => { live = false; };
  }, [bmSym]);

  const benchmarkChoices = useMemo(() => {
    const out = [
      { sym: 'SPY', label: 'SPY', title: 'S&P 500 (ETF proxy)' },
      { sym: 'QQQ', label: 'QQQ', title: 'Nasdaq 100 (ETF proxy)' },
    ];
    if (sectorEtf && !out.some((o) => o.sym === sectorEtf)) {
      out.push({ sym: sectorEtf, label: sectorEtf, title: `${sectorName ?? 'Sector'} sector (ETF proxy)` });
    }
    return out;
  }, [sectorEtf, sectorName]);

  const bmLabel = benchmarkChoices.find((b) => b.sym === bmSym)?.label ?? bmSym ?? '';
  const bmActive = bmSym != null && bmSeries?.sym === bmSym && bmSeries.pts.length > 0;

  // Tell the section header which subtitle to show — compare view swaps
  // "Weekly Candlestick Chart" for "Relative Performance vs {symbol}".
  useEffect(() => {
    onCompareChange?.(bmActive ? bmLabel : null);
  }, [bmActive, bmLabel, onCompareChange]);

  // benchmark weekly close keyed by week — joins candles by weekKeyOf(t)
  const bmByWeek = useMemo(() => {
    const m = new Map<number, number>();
    if (bmActive && bmSeries) for (const p of bmSeries.pts) m.set(weekKeyOf(p.t), p.c);
    return m;
  }, [bmSeries, bmActive]);

  // Price-mode window — the P/E chart instead takes the full series and
  // windows it through the Brush navigator below the chart. When a benchmark
  // is active each candle carries % change from the window's first value for
  // both series (chgPct / bmPct) plus the split-line and band fields the
  // compare view draws on a shared % axis — a relative-performance
  // comparison over exactly the displayed range.
  const data: ChartPoint[] = useMemo(() => {
    const w = enriched.filter((p) => p.t >= periodCutoffMs);
    if (!bmByWeek.size || !w.length) return w;
    const firstC = w[0]!.c;
    let bmFirst: number | null = null;
    for (const p of w) {
      const b = bmByWeek.get(weekKeyOf(p.t));
      if (b != null && b > 0) { bmFirst = b; break; }
    }
    if (bmFirst == null || bmFirst <= 0 || firstC <= 0) return w;
    return w.map((p) => {
      const b = bmByWeek.get(weekKeyOf(p.t));
      const chg = (p.c / firstC - 1) * 100;
      const bmp = b != null ? (b / bmFirst - 1) * 100 : null;
      const above = bmp != null ? chg >= bmp : null;
      return {
        ...p,
        bm: b ?? null,
        chgPct: chg,
        bmPct: bmp,
        // Compare-mode split: the ticker line is drawn green where it leads
        // the benchmark and red where it lags; the bands fill the gap
        // between the two % series (null at crossings leaves a hairline
        // notch — honest, interpolation would invent data).
        chgUp: above === true ? chg : null,
        chgDn: above === false ? chg : null,
        bandG: above === true ? [bmp!, chg] : null,
        bandR: above === false ? [bmp!, chg] : null,
      };
    });
  }, [enriched, periodCutoffMs, bmByWeek]);

  // P/E-mode window. The Brush is UNCONTROLLED: its startIndex/endIndex props
  // are only initial values — the chart remounts via `key` on every period
  // click so a new window is applied. Drag indices are mirrored into peBrush
  // solely for the y-domain and the header label — they must NOT feed back
  // into the Brush props (a controlled loop races recharts' internal store
  // and can leave the displayed slice empty).
  const [peBrush, setPeBrush] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [peEpoch, setPeEpoch] = useState(0);
  useEffect(() => setPeBrush(null), [activePeriod, ticker]);

  // Drawing tools (XTB-style): measure boxes + trendlines pinned to
  // (date, price) coordinates, persisted per ticker in localStorage.
  const [drawTool, setDrawTool] = useState<DrawTool>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawDirty, setDrawDirty] = useState(false);
  const [drawSave, setDrawSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { data: session } = useSession();
  const loggedIn = !!session?.user;

  useEffect(() => {
    setDrawings(loadDrawings(ticker));
    setDrawTool(null);
    setDrawDirty(false);
  }, [ticker]);

  // Server set wins over the local draft — it survived sign-out/cache clears.
  // A non-empty server set replaces local; an empty one keeps local work and
  // marks it dirty so the next Save pushes it to the account.
  useEffect(() => {
    if (!loggedIn) return;
    let live = true;
    fetch(`/api/user/drawings?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !Array.isArray(j?.drawings)) return;
        if (j.drawings.length > 0) {
          setDrawings(j.drawings);
          saveDrawings(ticker, j.drawings);
          setDrawDirty(false);
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [ticker, loggedIn]);

  const markDirty = () => setDrawDirty(true);
  const addDrawing = (d: Drawing) => {
    setDrawings((prev) => { const next = [...prev, d]; saveDrawings(ticker, next); return next; });
    markDirty();
    setDrawTool(null); // single-shot: after drawing, handles appear for editing
  };
  const updateDrawing = (idx: number, d: Drawing) => {
    setDrawings((prev) => { const next = prev.map((x, j) => (j === idx ? d : x)); saveDrawings(ticker, next); return next; });
    markDirty();
  };
  const removeDrawing = (idx: number) => {
    setDrawings((prev) => { const next = prev.filter((_, j) => j !== idx); saveDrawings(ticker, next); return next; });
    markDirty();
  };
  const clearDrawings = () => { setDrawings([]); saveDrawings(ticker, []); markDirty(); };

  const saveToAccount = async () => {
    if (!loggedIn) { signIn('google'); return; }
    setDrawSave('saving');
    try {
      const r = await fetch('/api/user/drawings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticker, drawings }),
      });
      setDrawSave(r.ok ? 'saved' : 'error');
      if (r.ok) setDrawDirty(false);
    } catch { setDrawSave('error'); }
    setTimeout(() => setDrawSave((s) => (s === 'saved' ? 'idle' : s)), 2500);
  };
  // Esc disarms the active tool (and any in-progress draft is discarded by
  // the layer on pointer-up).
  useEffect(() => {
    if (!drawTool) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawTool(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [drawTool]);
  // Tools measure price — meaningless on the %-axis compare view and on the
  // valuation chart, so they stay armed only in plain price mode.
  const drawActive = mode === 'price' && !bmActive && drawTool != null;

  // Hovered candle index for the TradingView-style readout strip — the old
  // floating tooltip card covered candles and user drawings on hover.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Two-phase view swap (mode / metric / period): the chart wrapper fades
  // out for ~120ms, the change commits while invisible, then it fades back
  // in with a slight rise (.pmp-chart-swap / .pmp-fading in globals.css).
  // Brush drags bypass this — they write peBrush directly. Honored
  // prefers-reduced-motion: commits happen instantly with no fading at all.
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const animatedSet = (fn: () => void) => {
    if (reduceMotion) { fn(); return; }
    setFading(true);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => { fn(); setFading(false); }, 120);
  };
  useEffect(() => () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); }, []);

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
    () => metricSeries.slice(peWindow.startIndex, peWindow.endIndex + 1),
    [metricSeries, peWindow],
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

  // Valuation view: y-domain hugs the distribution, not extreme outliers.
  // Cap at ~q95 of visible values × 1.08 (always ≥ p75×1.6) so single-name
  // spikes can't flatten the median/band the user came to compare. FCF yield
  // may dip below zero (cash burn) — the floor follows the data, not zero.
  const peDomain = useMemo((): [number, number] => {
    if (!peVisible.length || !metricStats) return [0, 1];
    const f = activeMetric.field;
    const vals = peVisible
      .map((d) => d[f])
      .filter((v): v is number => v != null && Number.isFinite(v) && (activeMetric.allowNegative || v > 0))
      .sort((a, b) => a - b);
    if (!vals.length) return [0, 1];
    const q95 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))]!;
    const q05 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.05))]!;
    const lo = Math.min(0, q05 * 1.15);
    let hi = Math.max(q95 * 1.08, metricStats.p75 * 1.6);
    // The consensus dot must fit the P/E-NTM domain even when it lies beyond
    // the realized distribution.
    if (metric === 'peFwd' && fwdPeNow != null) hi = Math.max(hi, fwdPeNow * 1.06);
    // Yields are decimals (0.012) — round the domain to % fractions so
    // axis ticks land on whole percent-ish values.
    const round = activeMetric.unit === '%'
      ? (v: number) => Math.ceil(v * 200) / 200
      : Math.ceil;
    return [round(lo), Math.max(round(hi), lo + 0.001)];
  }, [peVisible, metricStats, activeMetric, metric, fwdPeNow]);

  // Valuation headline — current multiple scaled to the live quote when
  // available (exact for price-linear metrics and FCF yield; EV/EBIT uses
  // the stored net-debt leg), else the last stored value. Plus the change
  // over the visible window and context stats for the caption line.
  const peHeadline = useMemo(() => {
    if (!enriched.length) return null;
    const f = activeMetric.field;
    const last = enriched[enriched.length - 1]!;
    const lastVal = [...enriched].reverse().find(
      (p) => p[f] != null && (activeMetric.allowNegative || (p[f] as number) > 0),
    );
    const lastV = lastVal?.[f] ?? null;
    let live = lastV != null && lastV > 0 ? lastV : (activeMetric.allowNegative ? lastV : null);
    if (currentPrice != null && lastVal && lastV != null && lastVal.c > 0) {
      if (metric === 'fcfYield') {
        // yield = FCF ÷ mcap → scales inversely with price
        live = lastV * (lastVal.c / currentPrice);
      } else if (metric === 'evEbit' && lastVal.mcap != null && evNetDebt != null) {
        // EV = mcap + netDebt — only the mcap leg scales with price
        const ebitTTM = (lastVal.mcap + evNetDebt) / lastV;
        const shares = lastVal.mcap / lastVal.c;
        live = ebitTTM > 0 ? (currentPrice * shares + evNetDebt) / ebitTTM : null;
      } else if (metric !== 'evEbit') {
        // P/E, P/S, P/B — price-linear: multiple scales with the quote
        live = lastV * (currentPrice / lastVal.c);
      }
    }
    // P/E NTM: the headline is today's Finnhub CONSENSUS (the realized
    // series can't reach "now" — the last ~3–4 quarters aren't reported).
    // Falls back to the latest realized point when no snapshot exists.
    const headlineIsConsensus = metric === 'peFwd' && fwdPeNow != null;
    if (headlineIsConsensus) live = fwdPeNow;
    const firstVis = peVisible.find(
      (p) => p[f] != null && (activeMetric.allowNegative || (p[f] as number) > 0),
    );
    const base = firstVis?.[f] ?? null;
    const chgPct =
      live != null && base != null && base !== 0 ? (live / base - 1) * 100 : null;
    // Premium/discount vs the metric's own historical median — the headline
    // "is it expensive vs its own history" answer.
    const premVsMedian =
      live != null && metricStats?.median != null && metricStats.median !== 0
        ? ((live - metricStats.median) / Math.abs(metricStats.median)) * 100
        : null;
    // Trailing ~1Y mean of the weekly metric (52 weekly candles).
    const last52 = enriched
      .slice(-52)
      .map((p) => p[f])
      .filter((v): v is number => v != null && Number.isFinite(v) && (activeMetric.allowNegative || v > 0));
    const avg1y = last52.length ? last52.reduce((a, b) => a + b, 0) / last52.length : null;
    const price = currentPrice ?? last.c;
    // Implied per-share denominator for the formula caption (EPS, rev/sh, bv/sh)
    const perShare = lastVal ? impliedPerShare(lastVal, f) : null;
    return { peLive: live, chgPct, premVsMedian, eps: last.eps ?? null, avg1y, price, date: last.date, perShare, isConsensus: headlineIsConsensus, lastRealized: lastV };
  }, [enriched, peVisible, currentPrice, metric, activeMetric, evNetDebt, metricStats, fwdPeNow]);

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
    // Compare mode: the axis is % change, not price — candles/volume/MAs are
    // hidden, so only the two % series size the domain. Ticks round to 5pp
    // and no volume strip is reserved.
    if (bmActive) {
      let mn = Infinity, mx = -Infinity;
      for (const d of data) {
        for (const v of [d.chgPct, d.bmPct]) {
          if (v != null && Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
        }
      }
      if (!Number.isFinite(mn)) return { yDomain: [0, 1] as [number, number], volFrac: 0 };
      const pad = (mx - mn) * 0.08 || 2;
      return {
        yDomain: [Math.floor((mn - pad) / 5) * 5, Math.ceil((mx + pad) / 5) * 5] as [number, number],
        volFrac: 0,
      };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const d of data) {
      if (d.l < min) min = d.l;
      if (d.h > max) max = d.h;
      if (inds.has('ma20') && d.sma20 != null) { if (d.sma20 < min) min = d.sma20; if (d.sma20 > max) max = d.sma20; }
      if (inds.has('ma50') && d.sma50 != null) { if (d.sma50 < min) min = d.sma50; if (d.sma50 > max) max = d.sma50; }
      if (inds.has('ma200') && d.sma200 != null) { if (d.sma200 < min) min = d.sma200; if (d.sma200 > max) max = d.sma200; }
      if (inds.has('pefair') && d.peFair != null) { if (d.peFair < min) min = d.peFair; if (d.peFair > max) max = d.peFair; }
      if (inds.has('bb')) {
        if (d.bbUp != null && d.bbUp > max) max = d.bbUp;
        if (d.bbLo != null && d.bbLo < min) min = d.bbLo;
      }

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
  }, [data, inds, hiLo52, bmActive]);

  // Window-end delta for the compare legend under the chart:
  // "JPM +8.1% vs SPY +12.3% (−4.2pp)".
  const bmDelta = useMemo(() => {
    if (!bmActive || !data.length) return null;
    const last = [...data].reverse().find((d) => d.bmPct != null && d.chgPct != null);
    if (!last) return null;
    return { ticker: last.chgPct!, bm: last.bmPct!, label: bmLabel };
  }, [data, bmActive, bmLabel]);

  // Last index carrying each compare series — anchor for the end-of-line
  // ticker/benchmark tags (last *non-null* point survives holiday gaps).
  const cmpEndIdx = useMemo(() => {
    if (!bmActive || !data.length) return { tk: -1, bm: -1 };
    let tk = -1, bm = -1;
    for (let i = data.length - 1; i >= 0; i--) {
      if (tk < 0 && data[i]!.chgPct != null) tk = i;
      if (bm < 0 && data[i]!.bmPct != null) bm = i;
      if (tk >= 0 && bm >= 0) break;
    }
    return { tk, bm };
  }, [data, bmActive]);

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
      {/* Ticker slider + chart identity — step through the nav universe
          without leaving the chart context; the persisted view keeps the
          same metric across hops. Rendered even without neighbors so the
          charted company name + ticker are always visible. */}
      <div className="flex items-center gap-0.5 mb-2 -mt-1 min-w-0">
        {navRes && (
          <ChartNavArrow direction="previous" neighbor={navRes.prev} navMode={navMode} fromTicker={ticker} />
        )}
        <div className="min-w-0 flex items-baseline gap-1.5 px-1">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
            {companyName ?? ticker}
          </span>
          {companyName && companyName !== ticker && (
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 shrink-0">{ticker}</span>
          )}
        </div>
        {navRes && (
          <ChartNavArrow direction="next" neighbor={navRes.next} navMode={navMode} fromTicker={ticker} />
        )}
      </div>
      {/* Header: current price (price mode) or current metric (valuation
          mode) + toolbar. The header row itself never wraps — the headline
          may wrap internally (last-candle note drops under the number) and
          the toolbar anchors right with internal wrap — so switching modes
          never moves the toolbar between lines. */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-3 gap-2">
        {mode === 'pe' && peHeadline ? (
          <div key={metric} className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0 pmp-fade-up">
            <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              {peHeadline.peLive != null ? fmtMetric(peHeadline.peLive, activeMetric.unit) : 'n/m'}
            </span>
            {peHeadline.isConsensus && (
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ color: FWD_CONS, backgroundColor: 'rgba(217,119,6,0.12)' }}
                title={`Finnhub consensus forward P/E${fwdPeAsOf ? `, snapshot ${fwdPeAsOf}` : ''} — the realized series below uses earnings reported after each date`}
              >
                consensus
              </span>
            )}
            {peHeadline.premVsMedian != null && (
              <span
                className={`text-sm font-semibold ${(activeMetric.lowerIsBetter ? peHeadline.premVsMedian <= 0 : peHeadline.premVsMedian >= 0) ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                title={`${activeMetric.label} vs its own median over the stored history — ${activeMetric.lowerIsBetter ? 'above median = more expensive than usual' : 'above median = richer yield than usual'}`}
              >
                {peHeadline.premVsMedian >= 0 ? '+' : ''}{peHeadline.premVsMedian.toFixed(1)}% vs median
              </span>
            )}
            {peHeadline.peLive == null && (
              <span className="text-xs text-gray-500 dark:text-gray-400">not meaningful</span>
            )}
          </div>
        ) : stats && (
          <div key="price" className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0 pmp-fade-up">
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
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:justify-end sm:ml-auto">
          {/* View mode — Price chart vs P/E-multiple chart */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => animatedSet(() => { setMode('price'); gaEvent('chart_mode', { mode: 'price', ticker }); })}
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
              onClick={() => animatedSet(() => { setMode('pe'); gaEvent('chart_mode', { mode: 'valuation', ticker }); })}
              disabled={!Object.keys(valStats).length}
              title={Object.keys(valStats).length ? 'Valuation multiples vs their own historical median and quartile band' : 'Valuation history not available'}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === 'pe'
                  ? 'bg-white dark:bg-gray-900 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              style={mode === 'pe' ? { color: PE_LINE } : undefined}
            >
              Valuation
            </button>
          </div>
          {/* Secondary controls live in compact dropdown menus — one grid cell
              shared by the two modes keeps the slot at the wider variant's
              width, so the period buttons never shift when the view flips.
              The inactive side is invisible (still measured), not unmounted. */}
          <div className="grid" ref={menuWrapRef}>
            {/* Valuation mode: metric dropdown */}
            <div
              className={`col-start-1 row-start-1 relative flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5 ${
                mode === 'pe' ? '' : 'invisible'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === 'metric' ? null : 'metric'))}
                aria-haspopup="listbox"
                aria-expanded={openMenu === 'metric'}
                title="Valuation multiple to chart"
                className={`min-w-[96px] justify-between px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  openMenu === 'metric'
                    ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <span>{activeMetric.label}</span>
                <span className="text-[9px] opacity-60">{openMenu === 'metric' ? '▴' : '▾'}</span>
              </button>
              {openMenu === 'metric' && mode === 'pe' && (
                <div
                  role="listbox"
                  className="absolute left-0 top-full mt-1 z-50 min-w-[150px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1"
                >
                  {METRICS.map((m) => {
                    const has = !!valStats[m.field];
                    const active = metric === m.field;
                    return (
                      <button
                        key={m.field}
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={!has}
                        onClick={() => { setOpenMenu(null); animatedSet(() => { setMetric(m.field); gaEvent('chart_metric', { metric: m.field, ticker }); }); }}
                        title={has ? `${m.label} = ${m.formula}` : `${m.label} history not available`}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          active
                            ? 'text-gray-900 dark:text-white font-semibold'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span className="w-3 text-center">{active ? '✓' : ''}</span>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Price mode: overlay + compare dropdowns in one pill */}
            <div
              className={`col-start-1 row-start-1 items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5 transition-opacity ${
                mode === 'pe' ? 'invisible flex' : 'flex'
              }`}
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu((m) => (m === 'overlays' ? null : 'overlays'))}
                  aria-haspopup="true"
                  aria-expanded={openMenu === 'overlays'}
                  title="Chart overlays — moving averages, fair-value band, 52-week range"
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                    openMenu === 'overlays' || inds.size > 0
                      ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm'
                      : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  {/* Mini legend — colored dots of the active overlays */}
                  {inds.size > 0 && (
                    <span className="flex items-center -space-x-0.5">
                      {INDICATORS.filter((i) => inds.has(i.key)).map((i) => (
                        <span key={i.key} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i.color }} />
                      ))}
                    </span>
                  )}
                  Overlays
                  <span className="text-[9px] opacity-60">{openMenu === 'overlays' ? '▴' : '▾'}</span>
                </button>
                {openMenu === 'overlays' && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-1 z-50 min-w-[170px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1"
                  >
                    {INDICATORS.map((ind) => (
                      <button
                        key={ind.key}
                        type="button"
                        onClick={() => toggleInd(ind.key)}
                        title={
                          ind.key === 'volspike'
                            ? 'Highlight weeks with volume > 2× the 20-week average'
                            : ind.key === 'pefair'
                              ? 'TTM EPS × historical median P/E — steps mark earnings updates, not market moves'
                              : undefined
                        }
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          inds.has(ind.key)
                            ? 'text-gray-900 dark:text-white font-semibold'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: inds.has(ind.key) ? ind.color : 'rgba(148,163,184,0.4)' }}
                        />
                        {ind.label}
                        {inds.has(ind.key) && <span className="ml-auto text-[10px]">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {benchmarkChoices.length > 0 && (
                <>
                  <span className="w-px h-5 bg-gray-300 dark:bg-gray-500 mx-1.5" />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu((m) => (m === 'compare' ? null : 'compare'))}
                      aria-haspopup="listbox"
                      aria-expanded={openMenu === 'compare'}
                      title={
                        bmSym
                          ? `Comparing vs ${bmLabel} — open to change or exit`
                          : 'Compare vs a benchmark index/ETF'
                      }
                      className={`min-w-[84px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 justify-between ${
                        openMenu === 'compare' || bmSym
                          ? 'bg-white dark:bg-gray-900 shadow-sm'
                          : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                      style={bmSym ? { color: BM_LINE } : undefined}
                    >
                      <span>⇄ {bmSym ? bmLabel : 'Compare'}</span>
                      <span className="text-[9px] opacity-60">{openMenu === 'compare' ? '▴' : '▾'}</span>
                    </button>
                    {openMenu === 'compare' && (
                      <div
                        role="listbox"
                        className="absolute right-0 top-full mt-1 z-50 min-w-[150px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1"
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={bmSym == null}
                          onClick={() => {
                            setOpenMenu(null);
                            if (bmSym) animatedSet(() => { setBmSym(null); gaEvent('chart_compare', { symbol: bmSym, state: 'off', ticker }); });
                          }}
                          className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            bmSym == null ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          <span className="w-3 text-center">{bmSym == null ? '✓' : ''}</span>
                          Candles only
                        </button>
                        {benchmarkChoices.map((b) => (
                          <button
                            key={b.sym}
                            type="button"
                            role="option"
                            aria-selected={bmSym === b.sym}
                            onClick={() => {
                              setOpenMenu(null);
                              if (bmSym !== b.sym) {
                                animatedSet(() => { setBmSym(b.sym); gaEvent('chart_compare', { symbol: b.sym, state: 'on', ticker }); });
                              }
                            }}
                            title={`${b.title} — relative performance chart, rebased to the range start`}
                            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                              bmSym === b.sym ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            <span className="w-3 text-center">{bmSym === b.sym ? '✓' : ''}</span>
                            {b.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              <span className="w-px h-5 bg-gray-300 dark:bg-gray-500 mx-1.5" />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu((m) => (m === 'draw' ? null : 'draw'))}
                  aria-haspopup="true"
                  aria-expanded={openMenu === 'draw'}
                  disabled={bmActive}
                  title={
                    bmActive
                      ? 'Drawing tools work on the price chart (exit Compare first)'
                      : 'Drawing tools — drag on the chart to measure moves or draw trendlines'
                  }
                  className={`min-w-[72px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 justify-between disabled:opacity-40 disabled:cursor-not-allowed ${
                    openMenu === 'draw' || drawTool
                      ? 'bg-white dark:bg-gray-900 shadow-sm'
                      : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                  style={drawTool ? { color: '#8b5cf6' } : undefined}
                >
                  <span>{drawTool ? (TOOL_LABEL[drawTool] ?? 'Draw') : 'Draw'}</span>
                  <span className="text-[9px] opacity-60">{openMenu === 'draw' ? '▴' : '▾'}</span>
                </button>
                {openMenu === 'draw' && !bmActive && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 z-50 min-w-[190px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1"
                  >
                    {([
                      ['measure', 'Measure move', 'Drag between two points — Δ%, Δ$, bar count', <Ruler key="r" size={13} />],
                      ['trend', 'Trendline', 'Segment between two points', <TrendingUp key="t" size={13} />],
                      ['ray', 'Ray', 'Drag — extends only forward', <ArrowUpRight key="a" size={13} />],
                      ['hline', 'Horizontal level', 'Click to place a price level', <Minus key="h" size={13} />],
                      ['zone', 'Zone', 'Drag a rectangle — support/resistance area', <Square key="z" size={13} />],
                      ['fibo', 'Fib retracement', 'Drag swing-to-swing — auto levels', <Percent key="f" size={13} />],
                    ] as [DrawTool & string, string, string, React.ReactNode][]).map(([k, label, hint, icon]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setOpenMenu(null); setDrawTool(drawTool === k ? null : k); gaEvent('chart_draw', { tool: k, ticker }); }}
                        className={`flex items-start gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          drawTool === k ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0">{icon}</span>
                        <span>
                          {label}
                          <span className="block text-[10px] opacity-70 font-normal">{hint}</span>
                        </span>
                        {drawTool === k && <span className="ml-auto text-[10px]">✓</span>}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-gray-100 dark:bg-gray-700" />
                    <button
                      type="button"
                      onClick={() => { setOpenMenu(null); setDrawTool(null); clearDrawings(); }}
                      disabled={!drawings.length}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Eraser size={13} className="shrink-0" />
                      Clear drawings{drawings.length ? ` (${drawings.length})` : ''}
                    </button>
                  </div>
                )}
              </div>
              {/* Save — localStorage keeps drawings across refresh for everyone;
                  this additionally persists them to the signed-in account
                  (cross-device, survives cache clears). Logged-out click opens
                  the Google sign-in flow. */}
              {(drawings.length > 0 || drawSave === 'saved') && (
                <button
                  type="button"
                  onClick={saveToAccount}
                  disabled={drawSave === 'saving'}
                  title={loggedIn
                    ? 'Save drawings to your account'
                    : 'Sign in to save drawings to your account'}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50 ${
                    drawSave === 'saved'
                      ? 'bg-white dark:bg-gray-900 shadow-sm text-emerald-600 dark:text-emerald-400'
                      : drawDirty
                        ? 'bg-white dark:bg-gray-900 shadow-sm text-violet-600 dark:text-violet-400'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  {drawSave === 'saved' ? <Check size={12} /> : drawSave === 'error' ? <CloudOff size={12} /> : <Save size={12} />}
                  <span>{drawSave === 'saving' ? 'Saving…' : drawSave === 'saved' ? 'Saved' : drawSave === 'error' ? 'Retry' : 'Save'}</span>
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5 gap-0.5">
            {periodChoices.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => animatedSet(() => { setPeriod(p.label); setPeBrush(null); setPeEpoch((e) => e + 1); gaEvent('chart_period', { period: p.label, ticker }); })}
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

      <div className={`pmp-chart-swap relative${fading ? ' pmp-fading' : ''}`}>
      {mode === 'pe' && metricStats ? (
        <>
        <ResponsiveContainer width="100%" height={narrow ? 400 : 470}>
          <ComposedChart key={`pe-${ticker}-${metric}-${peEpoch}`} data={metricSeries} margin={{ top: 8, right: narrow ? 4 : 16, left: narrow ? 0 : 8, bottom: 4 }}>
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
              tickFormatter={(v: number) => fmtMetric(v, activeMetric.unit, 0)}
              tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-500"
              tickLine={false}
              axisLine={false}
              width={narrow ? 40 : 52}
            />
            <Tooltip content={<MetricTooltip metric={metric} stats={metricStats} />} isAnimationActive={false} />
            {/* 25th–75th percentile band — the stock's own normal range.
                activeDot off: a range area renders two hover dots (band
                edges); only the metric's own dot should appear. */}
            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill={PE_LINE}
              fillOpacity={0.08}
              isAnimationActive={false}
              connectNulls={false}
              dot={false}
              activeDot={false}
            />
            {/* The multiple itself — gradient area, finance-charts style */}
            <Area
              type="monotone"
              dataKey={activeMetric.field}
              stroke={PE_LINE}
              strokeWidth={1.8}
              fill="url(#peAreaGrad)"
              isAnimationActive={!reduceMotion}
              animationDuration={420}
              animationEasing="ease-out"
              connectNulls={false}
              dot={false}
            />
            <ReferenceLine
              y={metricStats.median}
              stroke={PE_FAIR}
              strokeDasharray="6 4"
              label={{ value: `median ${fmtMetric(metricStats.median, activeMetric.unit)}`, position: 'insideTopLeft', fontSize: 10, fill: PE_FAIR }}
            />
            {/* Consensus forward P/E — today's Finnhub estimate pinned to the
                right edge. Deliberately a labelled DOT, not part of the line:
                it is a different quantity (analyst estimate, not realized
                NTM) and must read as such. */}
            {metric === 'peFwd' && fwdPeNow != null && metricSeries.length > 0 && (
              <ReferenceDot
                x={metricSeries[metricSeries.length - 1]!.date}
                y={fwdPeNow}
                r={4}
                fill={FWD_CONS}
                stroke="#fff"
                strokeWidth={1.5}
                label={{ value: `${fmtMetric(fwdPeNow, '×')} cons.`, position: 'top', fontSize: 10, fill: FWD_CONS, fontWeight: 600 }}
                ifOverflow="extendDomain"
              />
            )}
            {/* Navigator — mini full-history chart; drag handles or use the
                period buttons above. Brush dataKey = the X category (date),
                and its child must be a nested chart element. */}
            <Brush
              dataKey="date"
              height={26}
              stroke={PE_LINE}
              travellerWidth={8}
              startIndex={pePeriodStart}
              endIndex={Math.max(0, metricSeries.length - 1)}
              onChange={(b: any) => {
                if (b?.startIndex != null && b?.endIndex != null) {
                  setPeBrush({ startIndex: b.startIndex, endIndex: b.endIndex });
                }
              }}
              tickFormatter={(v: any) => (typeof v === 'string' && v.includes('-') ? formatXTick(v) : '')}
            >
              <AreaChart>
                <Area type="monotone" dataKey={activeMetric.field} stroke={PE_LINE} strokeWidth={1} fill={PE_LINE} fillOpacity={0.15} isAnimationActive={false} dot={false} activeDot={false} />
              </AreaChart>
            </Brush>
          </ComposedChart>
        </ResponsiveContainer>
        {/* Formula caption — how the current multiple is composed */}
        {peHeadline && peHeadline.peLive != null && (
          <div className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
            {metric === 'peFwd' ? (
              <>
                NTM P/E (realized) = close ÷ next 4 quarters' reported EPS
                {peHeadline.isConsensus && (
                  <>
                    {' · now '}
                    <span className="font-semibold" style={{ color: FWD_CONS }}>
                      {fmtMetric(fwdPeNow!, '×')} consensus
                    </span>
                    {fwdPeAsOf && <> (Finnhub, {fwdPeAsOf})</>}
                  </>
                )}
                {` · median ${fmtMetric(metricStats.median, activeMetric.unit)}`}
              </>
            ) : (
              <>
                {activeMetric.label} {fmtMetric(peHeadline.peLive, activeMetric.unit)} = {(metric === 'pe' || metric === 'ps' || metric === 'pb') && peHeadline.perShare != null
                  ? `$${peHeadline.price.toFixed(2)} close ÷ $${peHeadline.perShare.toFixed(2)} ${metric === 'pe' ? 'TTM EPS' : metric === 'ps' ? 'TTM rev/sh' : 'book/sh'}`
                  : activeMetric.formula}
                {peHeadline.avg1y != null && <> · 1Y avg {fmtMetric(peHeadline.avg1y, activeMetric.unit)}</>}
                {` · median ${fmtMetric(metricStats.median, activeMetric.unit)}`}
              </>
            )}
          </div>
        )}
        </>
      ) : (
      <>
      {/* TradingView-style readout strip — updates on hover, defaults to the
          last bar. Replaces the floating tooltip card that covered candles
          and user drawings. */}
      {(() => {
        const hd = (hoverIdx != null ? data[hoverIdx] : undefined) ?? data[data.length - 1];
        if (!hd) return null;
        const up = hd.c >= hd.o;
        const chg = hd.o > 0 ? ((hd.c - hd.o) / hd.o) * 100 : 0;
        const med = peStats?.median ?? null;
        return (
          <div className="mb-0.5 flex items-baseline gap-x-2.5 overflow-x-auto whitespace-nowrap text-[11px] tabular-nums text-gray-500 dark:text-gray-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="font-medium">{new Date(hd.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {bmActive ? (
              <>
                <span className="font-semibold" style={{ color: (hd.chgPct ?? 0) >= 0 ? UP : DOWN }}>{ticker} {(hd.chgPct ?? 0) >= 0 ? '+' : ''}{(hd.chgPct ?? 0).toFixed(1)}%</span>
                <span className="font-semibold" style={{ color: '#0ea5e9' }}>{bmLabel} {(hd.bmPct ?? 0) >= 0 ? '+' : ''}{(hd.bmPct ?? 0).toFixed(1)}%</span>
                {hd.chgPct != null && hd.bmPct != null && (
                  <span>Δ {(hd.chgPct - hd.bmPct) >= 0 ? '+' : ''}{(hd.chgPct - hd.bmPct).toFixed(1)}pp</span>
                )}
              </>
            ) : (
              <>
                <span>O ${hd.o.toFixed(2)}</span>
                <span>H ${hd.h.toFixed(2)}</span>
                <span>L ${hd.l.toFixed(2)}</span>
                <span>C <b className="font-semibold" style={{ color: up ? UP : DOWN }}>${hd.c.toFixed(2)} ({chg >= 0 ? '+' : ''}{chg.toFixed(2)}%)</b></span>
                <span>Vol {fmtVol(hd.v)}{hd.volSpike ? ' ⚡' : ''}</span>
                {inds.has('ma20') && hd.sma20 != null && <span style={{ color: MA20 }}>MA20 ${hd.sma20.toFixed(2)}</span>}
                {inds.has('ma50') && hd.sma50 != null && <span style={{ color: MA50 }}>MA50 ${hd.sma50.toFixed(2)}</span>}
                {inds.has('ma200') && hd.sma200 != null && <span style={{ color: MA200 }}>MA200 ${hd.sma200.toFixed(2)}</span>}
                {inds.has('bb') && hd.bbLo != null && hd.bbUp != null && <span style={{ color: BB_COLOR }}>BB ${hd.bbLo.toFixed(0)}–${hd.bbUp.toFixed(0)}</span>}
                {hd.pe != null && hd.pe > 0 && (
                  <span>P/E {hd.pe.toFixed(1)}×{med != null && med !== 0 && (
                    <span style={{ color: hd.pe >= med ? DOWN : UP }}> ({((hd.pe - med) / med) * 100 >= 0 ? '+' : ''}{(((hd.pe - med) / med) * 100).toFixed(0)}% vs med)</span>
                  )}</span>
                )}
                {hd.peFair != null && <span style={{ color: PE_FAIR }}>Fair ${hd.peFair.toFixed(2)}</span>}
                {hd.epsChanged && <span style={{ color: PE_FAIR }}>↑ earnings update</span>}
              </>
            )}
          </div>
        );
      })()}
      <ResponsiveContainer width="100%" height={narrow ? 340 : 420}>
        <ComposedChart data={data} syncId="pmp-price" margin={{ top: 8, right: narrow ? 4 : 16, left: narrow ? 0 : 8, bottom: 24 }}
          onMouseMove={(s: any) => setHoverIdx(typeof s?.activeTooltipIndex === 'number' ? s.activeTooltipIndex : null)}
          onMouseLeave={() => setHoverIdx(null)}>
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
            tickFormatter={bmActive
              ? (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`
              : (v: number) => `$${v.toFixed(0)}`}
            tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
            className="text-gray-500 dark:text-gray-500"
            tickLine={false}
            axisLine={false}
            width={narrow ? 44 : 56}
          />
          {/* Cursor column highlight only — the readout lives in the strip
              above the chart so nothing overlays the candles/drawings. */}
          <Tooltip
            content={() => null}
            cursor={{ fill: 'rgba(148,163,184,0.12)' }}
            isAnimationActive={false}
          />
          {/* Visible candles + volume drawn as a custom shape inside Bar.
              Hidden in compare mode — the % axis makes $ candles meaningless. */}
          {!bmActive && (
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
          )}
          {/* Moving averages — values precomputed on the full candle series */}
          {!bmActive && inds.has('ma20') && (
            <Line type="monotone" dataKey="sma20" stroke={MA20} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          )}
          {!bmActive && inds.has('ma50') && (
            <Line type="monotone" dataKey="sma50" stroke={MA50} strokeWidth={2} dot={false} isAnimationActive={false} />
          )}
          {!bmActive && inds.has('ma200') && (
            <Line type="monotone" dataKey="sma200" stroke={MA200} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          )}
          {!bmActive && inds.has('bb') && (
            <>
              <Line type="monotone" dataKey="bbUp" stroke={BB_COLOR} strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="bbLo" stroke={BB_COLOR} strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            </>
          )}
          {/* Compare mode — both series indexed to the window start on a %
              axis. Solid benchmark line; the ticker's line is split green/
              red by whether it leads or lags, and range-areas fill the gap
              between the two (financecharts-style divergence shading). */}
          {bmActive && (
            <>
              <Area
                type="monotone"
                dataKey="bandG"
                stroke="none"
                fill={UP}
                fillOpacity={0.14}
                isAnimationActive={false}
                connectNulls={false}
                dot={false}
                activeDot={false}
                legendType="none"
              />
              <Area
                type="monotone"
                dataKey="bandR"
                stroke="none"
                fill={DOWN}
                fillOpacity={0.12}
                isAnimationActive={false}
                connectNulls={false}
                dot={false}
                activeDot={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="bmPct"
                stroke={BM_LINE}
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 3, fill: BM_LINE, stroke: 'none' }}
                isAnimationActive={!reduceMotion}
                animationDuration={420}
                animationEasing="ease-out"
                connectNulls={false}
                name={bmLabel}
                label={lineEndTag(bmLabel, BM_LINE, cmpEndIdx.bm, 16)}
              />
              <Line
                type="monotone"
                dataKey="chgUp"
                stroke={UP}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: UP, stroke: 'none' }}
                isAnimationActive={!reduceMotion}
                animationDuration={420}
                animationEasing="ease-out"
                connectNulls={false}
                name={ticker}
                label={lineEndTag(ticker, UP, cmpEndIdx.tk, -7)}
              />
              <Line
                type="monotone"
                dataKey="chgDn"
                stroke={DOWN}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: DOWN, stroke: 'none' }}
                isAnimationActive={!reduceMotion}
                animationDuration={420}
                animationEasing="ease-out"
                connectNulls={false}
                name={ticker}
                label={lineEndTag(ticker, DOWN, cmpEndIdx.tk, -7)}
              />
            </>
          )}
          {/* Median-P/E fair value: stepAfter renders earnings updates as
              honest steps; dots mark the week a new TTM EPS arrived */}
          {!bmActive && inds.has('pefair') && (
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
          {!bmActive && inds.has('w52') && hiLo52 && (
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
          {/* Drawing tools — measure boxes + trendlines. Renders inside the
              chart SVG with the real axis scales (recharts 3 hooks); pointer
              capture is armed only while a tool is selected. */}
          {(drawActive || drawings.length > 0) && !bmActive && (
            <ChartDrawLayer
              tool={drawActive ? drawTool : null}
              drawings={drawings}
              onAdd={addDrawing}
              onUpdate={updateDrawing}
              onDelete={removeDrawing}
              dates={data.map((p) => p.date)}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </>
      )}
      </div>
      {/* Oscillator panes — RSI(14) / MACD(12,26,9) under the price chart.
          Right-axis width and margins mirror the main chart so plots align;
          syncId links the crosshair across panes. */}
      {mode === 'price' && !bmActive && inds.has('rsi') && (
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart data={data} syncId="pmp-price" margin={{ top: 2, right: narrow ? 4 : 16, left: narrow ? 0 : 8, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
            <XAxis dataKey="date" scale="band" hide />
            <YAxis domain={[0, 100]} orientation="right" ticks={[30, 50, 70]}
              tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-500" tickLine={false} axisLine={false}
              width={narrow ? 44 : 56} />
            <Tooltip content={() => null} cursor={{ stroke: 'rgba(148,163,184,0.4)' }} isAnimationActive={false} />
            <ReferenceLine y={70} stroke={DOWN} strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={50} stroke="rgba(148,163,184,0.35)" strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke={UP} strokeDasharray="3 3" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="rsi14" name="RSI 14" stroke={RSI_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      {mode === 'price' && !bmActive && inds.has('macd') && (
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart data={data} syncId="pmp-price" margin={{ top: 2, right: narrow ? 4 : 16, left: narrow ? 0 : 8, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
            <XAxis dataKey="date" scale="band" hide />
            <YAxis orientation="right" tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-500" tickLine={false} axisLine={false}
              width={narrow ? 44 : 56} />
            <Tooltip content={() => null} cursor={{ stroke: 'rgba(148,163,184,0.4)' }} isAnimationActive={false} />
            <ReferenceLine y={0} stroke="rgba(148,163,184,0.4)" />
            <Bar dataKey="macdH" isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={(d.macdH ?? 0) >= 0 ? UP : DOWN} fillOpacity={0.45} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="macdL" name="MACD" stroke={MACD_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="macdS" name="Signal" stroke="#f59e0b" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      {/* Tool hint — below the chart so it never covers the drawings */}
      {drawActive && drawTool && (
        <div className="mt-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
          {TOOL_HINT[drawTool]} · Esc to cancel
        </div>
      )}

      {/* Benchmark legend — only while a compare overlay is active; the
          solid swatch matches the line, delta text shows the window-end gap */}
      {mode === 'price' && bmDelta && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
          <span className="w-4 border-t-2" style={{ borderColor: BM_LINE }} />
          <span className="font-semibold text-gray-700 dark:text-gray-200">{ticker}</span>{' '}
          {bmDelta.ticker >= 0 ? '+' : ''}{bmDelta.ticker.toFixed(1)}% vs{' '}
          <span className="font-semibold" style={{ color: BM_LINE }}>{bmDelta.label}</span>{' '}
          {bmDelta.bm >= 0 ? '+' : ''}{bmDelta.bm.toFixed(1)}%
          <span style={{ color: bmDelta.ticker - bmDelta.bm >= 0 ? UP : DOWN }}>
            {' '}({bmDelta.ticker - bmDelta.bm >= 0 ? '+' : ''}{(bmDelta.ticker - bmDelta.bm).toFixed(1)}pp)
          </span>
        </div>
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
        {mode === 'pe' && metricStats && (
          <>
            {' '}Actual {activeMetric.label} vs its own {Math.max(1, Math.round(metricStats.n / 252))}Y median
            ({fmtMetric(metricStats.median, activeMetric.unit)}); shaded band = 25th–75th percentile.{' '}
            {activeMetric.gapNote}
            {activeMetric.explain && <> {activeMetric.explain}</>}
          </>
        )}
      </p>
    </div>
  );
}

export default PriceCandlestickChart;
