/**
 * Market Profile — pure math + shared types (no DB / network imports, so the
 * client section can import the types and Jest can test the math directly).
 *
 * Data sources (assembled server-side in marketProfile.ts):
 *  - Polygon adjusted daily aggs (stock + SPY)  → performance vs S&P 500, beta,
 *    volatility, max drawdown. Same adjusted source as the price chart.
 *  - Polygon /v3/reference/dividends + /splits  → dividend profile. Polygon
 *    dividend amounts are NOT split-adjusted (AAPL 2020-08 ex 0.82 pre 4:1
 *    split vs 0.205 after) — adjustDividendsForSplits() fixes that.
 *  - Polygon /v3/reference/tickers/{t}           → company facts (IPO, CIK).
 *  - Finnhub /stock/peers                        → direct competitors.
 */

export type PerfKey = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y';

export interface DailyClose {
  /** bar start, ms (Polygon daily bars start at ET midnight) */
  t: number;
  c: number;
}

export interface PerformanceRow {
  key: PerfKey;
  /** cumulative % return of the stock */
  stock: number | null;
  /** cumulative % return of SPY (S&P 500 proxy) over the same dates */
  spx: number | null;
  /** stock − spx, percentage points */
  diff: number | null;
}

export interface RiskStats {
  /** 1Y daily-return beta vs SPY */
  beta: number | null;
  /** annualized volatility of daily returns, % */
  vol: number | null;
  spxVol: number | null;
  /** worst peak-to-trough decline over the last year, % (negative) */
  maxDrawdown: number | null;
  spxMaxDrawdown: number | null;
  /** number of aligned daily returns used */
  n: number;
}

export interface RawDividend {
  ex_dividend_date?: string;
  pay_date?: string;
  cash_amount?: number;
  currency?: string;
  dividend_type?: string;
  frequency?: number;
}

export interface RawSplit {
  execution_date?: string;
  split_from?: number;
  split_to?: number;
}

export interface DividendEvent {
  exDate: string;
  payDate: string | null;
  /** split-adjusted cash amount per current share */
  amount: number;
  kind: 'regular' | 'special';
  frequency: number | null;
}

export interface DividendYear {
  year: number;
  regular: number;
  special: number;
  /** current calendar year (not complete yet) */
  partial: boolean;
}

export interface DividendProfile {
  currency: string;
  /** paid a regular dividend within the last ~15 months */
  active: boolean;
  frequency: number | null;
  frequencyLabel: string | null;
  last: DividendEvent | null;
  upcoming: DividendEvent | null;
  /** last regular amount × frequency (per share, split-adjusted) */
  forwardAnnual: number | null;
  /** sum of regular dividends with ex-date in the trailing 365 days */
  ttmTotal: number | null;
  /** CAGR of trailing-12M regular dividends vs the same window 5 years earlier, % */
  cagr5y: number | null;
  /** consecutive completed calendar years with a higher year-end dividend rate */
  growthStreak: number | null;
  /** streak reaches the start of the available history (true streak may be longer) */
  streakCapped: boolean;
  years: DividendYear[];
  recent: DividendEvent[];
}

export interface CompanyFacts {
  listDate: string | null;
  cik: string | null;
  exchange: string | null;
  securityType: string | null;
}

export interface PeerRow {
  symbol: string;
  name: string | null;
  price: number | null;
  changePct: number | null;
  /** billions USD */
  marketCap: number | null;
  /** own TTM P/E (DailyValuationHistory, same pipeline as the valuation charts) */
  pe: number | null;
  /** annual revenue CAGR (~4–5 fiscal years), % */
  revenueCagr: number | null;
  dividendYield: number | null;
  overallScore: number | null;
  isSelf: boolean;
}

export interface MarketProfile {
  symbol: string;
  /** date (YYYY-MM-DD) of the last daily close used for performance */
  asOf: string | null;
  performance: PerformanceRow[];
  risk: RiskStats | null;
  dividends: DividendProfile | null;
  /** Finnhub TTM payout ratio, % */
  payoutRatio: number | null;
  facts: CompanyFacts | null;
  peers: PeerRow[];
  /** peers not fetched yet (rate-limited / cold) — client should revalidate */
  peersPending: boolean;
  generatedAt: string;
}

// ─── Date helpers (pure, UTC-based on YYYY-MM-DD strings) ────────────────────

const DAY_MS = 86_400_000;

export function dayStr(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function parseDay(s: string): number {
  return Date.parse(`${s}T00:00:00Z`);
}

function minusDays(s: string, n: number): string {
  return dayStr(parseDay(s) - n * DAY_MS);
}

function minusMonths(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 - n, 1));
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, dim));
  return first.toISOString().slice(0, 10);
}

/** Index of the last bar whose date is <= target; -1 when none. Bars ascending. */
function lastIdxOnOrBefore(bars: DailyClose[], target: string): number {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dayStr(bars[mid]!.t) <= target) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/**
 * Base bar for a lookback target. Tolerates holiday/gap offsets (≤7 days
 * before target) and the very edge of the data window (first bar ≤5 days
 * after target — Polygon Starter history begins exactly 5 years back).
 */
function baseIdx(bars: DailyClose[], target: string): number {
  const i = lastIdxOnOrBefore(bars, target);
  if (i >= 0) {
    return parseDay(target) - parseDay(dayStr(bars[i]!.t)) <= 7 * DAY_MS ? i : -1;
  }
  if (bars.length > 0 && parseDay(dayStr(bars[0]!.t)) - parseDay(target) <= 5 * DAY_MS) return 0;
  return -1;
}

function pctReturn(bars: DailyClose[], anchorIdx: number, target: string, ytd = false): number | null {
  if (anchorIdx < 0) return null;
  let b: number;
  if (ytd) {
    // Last close of the previous calendar year
    b = lastIdxOnOrBefore(bars, target);
    if (b < 0 || parseDay(target) - parseDay(dayStr(bars[b]!.t)) > 10 * DAY_MS) return null;
  } else {
    b = baseIdx(bars, target);
  }
  if (b < 0 || b >= anchorIdx) return null;
  const base = bars[b]!.c, last = bars[anchorIdx]!.c;
  if (!(base > 0) || !(last > 0)) return null;
  return (last / base - 1) * 100;
}

export const PERF_KEYS: PerfKey[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'];

function targetFor(key: PerfKey, anchor: string): string {
  switch (key) {
    case '1W': return minusDays(anchor, 7);
    case '1M': return minusMonths(anchor, 1);
    case '3M': return minusMonths(anchor, 3);
    case '6M': return minusMonths(anchor, 6);
    case '1Y': return minusMonths(anchor, 12);
    case '3Y': return minusMonths(anchor, 36);
    case '5Y': return minusMonths(anchor, 60);
    case 'YTD': return `${Number(anchor.slice(0, 4)) - 1}-12-31`;
  }
}

/**
 * Cumulative returns of the stock and SPY over identical calendar windows,
 * anchored on the stock's last close (SPY uses its last bar on/before it).
 */
export function computePerformance(stock: DailyClose[], spy: DailyClose[]): { asOf: string | null; rows: PerformanceRow[] } {
  if (stock.length < 2) return { asOf: null, rows: [] };
  const anchorIdx = stock.length - 1;
  const anchor = dayStr(stock[anchorIdx]!.t);
  const spyAnchorIdx = lastIdxOnOrBefore(spy, anchor);
  const rows: PerformanceRow[] = PERF_KEYS.map((key) => {
    const target = targetFor(key, anchor);
    const ytd = key === 'YTD';
    const s = pctReturn(stock, anchorIdx, target, ytd);
    const m = spyAnchorIdx >= 0 ? pctReturn(spy, spyAnchorIdx, target, ytd) : null;
    return { key, stock: round2(s), spx: round2(m), diff: s != null && m != null ? round2(s - m) : null };
  });
  // Drop trailing horizons the stock has no history for (recent IPOs)
  return { asOf: anchor, rows: rows.filter((r) => r.stock != null) };
}

function round2(v: number | null): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
}

function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0]!, worst = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = c / peak - 1;
    if (dd < worst) worst = dd;
  }
  return worst * 100;
}

/** 1Y beta / volatility / drawdown from date-aligned daily returns. */
export function computeRisk(stock: DailyClose[], spy: DailyClose[]): RiskStats | null {
  if (stock.length < 30 || spy.length < 30) return null;
  const anchor = dayStr(stock[stock.length - 1]!.t);
  const start = minusMonths(anchor, 12);
  const spyByDay = new Map(spy.map((b) => [dayStr(b.t), b.c]));
  const win = stock.filter((b) => dayStr(b.t) >= start);
  const spyWin = spy.filter((b) => { const d = dayStr(b.t); return d >= start && d <= anchor; });

  const rs: number[] = [], rm: number[] = [];
  for (let i = 1; i < win.length; i++) {
    const a = win[i - 1]!, b = win[i]!;
    const ma = spyByDay.get(dayStr(a.t)), mb = spyByDay.get(dayStr(b.t));
    if (!(a.c > 0) || !(b.c > 0) || !(ma && ma > 0) || !(mb && mb > 0)) continue;
    rs.push(b.c / a.c - 1);
    rm.push(mb / ma - 1);
  }
  if (rs.length < 120) return null;

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ms = mean(rs), mm = mean(rm);
  let cov = 0, vs = 0, vm = 0;
  for (let i = 0; i < rs.length; i++) {
    cov += (rs[i]! - ms) * (rm[i]! - mm);
    vs += (rs[i]! - ms) ** 2;
    vm += (rm[i]! - mm) ** 2;
  }
  const n1 = rs.length - 1;
  const beta = vm > 0 ? cov / vm : null;
  const annual = (v: number) => Math.sqrt(v / n1) * Math.sqrt(252) * 100;
  return {
    beta: beta != null ? Math.round(beta * 100) / 100 : null,
    vol: round2(annual(vs)),
    spxVol: round2(annual(vm)),
    maxDrawdown: round2(maxDrawdown(win.map((b) => b.c))),
    spxMaxDrawdown: round2(maxDrawdown(spyWin.map((b) => b.c))),
    n: rs.length,
  };
}

// ─── Dividends ──────────────────────────────────────────────────────────────

const FREQ_LABEL: Record<number, string> = {
  1: 'Annual',
  2: 'Semi-annual',
  3: '3× a year',
  4: 'Quarterly',
  12: 'Monthly',
  24: 'Semi-monthly',
  52: 'Weekly',
};

export function frequencyLabel(f: number | null | undefined): string | null {
  return f != null && FREQ_LABEL[f] ? FREQ_LABEL[f]! : null;
}

/**
 * Normalize + split-adjust Polygon dividend records. Every split executed
 * AFTER the ex-date divides the historical cash amount by split_to/split_from.
 * Returns events sorted descending by ex-date; non-cash fund distributions
 * (LT/ST capital gains) are dropped.
 */
export function adjustDividendsForSplits(divs: RawDividend[], splits: RawSplit[]): DividendEvent[] {
  const sp = splits
    .filter((s) => s.execution_date && (s.split_from ?? 0) > 0 && (s.split_to ?? 0) > 0)
    .map((s) => ({ date: s.execution_date!, ratio: s.split_to! / s.split_from! }));
  const out: DividendEvent[] = [];
  const seen = new Set<string>();
  for (const d of divs) {
    if (!d.ex_dividend_date || !(Number(d.cash_amount) > 0)) continue;
    const type = (d.dividend_type || 'CD').toUpperCase();
    if (type !== 'CD' && type !== 'SC') continue;
    let factor = 1;
    for (const s of sp) if (s.date > d.ex_dividend_date) factor /= s.ratio;
    const amount = Number(d.cash_amount) * factor;
    const kind: DividendEvent['kind'] = type === 'SC' ? 'special' : 'regular';
    const key = `${d.ex_dividend_date}|${kind}|${amount.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      exDate: d.ex_dividend_date,
      payDate: d.pay_date || null,
      amount,
      kind,
      frequency: typeof d.frequency === 'number' ? d.frequency : null,
    });
  }
  return out.sort((a, b) => (a.exDate < b.exDate ? 1 : a.exDate > b.exDate ? -1 : 0));
}

const RATE_FREQS = new Set([1, 2, 3, 4, 12, 24, 52]);

export function buildDividendProfile(events: DividendEvent[], today: string, currency = 'USD'): DividendProfile | null {
  if (events.length === 0) return null;
  const desc = [...events].sort((a, b) => (a.exDate < b.exDate ? 1 : -1));
  const regular = desc.filter((e) => e.kind === 'regular');

  const past = desc.filter((e) => e.exDate <= today);
  const future = desc.filter((e) => e.exDate > today);
  const last = past[0] ?? null;
  const upcoming = future.length ? future[future.length - 1]! : null;

  const lastRegular = regular.find((e) => e.exDate <= today) ?? regular[regular.length - 1] ?? null;
  const freq = lastRegular?.frequency ?? null;

  const yearAgo = minusDays(today, 365);
  const ttmRegular = regular.filter((e) => e.exDate > yearAgo && e.exDate <= today);
  const ttmTotal = ttmRegular.length ? ttmRegular.reduce((s, e) => s + e.amount, 0) : null;

  const forwardAnnual = lastRegular && freq != null && RATE_FREQS.has(freq)
    ? lastRegular.amount * freq
    : ttmTotal;

  const active = !!lastRegular && parseDay(today) - parseDay(lastRegular.exDate) <= 456 * DAY_MS;

  // 5Y CAGR of the trailing-12M regular sum
  const fiveAgo = minusMonths(today, 60);
  const sixAgo = minusDays(fiveAgo, 365);
  const then = regular.filter((e) => e.exDate > sixAgo && e.exDate <= fiveAgo).reduce((s, e) => s + e.amount, 0);
  const cagr5y = ttmTotal && ttmTotal > 0 && then > 0 && active
    ? (Math.pow(ttmTotal / then, 1 / 5) - 1) * 100
    : null;

  // Calendar-year totals (last 10 years incl. current)
  const curYear = Number(today.slice(0, 4));
  const byYear = new Map<number, DividendYear>();
  for (let y = curYear - 9; y <= curYear; y++) byYear.set(y, { year: y, regular: 0, special: 0, partial: y === curYear });
  for (const e of desc) {
    const y = Number(e.exDate.slice(0, 4));
    const row = byYear.get(y);
    if (!row || e.exDate > today) continue;
    if (e.kind === 'regular') row.regular += e.amount; else row.special += e.amount;
  }
  const years = [...byYear.values()];
  const firstWithData = years.findIndex((y) => y.regular > 0 || y.special > 0);
  const yearsOut = firstWithData >= 0 ? years.slice(firstWithData) : [];

  // Growth streak — year-end dividend RATE (last regular amount × frequency),
  // which is robust to a 5th quarterly payment landing in one calendar year.
  const rateByYear = new Map<number, number>();
  const ascRegular = [...regular].reverse();
  for (const e of ascRegular) {
    if (e.exDate > today) continue;
    const f = e.frequency != null && RATE_FREQS.has(e.frequency) ? e.frequency : null;
    if (f == null) continue;
    rateByYear.set(Number(e.exDate.slice(0, 4)), e.amount * f);
  }
  let streak = 0;
  let capped = false;
  const earliestYear = ascRegular.length ? Number(ascRegular[0]!.exDate.slice(0, 4)) : curYear;
  for (let y = curYear - 1; y > earliestYear; y--) {
    const a = rateByYear.get(y), b = rateByYear.get(y - 1);
    if (a == null || b == null) break;
    if (a > b * 1.0005) streak++;
    else break;
    if (y - 1 === earliestYear) capped = true;
  }

  return {
    currency,
    active,
    frequency: freq,
    frequencyLabel: frequencyLabel(freq),
    last,
    upcoming,
    forwardAnnual: active ? forwardAnnual : null,
    ttmTotal,
    cagr5y: cagr5y != null ? Math.round(cagr5y * 100) / 100 : null,
    growthStreak: active && rateByYear.size >= 2 ? streak : null,
    streakCapped: capped,
    years: yearsOut,
    recent: desc.filter((e) => e.exDate <= today || e === upcoming).slice(0, 8),
  };
}

// ─── Facts ──────────────────────────────────────────────────────────────────

const EXCHANGES: Record<string, string> = {
  XNAS: 'NASDAQ',
  XNYS: 'NYSE',
  XASE: 'NYSE American',
  ARCX: 'NYSE Arca',
  BATS: 'Cboe BZX',
  XNGS: 'NASDAQ',
  IEXG: 'IEX',
  OTCM: 'OTC',
};

const SECURITY_TYPES: Record<string, string> = {
  CS: 'Common stock',
  ADRC: 'ADR',
  ADRP: 'ADR (preferred)',
  ETF: 'ETF',
  ETN: 'ETN',
  ETV: 'ETF',
  PFD: 'Preferred stock',
  FUND: 'Fund',
  UNIT: 'Unit',
  RIGHT: 'Right',
  WARRANT: 'Warrant',
};

export function exchangeLabel(mic: string | null | undefined): string | null {
  if (!mic) return null;
  return EXCHANGES[mic] ?? mic;
}

export function securityTypeLabel(t: string | null | undefined): string | null {
  if (!t) return null;
  return SECURITY_TYPES[t] ?? t;
}

export function edgarUrl(cik: string | null | undefined): string | null {
  if (!cik || !/^\d+$/.test(cik)) return null;
  return `https://www.sec.gov/edgar/browse/?CIK=${Number(cik)}`;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatListedLabel(listDate: string, refYear: number): string {
  const [yStr, mStr] = listDate.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return `Listed ${listDate}`;
  const yrs = Math.max(0, refYear - y);
  const suffix = yrs >= 1 ? ` · ${yrs}y` : '';
  return `Listed ${SHORT_MONTHS[m - 1] ?? ''} ${y}${suffix}`;
}

export function formatDivAmount(v: number, currency = 'USD'): string {
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${prefix}${v < 0.1 ? v.toFixed(4) : v.toFixed(2)}`;
}

// ─── Intraday VWAP ──────────────────────────────────────────────────────────

export interface IntradayBar {
  t: number;
  c: number;
  v?: number;
  vw?: number;
  h?: number;
  l?: number;
}

const etHmFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function etHhmm(t: number): number {
  const parts = etHmFmt.formatToParts(new Date(t));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 100 + m;
}

/**
 * Session VWAP per bar: cumulative Σ(vw·v)/Σv anchored at the 9:30 ET open
 * and frozen at the 16:00 close (standard regular-session VWAP). When the
 * series has no regular-session bars yet (pre-market view), the VWAP anchors
 * at the first bar instead. Bars outside the anchored window get null.
 */
export function attachSessionVwap(bars: IntradayBar[]): (number | null)[] {
  const hasRegular = bars.some((b) => { const hm = etHhmm(b.t); return hm >= 930 && hm < 1600; });
  let pv = 0, vol = 0;
  return bars.map((b) => {
    const hm = etHhmm(b.t);
    const inWindow = hasRegular ? hm >= 930 && hm < 1600 : true;
    if (!inWindow) return null;
    const v = Number(b.v) || 0;
    const px = Number(b.vw) > 0 ? Number(b.vw) : (b.h && b.l ? (b.h + b.l + b.c) / 3 : b.c);
    if (v > 0 && px > 0) { pv += px * v; vol += v; }
    return vol > 0 ? Math.round((pv / vol) * 10000) / 10000 : null;
  });
}

/**
 * Compact display name for dense peer tables — uses the curated short name
 * when available and otherwise strips verbose share-class / legal suffixes.
 */
export function shortCompanyName(
  symbol: string,
  rawName: string | null | undefined,
  curatedName?: string | null,
): string | null {
  if (curatedName && curatedName !== symbol) return curatedName;
  if (!rawName) return null;
  const cleaned = rawName
    .replace(/,?\s*\b(?:Class\s+[A-D]\s+)?(?:Common|Ordinary)\s+(?:Stock|Shares|Units)\b.*$/i, '')
    .replace(/,?\s*\b(?:Holdings?(?:,?\s*(?:Inc\.?|Corp\.?|Ltd\.?|LLC|PLC))?|Incorporated|Corporation|Corp\.?|Inc\.?|Company|Co\.?|Ltd\.?|Limited|PLC|N\.?V\.?|S\.?A\.?|SE|AG)\s*$/i, '')
    .trim();
  return cleaned || rawName;
}
