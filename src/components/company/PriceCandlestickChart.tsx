'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ReferenceDot,
  Brush,
  AreaChart,
} from 'recharts';
import { CHART_FONT } from '@/components/charts/chartTheme';
import { event as gaEvent } from '@/lib/ga';
import { useSession, signIn } from 'next-auth/react';
import { ChartDrawLayer, loadDrawings, saveDrawings, type Drawing, type DrawTool } from './chart/ChartDrawTools';
import { FairValueBreakdown, type FairValueMeta } from './chart/FairValueBreakdown';
import { useTickerNavMode } from '@/components/company/analysis/useTickerNavMode';
import type { SimilarTickers, TickerNav } from '@/lib/analysis/tickerNav';
import { FAIR_CFG, FAIR_METHOD_LABEL, formatFairDollar, formatFairStatus } from '@/lib/valuation/fairValue';
import {
  type Candle,
  type ChartPoint,
  type MetricField,
  type MetricDef,
  type MetricStats,
  type PeriodLabel,
  type IndKey,
  type ModeKey,
  METRIC_BY_KEY,
  PERIOD_LABELS,
  DEFAULT_INDS,
  IND_KEY,
  VIEW_KEY,
  TOOL_HINT,
  UP,
  DOWN,
  FWD_CONS,
  MA20,
  MA50,
  MA200,
  FAIR_COLOR,
  PE_FAIR,
  PE_LINE,
  REF52,
  BM_LINE,
  BB_COLOR,
  weekKeyOf,
  fmtMetric,
  impliedPerShare,
  formatXTick,
  enrichCandles,
} from './chart/priceChartMath';
import {
  lineEndTag,
  CandleShape,
  FairValueZoneLayer,
  MetricTooltip,
  ChartNavArrow,
  SimilarChips,
  PriceReadoutStrip,
  type PriceReadoutStripHandle,
  PriceOscillatorPanes,
} from './chart/PriceChartPrimitives';
import { PriceChartHeaderToolbar } from './chart/PriceChartToolbar';

interface PriceCandlestickChartProps {
  ticker: string;
  /** Displayed next to the ticker in the chart's nav strip so the charted
   *  company is unambiguous. */
  companyName?: string | null;
  /** Prev/next neighbors from getTickerNav — feeds the in-chart ticker
   *  slider (same ordering and mode as the page-top navigator). */
  nav?: TickerNav | null;
  /** Closest-cap peers per scope (5 each) — similar-ticker chips under the
   *  chart; same link behavior as the slider arrows. */
  similar?: SimilarTickers | null;
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

export function PriceCandlestickChart({ ticker, companyName, nav, similar, currentPrice, currentChangePct, changeLabel = 'day', onCompareChange }: PriceCandlestickChartProps) {
  const { mode: navMode, result: navRes } = useTickerNavMode(nav);
  const [allCandles, setAllCandles] = useState<Candle[] | null>(null);
  const [valStats, setValStats] = useState<Partial<Record<MetricField, MetricStats>>>({});
  const [evNetDebt, setEvNetDebt] = useState<number | null>(null);
  const [fwdPeNow, setFwdPeNow] = useState<number | null>(null);
  const [fwdPeAsOf, setFwdPeAsOf] = useState<string | null>(null);
  const [fairMeta, setFairMeta] = useState<FairValueMeta | null>(null);
  const [fvInfoAnchor, setFvInfoAnchor] = useState<'top' | 'bottom' | null>(null);
  const toggleFvInfo = (anchor: 'top' | 'bottom') =>
    setFvInfoAnchor((cur) => (cur === anchor ? null : anchor));
  const renderFvBreakdown = (
    slot: 'top' | 'bottom',
    isPriceMode: boolean,
    isComparing: boolean,
    showFair: boolean,
    premium: { fair: number; bear: number | null; bull: number | null } | null,
    meta: FairValueMeta | null,
    isLiveGated: boolean,
  ) => {
    if (!isPriceMode || isComparing || !showFair || fvInfoAnchor !== slot || (!premium && !meta)) return null;
    const panel = (
      <FairValueBreakdown
        meta={meta}
        fair={premium?.fair ?? null}
        bear={premium?.bear ?? null}
        bull={premium?.bull ?? null}
        liveGated={isLiveGated}
        onClose={() => setFvInfoAnchor(null)}
      />
    );
    return slot === 'bottom' ? <div className="mt-2.5">{panel}</div> : panel;
  };
  const [metric, setMetric] = useState<MetricField>('pe');
  const [mode, setMode] = useState<ModeKey>('price');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodLabel>('5Y');
  const [inds, setInds] = useState<Set<IndKey>>(() => new Set(DEFAULT_INDS));
  const [openMenu, setOpenMenu] = useState<'metric' | 'overlays' | 'compare' | 'draw' | 'tools' | null>(null);
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

  useEffect(() => { setOpenMenu(null); }, [mode]);

  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(IND_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setInds(new Set(parsed.map((k) => (k === 'pefair' ? 'fair' : k)) as IndKey[]));
    } catch { /* ignore corrupt value */ }
  }, []);

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
    gaEvent('chart_indicator', { ind: k, state: inds.has(k) ? 'off' : 'on', ticker });
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setFairMeta(null);
    setFvInfoAnchor(null);
    fetch(`/api/analysis/${ticker}/candles`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => {
        if (!mounted) return;
        setAllCandles(Array.isArray(json.candles) ? json.candles : []);
        setValStats(
          json.valuationStats ?? (json.peStats ? { pe: json.peStats } : {}),
        );
        setEvNetDebt(json.evNetDebt ?? null);
        setSectorEtf(json.sectorEtf ?? null);
        setSectorName(json.sector ?? null);
        setFwdPeNow(typeof json.fwdPeNow === 'number' && json.fwdPeNow > 0 ? json.fwdPeNow : null);
        setFwdPeAsOf(typeof json.fwdPeAsOf === 'string' ? json.fwdPeAsOf : null);
        setFairMeta(json.fairValue ?? null);
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
    const fixed = candidates.filter(
      (p, i, arr) =>
        (p.years < spanYears - 0.1 || (p.label === '5Y' && spanYears >= 4.5)) &&
        p.years > 0.08 &&
        (p.label !== 'YTD' || Math.abs(p.years - 1) > 0.12) &&
        (i === 0 || p.years - arr[i - 1]!.years > 0.03),
    );
    return [...fixed, { label: 'All' as const, years: 99 }];
  }, [spanYears]);

  const activePeriod: PeriodLabel = periodChoices.some((p) => p.label === period)
    ? period
    : 'All';

  const peStats = valStats.pe ?? null;
  const activeMetric: MetricDef = METRIC_BY_KEY[metric];
  const metricStats = valStats[metric] ?? null;

  useEffect(() => {
    if (mode !== 'pe') return;
    if (!loading && !Object.keys(valStats).length) setMode('price');
    else if (!valStats[metric]) setMetric('pe');
  }, [mode, metric, valStats, loading]);

  const enriched: ChartPoint[] = useMemo(() => enrichCandles(allCandles), [allCandles]);

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

  const [sectorEtf, setSectorEtf] = useState<string | null>(null);
  const [sectorName, setSectorName] = useState<string | null>(null);
  const [bmSym, setBmSym] = useState<string | null>(null);
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

  useEffect(() => {
    onCompareChange?.(bmActive ? bmLabel : null);
  }, [bmActive, bmLabel, onCompareChange]);

  const bmByWeek = useMemo(() => {
    const m = new Map<number, number>();
    if (bmActive && bmSeries) for (const p of bmSeries.pts) m.set(weekKeyOf(p.t), p.c);
    return m;
  }, [bmSeries, bmActive]);

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
        chgUp: above === true ? chg : null,
        chgDn: above === false ? chg : null,
        bandG: above === true ? [bmp!, chg] : null,
        bandR: above === false ? [bmp!, chg] : null,
      };
    });
  }, [enriched, periodCutoffMs, bmByWeek]);

  const [peBrush, setPeBrush] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [peEpoch, setPeEpoch] = useState(0);
  useEffect(() => setPeBrush(null), [activePeriod, ticker]);

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
    setDrawTool(null);
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

  useEffect(() => {
    if (!drawTool) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawTool(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [drawTool]);
  const drawActive = mode === 'price' && !bmActive && drawTool != null;

  const readoutRef = useRef<PriceReadoutStripHandle | null>(null);

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

  const hiLo52 = useMemo(() => {
    if (!allCandles?.length) return null;
    const last52 = [...allCandles].sort((a, b) => a.t - b.t).slice(-52);
    let hi = -Infinity, lo = Infinity;
    for (const c of last52) { if (c.h > hi) hi = c.h; if (c.l < lo) lo = c.l; }
    return Number.isFinite(hi) ? { hi, lo } : null;
  }, [allCandles]);

  const maxVolume = useMemo(
    () => Math.max(...data.map(pt => pt.v || 0), 1),
    [data]
  );

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
    if (metric === 'peFwd' && fwdPeNow != null) hi = Math.max(hi, fwdPeNow * 1.06);
    const round = activeMetric.unit === '%'
      ? (v: number) => Math.ceil(v * 200) / 200
      : Math.ceil;
    return [round(lo), Math.max(round(hi), lo + 0.001)];
  }, [peVisible, metricStats, activeMetric, metric, fwdPeNow]);

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
        live = lastV * (lastVal.c / currentPrice);
      } else if (metric === 'evEbit' && lastVal.mcap != null && evNetDebt != null) {
        const ebitTTM = (lastVal.mcap + evNetDebt) / lastV;
        const shares = lastVal.mcap / lastVal.c;
        live = ebitTTM > 0 ? (currentPrice * shares + evNetDebt) / ebitTTM : null;
      } else if (metric !== 'evEbit') {
        live = lastV * (currentPrice / lastVal.c);
      }
    }
    const headlineIsConsensus = metric === 'peFwd' && fwdPeNow != null;
    if (headlineIsConsensus) live = fwdPeNow;
    const firstVis = peVisible.find(
      (p) => p[f] != null && (activeMetric.allowNegative || (p[f] as number) > 0),
    );
    const base = firstVis?.[f] ?? null;
    const chgPct =
      live != null && base != null && base !== 0 ? (live / base - 1) * 100 : null;
    const premVsMedian =
      live != null && metricStats?.median != null && metricStats.median !== 0
        ? ((live - metricStats.median) / Math.abs(metricStats.median)) * 100
        : null;
    const last52 = enriched
      .slice(-52)
      .map((p) => p[f])
      .filter((v): v is number => v != null && Number.isFinite(v) && (activeMetric.allowNegative || v > 0));
    const avg1y = last52.length ? last52.reduce((a, b) => a + b, 0) / last52.length : null;
    const price = currentPrice ?? last.c;
    const perShare = lastVal ? impliedPerShare(lastVal, f) : null;
    return { peLive: live, chgPct, premVsMedian, eps: last.eps ?? null, avg1y, price, date: last.date, perShare, isConsensus: headlineIsConsensus, lastRealized: lastV };
  }, [enriched, peVisible, currentPrice, metric, activeMetric, evNetDebt, metricStats, fwdPeNow]);

  const { fairPremium, liveFairGated } = useMemo(() => {
    if (!inds.has('fair') || !data.length) return { fairPremium: null, liveFairGated: false };
    const tail = data[data.length - 1]!;
    const hasRatios = tail.pe != null || tail.ps != null || tail.fcfYield != null || tail.fv != null;
    const anchorIdx = !hasRatios && data.length >= 2 ? data.length - 2 : data.length - 1;
    const last = data[anchorIdx]!;
    if (last.fv == null || last.fv <= 0) return { fairPremium: null, liveFairGated: false };
    const px = currentPrice ?? last.c;
    if (!(px > 0)) return { fairPremium: null, liveFairGated: false };
    const ratio = last.fv / px;
    if (ratio > FAIR_CFG.gate || ratio < FAIR_CFG.gateLow) {
      return { fairPremium: null, liveFairGated: true };
    }
    const undervalPct = ((last.fv - px) / last.fv) * 100;
    return {
      fairPremium: {
        fair: last.fv,
        bear: last.fvBear ?? null,
        bull: last.fvBull ?? null,
        method: last.fvMethod ?? fairMeta?.method ?? null,
        undervalPct,
      },
      liveFairGated: false,
    };
  }, [data, inds, currentPrice, fairMeta]);

  const { yDomain, volFrac } = useMemo(() => {
    if (!data.length) return { yDomain: [0, 1] as [number, number], volFrac: 0.16 };
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
      if (inds.has('fair') && d.fv != null) { if (d.fv < min) min = d.fv; if (d.fv > max) max = d.fv; }
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
    const hi = Math.ceil((max + pad) / 10) * 10;
    const lo = Math.floor((min - pad) / 10) * 10;
    const domMin = Math.max(0, (lo - 0.16 * hi) / 0.84);
    const volFrac = Math.max(0, Math.min(0.4, (lo - domMin) / (hi - domMin)));
    return { yDomain: [domMin, hi] as [number, number], volFrac };
  }, [data, inds, hiLo52, bmActive]);

  const bmDelta = useMemo(() => {
    if (!bmActive || !data.length) return null;
    const last = [...data].reverse().find((d) => d.bmPct != null && d.chgPct != null);
    if (!last) return null;
    return { ticker: last.chgPct!, bm: last.bmPct!, label: bmLabel };
  }, [data, bmActive, bmLabel]);

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

  const maDistances = useMemo(() => {
    const last = data[data.length - 1];
    if (!last) return null;
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
    const headline = currentPrice ?? last.c;
    const changePct = currentChangePct ?? periodChangePct;
    return { last: last.c, date: last.date, headline, changePct, up: changePct >= 0 };
  }, [data, currentPrice, currentChangePct]);

  const showVolSpike = inds.has('volspike');
  const renderCandleShape = useCallback(
    (props: { x?: number; width?: number; payload?: ChartPoint; index?: number }) => (
      <CandleShape
        key={props.payload?.t ?? props.index}
        {...(props.x !== undefined ? { x: props.x } : {})}
        {...(props.width !== undefined ? { width: props.width } : {})}
        {...(props.payload !== undefined ? { payload: props.payload } : {})}
        volFrac={volFrac}
        maxVolume={maxVolume}
        showVolSpike={showVolSpike}
        fallbackDomain={yDomain}
        fallbackPlotHeight={(narrow ? 340 : 420) - 8 - 54}
      />
    ),
    [volFrac, maxVolume, showVolSpike, yDomain, narrow],
  );

  const renderFairDot = useCallback((props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload?.fvChanged || payload?.fv == null) {
      return <g key={payload?.t ?? cx ?? 0} />;
    }
    return (
      <circle
        key={payload.t}
        cx={cx}
        cy={cy}
        r={3.2}
        fill={FAIR_COLOR}
        stroke="#fff"
        strokeWidth={1.2}
      />
    );
  }, []);

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
    <div className="min-w-0">
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

      <PriceChartHeaderToolbar
        ticker={ticker}
        mode={mode}
        metric={metric}
        activeMetric={activeMetric}
        valStats={valStats}
        peHeadline={peHeadline}
        fwdPeAsOf={fwdPeAsOf}
        stats={stats}
        currentPrice={currentPrice}
        currentChangePct={currentChangePct}
        changeLabel={changeLabel}
        activePeriod={activePeriod}
        periodChoices={periodChoices}
        bmActive={bmActive}
        bmSym={bmSym}
        bmLabel={bmLabel}
        benchmarkChoices={benchmarkChoices}
        inds={inds}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        menuWrapRef={menuWrapRef}
        drawTool={drawTool}
        setDrawTool={setDrawTool}
        drawingsCount={drawings.length}
        drawDirty={drawDirty}
        drawSave={drawSave}
        loggedIn={loggedIn}
        saveToAccount={saveToAccount}
        clearDrawings={clearDrawings}
        fairPremium={fairPremium}
        fvInfoAnchor={fvInfoAnchor}
        toggleFvInfo={toggleFvInfo}
        animatedSet={animatedSet}
        setMode={setMode}
        setMetric={setMetric}
        setPeriod={setPeriod}
        setPeBrush={setPeBrush}
        setPeEpoch={setPeEpoch}
        setBmSym={setBmSym}
        toggleInd={toggleInd}
      />

      {renderFvBreakdown('top', mode === 'price', bmActive, inds.has('fair'), fairPremium, fairMeta, liveFairGated)}

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
            <Brush
              dataKey="date"
              height={26}
              stroke={PE_LINE}
              travellerWidth={8}
              startIndex={pePeriodStart}
              endIndex={Math.max(0, metricSeries.length - 1)}
              onChange={(b: { startIndex?: number; endIndex?: number } | null) => {
                if (b?.startIndex != null && b?.endIndex != null) {
                  setPeBrush({ startIndex: b.startIndex, endIndex: b.endIndex });
                }
              }}
              tickFormatter={(v: unknown) => (typeof v === 'string' && v.includes('-') ? formatXTick(v) : '')}
            >
              <AreaChart>
                <Area type="monotone" dataKey={activeMetric.field} stroke={PE_LINE} strokeWidth={1} fill={PE_LINE} fillOpacity={0.15} isAnimationActive={false} dot={false} activeDot={false} />
              </AreaChart>
            </Brush>
          </ComposedChart>
        </ResponsiveContainer>
        {peHeadline && peHeadline.peLive != null && (
          <div className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
            {metric === 'peFwd' ? (
              <>
                NTM P/E (realized) = close ÷ next 4 quarters&apos; reported EPS
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
      <PriceReadoutStrip
        ref={readoutRef}
        data={data}
        hd={data[data.length - 1]}
        ticker={ticker}
        bmActive={bmActive}
        bmLabel={bmLabel}
        inds={inds}
        medianPe={peStats?.median ?? null}
      />
      <ResponsiveContainer width="100%" height={narrow ? 340 : 420}>
        <ComposedChart data={data} syncId="pmp-price" margin={{ top: 8, right: narrow ? 4 : 16, left: narrow ? 0 : 8, bottom: 24 }}
          onMouseMove={(s: { activeTooltipIndex?: unknown }) => readoutRef.current?.setHoverIndex(typeof s?.activeTooltipIndex === 'number' ? s.activeTooltipIndex : null)}
          onMouseLeave={() => readoutRef.current?.setHoverIndex(null)}>
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
          <Tooltip
            content={() => null}
            cursor={{ fill: 'rgba(148,163,184,0.12)' }}
            isAnimationActive={false}
          />
          {!bmActive && inds.has('fair') && <FairValueZoneLayer data={data} />}
          {!bmActive && (
          <Bar
            dataKey="c"
            isAnimationActive={false}
            shape={renderCandleShape}
          />
          )}
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
          {!bmActive && inds.has('fair') && (
            <Line
              type="stepAfter"
              dataKey="fv"
              stroke={FAIR_COLOR}
              strokeWidth={2}
              strokeDasharray="5 3"
              isAnimationActive={false}
              connectNulls={false}
              dot={renderFairDot}
            />
          )}
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

      {mode === 'price' && !bmActive && (inds.has('rsi') || inds.has('macd')) && (
        <PriceOscillatorPanes data={data} narrow={narrow} showRsi={inds.has('rsi')} showMacd={inds.has('macd')} />
      )}

      {drawActive && drawTool && (
        <div className="mt-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
          {TOOL_HINT[drawTool]} · Esc to cancel
        </div>
      )}

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

      {mode === 'price' && !bmActive && fairPremium && (
        <div className="mt-2 text-xs flex items-center gap-x-2.5 gap-y-1 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: FAIR_COLOR }} />
            <span className="font-medium text-gray-700 dark:text-gray-200 tabular-nums">
              Fair value {formatFairDollar(fairPremium.fair)}
            </span>
          </span>
          <span
            className={`px-2 py-0.5 rounded font-semibold tabular-nums ${
              Math.abs(fairPremium.undervalPct) < 1
                ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                : fairPremium.undervalPct > 0
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
            }`}
          >
            {formatFairStatus(fairPremium.undervalPct)}
          </span>
          {fairPremium.bear != null && fairPremium.bull != null && (
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">
              (bear {formatFairDollar(fairPremium.bear)} – bull {formatFairDollar(fairPremium.bull)})
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: UP, opacity: 0.35 }} />
            Below = Buy
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: DOWN, opacity: 0.3 }} />
            Above = Sell
          </span>
          {fairPremium.method && (
            <button
              type="button"
              onClick={() => toggleFvInfo('bottom')}
              aria-expanded={fvInfoAnchor === 'bottom'}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors cursor-pointer"
              title="Show Fair Value calculation details"
            >
              {FAIR_METHOD_LABEL[fairPremium.method]} {fvInfoAnchor === 'bottom' ? '▴' : '▾'}
            </button>
          )}
        </div>
      )}
      {mode === 'price' && !bmActive && inds.has('fair') && !fairPremium && (fairMeta?.gated || liveFairGated) && (
        <div className="mt-2 text-xs flex items-center gap-1.5 flex-wrap text-gray-500 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span>Fair value hidden — outside reliable range vs price (distorted earnings or extreme multiple).</span>
          <button
            type="button"
            onClick={() => toggleFvInfo('bottom')}
            aria-expanded={fvInfoAnchor === 'bottom'}
            className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            How it&apos;s calculated {fvInfoAnchor === 'bottom' ? '▴' : '▾'}
          </button>
        </div>
      )}
      {renderFvBreakdown('bottom', mode === 'price', bmActive, inds.has('fair'), fairPremium, fairMeta, liveFairGated)}

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
        {mode === 'price' && !bmActive && inds.has('fair') && (fairPremium || fairMeta) && (
          <>
            {' '}Fair value = 50% trailing 5Y historical multiple (growth-capped P/E or P/S) + 50%
            10Y FCF DCF (10% discount, faded to 3%; financials use multiple only); green/red zone = price below/above fair value.
            Point-in-time: steps and dots mark new financial statements, not market moves.
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

      {similar && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          <SimilarChips label="Similar cap" dim="market_cap" items={similar.market_cap} from={ticker} />
          <SimilarChips label={nav?.sector.label ?? 'Sector'} dim="sector" items={similar.sector} from={ticker} />
          <SimilarChips label={nav?.industry.label ?? 'Industry'} dim="industry" items={similar.industry} from={ticker} />
        </div>
      )}
    </div>
  );
}

export default PriceCandlestickChart;
