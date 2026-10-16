"use client";

import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { CHART_FONT } from '@/components/charts/chartTheme';
import { ChartBody, ChartControls, ChartPlot, ChartFootnote } from './shared/ChartFrame';
import type { RatioStats } from './analysis/types';

type ValuationPoint = {
  date: string;
  price: number;
  intrinsic: number;
  undervaluationPct: number | null;
  isForecast?: boolean;
};

type MetricMode = 'auto' | 'pe' | 'ps';

const PERIODS = [
  { id: '1y', label: '1Y', years: 1 },
  { id: '3y', label: '3Y', years: 3 },
  { id: '5y', label: '5Y', years: 5 },
] as const;
type PeriodId = typeof PERIODS[number]['id'];

interface ValuationHistoryChartProps {
  valuationHistory: ValuationPoint[];
  valuationHistoryPE?: ValuationPoint[];
  valuationHistoryPS?: ValuationPoint[];
  valuationForecast?: { date: string; intrinsic: number }[];
  valuationForecastPE?: { date: string; intrinsic: number }[];
  valuationForecastPS?: { date: string; intrinsic: number }[];
  summary?: {
    currentUndervaluation: number | null;
    avg5yUndervaluation: number | null;
    intrinsicCagr: number | null;
  } | null;
  summaryPE?: {
    currentUndervaluation: number | null;
    avg5yUndervaluation: number | null;
    intrinsicCagr: number | null;
  } | null;
  summaryPS?: {
    currentUndervaluation: number | null;
    avg5yUndervaluation: number | null;
    intrinsicCagr: number | null;
  } | null;
  stats?: { pe: RatioStats | null; ps: RatioStats | null } | null;
  trendSignal?: {
    qualified: boolean;
    revG1y: number | null;
    epsG1y: number | null;
    pctOfHigh: number | null;
  } | null;
  ticker?: string;
}

function fmtDollar(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return 'n/a';
  return `$${v.toFixed(2)}`;
}

// ── Tick label formatter ────────────────────────────────────────────────────
function formatXTick(dateStr: string | unknown) {
  if (typeof dateStr !== 'string' || !dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const price = typeof point?.price === 'number'
    ? point.price
    : payload.find((p: any) => p.dataKey === 'priceGreen' || p.dataKey === 'priceRed')?.value;
  const intrinsic = typeof point?.intrinsic === 'number'
    ? point.intrinsic
    : payload.find((p: any) => p.dataKey === 'intrinsic')?.value;

  const undervalued = typeof price === 'number' && typeof intrinsic === 'number' && intrinsic > 0
    ? ((intrinsic - price) / intrinsic) * 100
    : null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-xs min-w-[160px]">
      <div className="text-gray-500 dark:text-gray-400 mb-2 font-medium">{label}</div>
      {typeof price === 'number' && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
            <span className="w-2 h-2 rounded-full" style={{ background: undervalued != null && undervalued > 0 ? '#10b981' : '#ef4444' }} />
            Price
          </span>
          <span className="font-mono font-semibold">{fmtDollar(price)}</span>
        </div>
      )}
      {typeof intrinsic === 'number' && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            Intrinsic
          </span>
          <span className="font-mono font-semibold">{fmtDollar(intrinsic)}</span>
        </div>
      )}
      {undervalued != null ? (
        <div className={`mt-1.5 text-center text-[10px] font-bold rounded px-2 py-0.5 ${undervalued > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
          {undervalued > 0 ? `${undervalued.toFixed(0)}% UNDERVALUED` : `${Math.abs(undervalued).toFixed(0)}% OVERVALUED`}
        </div>
      ) : point?.isForecast ? (
        <div className="mt-1.5 text-center text-[10px] font-bold rounded px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          PROJECTED INTRINSIC
        </div>
      ) : (
        <div className="mt-1.5 text-center text-[10px] font-bold rounded px-2 py-0.5 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          N/A (insufficient data)
        </div>
      )}
    </div>
  );
}

// ── Log-scale helpers ───────────────────────────────────────────────────────
function logTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= lo && v <= hi) ticks.push(v);
    }
  }
  return ticks;
}

// ── Split price line into colored segments ──────────────────────────────────
function splitPriceByRelation(data: ValuationPoint[]) {
  const green: (number | null)[] = [];
  const red: (number | null)[] = [];
  let prevUnder: boolean | null = null;

  data.forEach((d, i) => {
    if (d.isForecast || d.intrinsic <= 0 || typeof d.price !== 'number') {
      green.push(null);
      red.push(null);
      prevUnder = null;
      return;
    }
    const isUnder = d.price <= d.intrinsic;
    green.push(isUnder ? d.price : null);
    red.push(!isUnder ? d.price : null);
    // Bridge the crossing point so the line never leaves a 1-week gap when
    // switching between green (undervalued) and red (overvalued).
    if (prevUnder !== null && prevUnder !== isUnder && i > 0) {
      if (isUnder) red[i] = d.price;
      else green[i] = d.price;
    }
    prevUnder = isUnder;
  });

  return { green, red };
}

// ── Build band data for GuruFocus-style valuation zones ─────────────────────
// Each zone is a [low, high] range tuple so Recharts shades only that slice
// between 0.70× and 1.30× intrinsic instead of filling every Area down to y=0.
function buildBands(data: ValuationPoint[]) {
  return data.map(d => {
    const iv = d.intrinsic > 0 ? d.intrinsic : 0;
    return {
      sigOver: iv > 0 ? iv * 1.30 : null,
      sigUnder: iv > 0 ? iv * 0.70 : null,
      sigOverBand: iv > 0 ? [iv * 1.10, iv * 1.30] as [number, number] : null,
      modestOverBand: iv > 0 ? [iv, iv * 1.10] as [number, number] : null,
      modestUnderBand: iv > 0 ? [iv * 0.90, iv] as [number, number] : null,
      sigUnderBand: iv > 0 ? [iv * 0.70, iv * 0.90] as [number, number] : null,
    };
  });
}

// Subdivide quarterly forecast points into monthly steps (~3 per quarter = 18
// points over 1.5 years) so the Forecast zone has readable width on Recharts'
// categorical X-axis instead of compressing 6 quarters into 6 weekly slots.
function expandForecastMonthly(
  lastHist: ValuationPoint | undefined,
  forecast: { date: string; intrinsic: number }[],
): ValuationPoint[] {
  if (!forecast.length) return [];
  const out: ValuationPoint[] = [];
  let prevDateMs = lastHist ? new Date(lastHist.date).getTime() : null;
  let prevIv = lastHist && lastHist.intrinsic > 0 ? lastHist.intrinsic : null;

  for (const f of forecast) {
    const targetMs = new Date(f.date).getTime();
    if (prevDateMs != null && prevIv != null && targetMs > prevDateMs) {
      for (const step of [1, 2]) {
        const t = step / 3;
        const ms = prevDateMs + (targetMs - prevDateMs) * t;
        const iv = parseFloat((prevIv + (f.intrinsic - prevIv) * t).toFixed(2));
        out.push({
          date: new Date(ms).toISOString().slice(0, 10),
          price: null as unknown as number,
          intrinsic: iv,
          undervaluationPct: null,
          isForecast: true,
        });
      }
    }
    out.push({
      date: f.date,
      price: null as unknown as number,
      intrinsic: f.intrinsic,
      undervaluationPct: null,
      isForecast: true,
    });
    prevDateMs = targetMs;
    prevIv = f.intrinsic;
  }
  return out;
}

// ── Badge ──────────────────────────────────────────────────────────────────
function Badge({
  label,
  value,
  color,
  compact,
  title,
}: {
  label: string;
  value: string;
  color: 'green' | 'blue' | 'amber' | 'red' | 'gray';
  compact?: boolean;
  title?: string;
}) {
  const cls = {
    green: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    gray: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  }[color];

  return (
    <div title={title} className={`flex items-center gap-1.5 rounded-full border font-medium ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-xs'} ${cls}`}>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

// ── Metric Toggle Button ───────────────────────────────────────────────────
function MetricToggle({
  mode,
  autoBasis,
  onChange,
}: {
  mode: MetricMode;
  autoBasis: 'pe' | 'ps';
  onChange: (m: MetricMode) => void;
}) {
  const options: { key: MetricMode; label: string }[] = [
    { key: 'auto', label: `Auto (${autoBasis.toUpperCase()})` },
    { key: 'pe', label: 'P/E' },
    { key: 'ps', label: 'P/S' },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shrink-0">
      {options.map(opt => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors ${
            mode === opt.key
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export function ValuationHistoryChart({
  valuationHistory,
  valuationHistoryPE,
  valuationHistoryPS,
  valuationForecast = [],
  valuationForecastPE = [],
  valuationForecastPS = [],
  summary,
  summaryPE,
  summaryPS,
  stats,
  trendSignal,
  ticker,
}: ValuationHistoryChartProps) {
  const [metricMode, setMetricMode] = useState<MetricMode>('auto');
  const [period, setPeriod] = useState<PeriodId>('5y');

  // Identify which single model Auto selected (matches historyResponse.ts)
  const autoBasis: 'pe' | 'ps' = useMemo(() => {
    const peLast = valuationHistoryPE?.[valuationHistoryPE.length - 1];
    const psLen = valuationHistoryPS?.length ?? 0;
    const peLen = valuationHistoryPE?.length ?? 0;
    if (peLast?.undervaluationPct != null && peLen >= Math.min(26, Math.ceil(psLen * 0.4))) {
      return 'pe';
    }
    return psLen > 0 ? 'ps' : 'pe';
  }, [valuationHistoryPE, valuationHistoryPS]);

  const effectiveBasis: 'pe' | 'ps' = metricMode === 'auto' ? autoBasis : metricMode;

  // Select full history based on metric mode
  const rawActiveHistory = useMemo(() => {
    if (effectiveBasis === 'pe') return valuationHistoryPE ?? valuationHistory;
    return valuationHistoryPS ?? valuationHistory;
  }, [effectiveBasis, valuationHistory, valuationHistoryPE, valuationHistoryPS]);

  const availablePeriods = useMemo(() => {
    if (!rawActiveHistory?.length) return PERIODS;
    const oldest = new Date(rawActiveHistory[0]!.date);
    const newest = new Date(rawActiveHistory[rawActiveHistory.length - 1]!.date);
    const yearsAvailable = (newest.getTime() - oldest.getTime()) / (365 * 24 * 60 * 60 * 1000);
    const filtered = PERIODS.filter(p => p.years <= yearsAvailable + 0.5);
    return filtered.length > 0 ? filtered : PERIODS;
  }, [rawActiveHistory]);

  useEffect(() => {
    if (availablePeriods.length > 0 && !availablePeriods.find(p => p.id === period)) {
      setPeriod(availablePeriods[availablePeriods.length - 1]!.id);
    }
  }, [availablePeriods, period]);

  const activeHistory = useMemo(() => {
    if (!rawActiveHistory?.length) return [];
    const periodYears = PERIODS.find(p => p.id === period)?.years ?? 5;
    const latestDateStr = rawActiveHistory[rawActiveHistory.length - 1]!.date;
    const cutoff = new Date(latestDateStr);
    cutoff.setFullYear(cutoff.getFullYear() - periodYears);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return rawActiveHistory.filter(d => d.date >= cutoffStr);
  }, [rawActiveHistory, period]);

  const activeForecast = useMemo(() => {
    if (effectiveBasis === 'pe') return valuationForecastPE ?? valuationForecast;
    return valuationForecastPS ?? valuationForecast;
  }, [effectiveBasis, valuationForecast, valuationForecastPE, valuationForecastPS]);

  const activeSummary = useMemo(() => {
    const baseSummary = effectiveBasis === 'pe' ? (summaryPE ?? summary) : (summaryPS ?? summary);
    if (period === '5y' && baseSummary) return baseSummary;
    const valid = activeHistory.filter(v => v.undervaluationPct !== null);
    const lastPt = activeHistory[activeHistory.length - 1];
    const currentUndervaluation = lastPt?.undervaluationPct ?? null;
    const avg5yUndervaluation = valid.length
      ? parseFloat((valid.reduce((a, b) => a + (b.undervaluationPct ?? 0), 0) / valid.length).toFixed(2))
      : null;
    const intrinsicCagr = valid.length >= 2
      ? (() => {
          const start = valid[0]!.intrinsic;
          const end = valid[valid.length - 1]!.intrinsic;
          const years = Math.max(
            0.5,
            (new Date(valid[valid.length - 1]!.date).getTime() - new Date(valid[0]!.date).getTime()) /
              (365 * 24 * 60 * 60 * 1000)
          );
          if (start <= 0 || end <= 0) return null;
          return parseFloat(((Math.pow(end / start, 1 / years) - 1) * 100).toFixed(2));
        })()
      : null;
    return { currentUndervaluation, avg5yUndervaluation, intrinsicCagr };
  }, [effectiveBasis, period, activeHistory, summary, summaryPE, summaryPS]);

  const expandedForecast = useMemo(
    () => expandForecastMonthly(activeHistory[activeHistory.length - 1], activeForecast ?? []),
    [activeHistory, activeForecast]
  );

  const allData = useMemo(
    () => [...activeHistory, ...expandedForecast],
    [activeHistory, expandedForecast]
  );

  const { green, red } = useMemo(() => splitPriceByRelation(allData), [allData]);
  const bands = useMemo(() => buildBands(allData), [allData]);

  // Y domain over all rendered series (price + band edges) — log scale needs
  // an explicit positive domain; 'auto' with log produces degenerate bounds.
  const { yDomain, yTicks, useLog } = useMemo(() => {
    const values: number[] = [];
    allData.forEach((d, i) => {
      if (typeof d.price === 'number' && d.price > 0) values.push(d.price);
      if (d.intrinsic > 0) values.push(d.intrinsic);
      const b = bands[i];
      if (b) for (const v of [b.sigOver, b.sigUnder]) if (v != null && v > 0) values.push(v);
    });
    if (values.length < 2) return { yDomain: ['auto', 'auto'] as const, yTicks: undefined, useLog: false };
    const lo = Math.min(...values) * 0.85;
    const hi = Math.max(...values) * 1.05;
    const wide = hi / lo > 3;
    if (!wide) return { yDomain: [Math.max(0, lo), hi] as const, yTicks: undefined, useLog: false };
    const ticks = logTicks(lo, hi);
    return { yDomain: [lo, hi] as const, yTicks: ticks.length >= 2 ? ticks : undefined, useLog: true };
  }, [allData, bands]);

  const chartData = useMemo(() =>
    allData.map((d, i) => ({
      ...d,
      priceGreen: green[i],
      priceRed: red[i],
      sigOver: bands[i]!.sigOverBand,
      modestOver: bands[i]!.modestOverBand,
      modestUnder: bands[i]!.modestUnderBand,
      sigUnder: bands[i]!.sigUnderBand,
    })),
    [allData, green, red, bands]
  );

  if (!valuationHistory?.length) {
    return <div className="text-center text-gray-500 text-sm py-10">No valuation data available.</div>;
  }

  if (!activeHistory?.length) {
    return (
      <div className="text-center text-gray-500 text-sm py-10">
        No {effectiveBasis === 'pe' ? 'P/E' : 'P/S'} valuation data available. Try switching to {effectiveBasis === 'pe' ? 'P/S' : 'P/E'} or Auto mode.
      </div>
    );
  }

  const last = activeHistory[activeHistory.length - 1]!;
  const currentUv = activeSummary?.currentUndervaluation ?? last?.undervaluationPct ?? null;
  const avgUv = activeSummary?.avg5yUndervaluation ?? null;
  const cagr = activeSummary?.intrinsicCagr ?? null;
  const medianMult = effectiveBasis === 'pe' ? stats?.pe?.median : stats?.ps?.median;
  const periodLabel = PERIODS.find(p => p.id === period)?.label ?? '5Y';

  // Determine verdict
  const isUndervalued = currentUv != null && currentUv > 5;
  const isSignificantlyOvervalued = currentUv != null && currentUv <= -50;
  const isFairValue = currentUv != null && Math.abs(currentUv) <= 5;
  const isCheaperThanAvg = avgUv != null && currentUv != null && currentUv > avgUv;

  const verdict = currentUv == null
    ? 'N/A'
    : isFairValue
    ? 'Fair Value'
    : isUndervalued
    ? isCheaperThanAvg
      ? 'Very Attractive'
      : 'Attractive'
    : isSignificantlyOvervalued
    ? 'Significantly Overvalued'
    : 'Overvalued';

  const headlineColor = isUndervalued
    ? 'bg-emerald-500'
    : isFairValue
    ? 'bg-gray-400'
    : isSignificantlyOvervalued
    ? 'bg-red-600'
    : 'bg-amber-500';

  const statusBadgeColor: 'green' | 'blue' | 'amber' | 'red' | 'gray' =
    currentUv == null
      ? 'gray'
      : isUndervalued
      ? 'green'
      : isFairValue
      ? 'gray'
      : isSignificantlyOvervalued
      ? 'red'
      : 'amber';

  return (
    <ChartBody>
      {/* Controls — metric mode + period + active formula */}
      <ChartControls>
        <MetricToggle mode={metricMode} autoBasis={autoBasis} onChange={setMetricMode} />
        <div className="flex gap-1 shrink-0">
          {availablePeriods.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`text-[10px] px-2.5 py-1 rounded font-medium transition-colors ${
                period === p.id
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-auto truncate">
          {effectiveBasis === 'pe'
            ? `Intrinsic = TTM EPS × ${medianMult != null ? `${medianMult.toFixed(1)}×` : 'Med'} P/E`
            : `Intrinsic = TTM Rev/sh × ${medianMult != null ? `${medianMult.toFixed(1)}×` : 'Med'} P/S`}
        </span>
      </ChartControls>

      {/* Chart */}
      <ChartPlot className="bg-white dark:bg-gray-900 rounded-xl">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
            <defs>
              <linearGradient id="overGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="underGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.04} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.14} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700/60" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatXTick}
              angle={-20}
              textAnchor="end"
              height={40}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
              scale={useLog ? 'log' : 'auto'}
              tickFormatter={v => `$${v.toFixed(0)}`}
              domain={yDomain as [number, number] | ['auto', 'auto']}
              {...(yTicks ? { ticks: yTicks } : {})}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Forecast zone reference */}
            {expandedForecast.length > 0 && (
              <ReferenceLine
                x={expandedForecast[0]!.date}
                stroke="#9ca3af"
                strokeDasharray="4 2"
                label={{ value: 'Forecast →', position: 'insideTopRight', fontSize: CHART_FONT.annotation, fill: '#9ca3af' }}
              />
            )}

            {/* GuruFocus-style valuation bands ([low, high] slices) */}
            <Area
              type="monotone"
              dataKey="sigOver"
              stroke="none"
              fill="url(#overGrad)"
              connectNulls
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="modestOver"
              stroke="none"
              fill="#ef4444"
              fillOpacity={0.06}
              connectNulls
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="modestUnder"
              stroke="none"
              fill="#10b981"
              fillOpacity={0.05}
              connectNulls
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="sigUnder"
              stroke="none"
              fill="url(#underGrad)"
              connectNulls
              isAnimationActive={false}
            />

            {/* Intrinsic Value — dashed gray */}
            <Line
              type="monotone"
              dataKey="intrinsic"
              name="Intrinsic Value"
              stroke="#9ca3af"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {/* Price — green when undervalued */}
            <Line
              type="monotone"
              dataKey="priceGreen"
              name="Price (undervalued)"
              stroke="#10b981"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              legendType="none"
              isAnimationActive={false}
            />

            {/* Price — red when overvalued */}
            <Line
              type="monotone"
              dataKey="priceRed"
              name="Price (overvalued)"
              stroke="#ef4444"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              legendType="none"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartPlot>

      <ChartFootnote>
        {/* Verdict — the card's conclusion, kept next to the summary badges */}
        <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-snug">
          <span className={`inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle ${currentUv == null ? 'bg-gray-300' : headlineColor}`} />
          {ticker && <strong>{ticker}</strong>} {currentUv == null
            ? `has insufficient ${effectiveBasis === 'pe' ? 'earnings' : 'revenue'} data for ${effectiveBasis.toUpperCase()}-based valuation.`
            : isFairValue
            ? `is trading close to its ${effectiveBasis.toUpperCase()}-implied intrinsic value (${fmtDollar(last?.intrinsic)}, within ±5%).`
            : isUndervalued
            ? `is trading ${Math.abs(currentUv).toFixed(0)}% below its ${effectiveBasis.toUpperCase()}-implied intrinsic value (${fmtDollar(last?.intrinsic)}).`
            : isSignificantlyOvervalued
            ? `is significantly overvalued — price exceeds ${effectiveBasis.toUpperCase()}-implied intrinsic value (${fmtDollar(last?.intrinsic)}) by ${Math.abs(currentUv).toFixed(0)}%.`
            : `is trading ${Math.abs(currentUv).toFixed(0)}% above its ${effectiveBasis.toUpperCase()}-implied intrinsic value (${fmtDollar(last?.intrinsic)}).`}
        </p>

        {/* Summary badges — compact single row */}
        <div className="flex flex-wrap gap-1.5">
          <Badge compact
            label="Intrinsic"
            value={fmtDollar(last?.intrinsic)}
            color="gray"
          />
          <Badge compact
            label="Price"
            value={fmtDollar(last?.price)}
            color={statusBadgeColor}
          />
          <Badge compact
            label="Verdict"
            value={verdict}
            color={verdict === 'Very Attractive' ? 'green' : verdict === 'Attractive' ? 'blue' : statusBadgeColor}
          />
          <Badge compact
            label="Current"
            value={currentUv != null ? `${Math.abs(currentUv).toFixed(0)}% ${isUndervalued ? 'undervalued' : isFairValue ? 'fair' : 'overvalued'}` : 'n/a'}
            color={statusBadgeColor}
          />
          {avgUv != null && (
            <Badge compact
              label={`${periodLabel} Avg`}
              value={`${Math.abs(avgUv).toFixed(0)}% ${avgUv > 0 ? 'underval.' : 'overval.'}`}
              color="blue"
            />
          )}
          {cagr != null && (
            <Badge compact
              label="Intrinsic CAGR"
              value={`${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%`}
              color={cagr >= 0 ? 'green' : 'amber'}
            />
          )}
          {trendSignal?.qualified && (
            <Badge compact
              label="Trend×Fund"
              value="Confirmed"
              color="green"
              title={`Backtested combo signal: Rev/sh ${trendSignal.revG1y != null ? (trendSignal.revG1y * 100).toFixed(0) + '%' : 'n/a'} 1Y · EPS ${trendSignal.epsG1y != null ? (trendSignal.epsG1y * 100).toFixed(0) + '%' : 'n/a'} · ${trendSignal.pctOfHigh != null ? (trendSignal.pctOfHigh * 100).toFixed(0) + '%' : 'n/a'} of 52w high`}
            />
          )}
        </div>

        {/* Legend + Forecast explanation */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 dark:text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Price &lt; Intrinsic</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Price &gt; Intrinsic</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-gray-400 inline-block" /> Intrinsic (±10% / ±30% bands)</span>
          {expandedForecast.length > 0 && (
            <span className="sm:ml-auto text-gray-400 dark:text-gray-600">
              Forecast: 6Q forward trend (±10%/Q clamp)
            </span>
          )}
        </div>
      </ChartFootnote>
    </ChartBody>
  );
}

export default ValuationHistoryChart;
