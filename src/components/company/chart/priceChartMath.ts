import type { FairMethod } from '@/lib/valuation/fairValue';

export interface Candle {
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
  /** Composite fair value (50 % historical multiple + 50 % FCF DCF), point-in-time. */
  fv?: number | null;
  fvBear?: number | null;
  fvBull?: number | null;
  fvMethod?: FairMethod | null;
}

export interface ChartPoint extends Candle {
  date: string; // ISO yyyy-mm-dd (category key)
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  /** this week carries an updated fair value (new financial statements) */
  fvChanged?: boolean;
  /** implied TTM EPS for this week (close / pe) — used by tooltip + markers */
  eps?: number | null;
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
export type MetricKey = 'pe' | 'peFwd' | 'ps' | 'pb' | 'evEbit' | 'fcfYield';
export type MetricField = MetricKey;

export interface MetricDef {
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

export const METRICS: MetricDef[] = [
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

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map(m => [m.field, m])) as Record<MetricField, MetricDef>;

export interface MetricStats { median: number; p25: number; p75: number; n: number }

/** Format a metric value in display units (× multiple or % yield). */
export function fmtMetric(v: number, unit: '×' | '%', digits = 1): string {
  return unit === '%' ? `${(v * 100).toFixed(digits)}%` : `${v.toFixed(digits)}×`;
}

/** Implied per-share denominator for price-linear multiples (EPS, rev/share,
    book/share): close ÷ multiple. */
export function impliedPerShare(p: ChartPoint, field: MetricField): number | null {
  const v = p[field];
  return v != null && v > 0 && p.c > 0 ? p.c / v : null;
}

export type PeriodLabel = '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'All';
export type IndKey = 'ma20' | 'ma50' | 'ma200' | 'fair' | 'w52' | 'volspike' | 'bb' | 'rsi' | 'macd';
export type ModeKey = 'price' | 'pe';

export const UP = '#16a34a'; // green
export const DOWN = '#dc2626'; // red
export const FWD_CONS = '#d97706'; // amber — consensus forward P/E marker
export const MA20 = '#f97316'; // orange
export const MA50 = '#7c3aed'; // violet
export const MA200 = '#0891b2'; // teal — 200-day ≈ 40 weekly bars
export const FAIR_COLOR = '#2563eb'; // blue — composite fair value line
export const PE_FAIR = '#db2777'; // pink — valuation mode median reference line
export const PE_LINE = '#4f46e5'; // indigo — P/E-multiple view
export const VOL_SPIKE = '#d97706'; // amber — volume ≫ its own norm
export const REF52 = '#64748b'; // slate-500 — 52W hi/lo lines (400 was too light on white)
export const BM_LINE = '#78716c'; // stone-500 — benchmark compare line (dashed, neutral)
export const BB_COLOR = '#94a3b8'; // slate — quiet band behind the price
export const RSI_COLOR = '#8b5cf6'; // violet
export const MACD_COLOR = '#0ea5e9'; // sky

// Monday-anchored week keys — must match the bucketing in the candles route
// and /api/indices/weekly so benchmark closes join to the right candle.
const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_MONDAY_OFFSET = 4 * 24 * 60 * 60 * 1000;
export const weekKeyOf = (t: number) => Math.floor((t - MS_MONDAY_OFFSET) / MS_WEEK);

// User-togglable indicator set; persisted per-browser, Fair value on by default.
export const IND_KEY = 'pmp:pricechart:indicators';
export const DEFAULT_INDS: IndKey[] = ['fair'];
// Chart view (price vs valuation mode, metric, period) persisted per-browser
// so the ticker slider keeps the same lens when the page navigates — and a
// hard reload lands back on the last view too.
export const VIEW_KEY = 'pmp:pricechart:view';
export const PERIOD_LABELS: PeriodLabel[] = ['3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'All'];

// Draw-tool labels for the armed toolbar button + under-chart hint.
export const TOOL_LABEL: Record<string, string> = {
  measure: '📐 Measure', trend: '╱ Trend', ray: '➚ Ray',
  hline: '― Level', zone: '▦ Zone', fibo: 'ƒ Fibo',
};
export const TOOL_HINT: Record<string, string> = {
  measure: 'Drag to measure a move',
  trend: 'Drag to draw a segment between two points',
  ray: 'Drag to draw a ray — extends forward only',
  hline: 'Click to place the price level',
  zone: 'Drag a rectangle to mark a zone',
  fibo: 'Drag from swing low to swing high',
};

export const INDICATORS: { key: IndKey; label: string; color: string }[] = [
  { key: 'ma20', label: 'MA 20w', color: MA20 },
  { key: 'ma50', label: 'MA 50w', color: MA50 },
  { key: 'ma200', label: 'MA 200d', color: MA200 },
  { key: 'bb', label: 'Bollinger', color: BB_COLOR },
  { key: 'w52', label: '52W hi/lo', color: REF52 },
  { key: 'volspike', label: 'Vol spike', color: VOL_SPIKE },
  { key: 'rsi', label: 'RSI 14', color: RSI_COLOR },
  { key: 'macd', label: 'MACD', color: MACD_COLOR },
];

// Rolling mean — null until `n` observations exist (line starts later).
export function rollingMean(vals: number[], n: number): (number | null)[] {
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
export function rollingStd(vals: number[], n: number): (number | null)[] {
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
export function ema(vals: number[], n: number): (number | null)[] {
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
export function rsi(vals: number[], n = 14): (number | null)[] {
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

export function formatXTick(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function fmtVol(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${v}`;
}

/**
 * Enrich raw weekly candles with technical indicators (SMA20/50/200, Bollinger,
 * RSI14, MACD), volume-spike flags, implied EPS, and fair-value step markers.
 */
export function enrichCandles(allCandles: Candle[] | null): ChartPoint[] {
  if (!allCandles) return [];
  const sorted = [...allCandles].sort((a, b) => a.t - b.t);
  const closes = sorted.map((c) => c.c);
  const sma20 = rollingMean(closes, 20);
  const sma50 = rollingMean(closes, 50);
  // 40 weekly bars ≈ the 200-day average investors actually mean by SMA200
  const sma200 = rollingMean(closes, 40);
  const volSma = rollingMean(sorted.map((c) => c.v || 0), 20);
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
  const epsArr: (number | null)[] = sorted.map((c) =>
    c.pe != null && c.pe > 0 && Number.isFinite(c.pe) ? c.c / c.pe : null,
  );

  let prevFv: number | null = null;
  const out: ChartPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]!;
    const va = volSma[i];
    const fv = c.fv != null && c.fv > 0 ? c.fv : null;
    const fvChanged = fv != null && prevFv != null && Math.abs(fv - prevFv) > Math.abs(prevFv) * 0.001;
    if (fv != null) prevFv = fv;
    out.push({
      ...c,
      date: new Date(c.t).toISOString().slice(0, 10),
      sma20: sma20[i] ?? null,
      sma50: sma50[i] ?? null,
      sma200: sma200[i] ?? null,
      eps: epsArr[i] ?? null,
      fvChanged,
      volSpike: va != null && va > 0 && (c.v || 0) > 2 * va,
      bbUp: sma20[i] != null && std20[i] != null ? sma20[i]! + 2 * std20[i]! : null,
      bbLo: sma20[i] != null && std20[i] != null ? sma20[i]! - 2 * std20[i]! : null,
      rsi14: rsiArr[i] ?? null,
      macdL: macdRaw[i] ?? null,
      macdS: macdSig[i] ?? null,
      macdH: macdRaw[i] != null && macdSig[i] != null ? macdRaw[i]! - macdSig[i]! : null,
    });
  }
  return out;
}
