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
} from 'recharts';

interface Candle {
  t: number; // timestamp (ms)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface ChartPoint extends Candle {
  date: string; // ISO yyyy-mm-dd (category key)
}

interface PriceCandlestickChartProps {
  ticker: string;
}

const PERIODS = [
  { label: '1Y', years: 1 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
] as const;

type PeriodLabel = (typeof PERIODS)[number]['label'];

const UP = '#16a34a'; // green
const DOWN = '#dc2626'; // red

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
        <span className="text-right text-gray-700 dark:text-gray-300">{fmtVol(p.v)}</span>
      </div>
    </div>
  );
}


export function PriceCandlestickChart({ ticker }: PriceCandlestickChartProps) {
  const [allCandles, setAllCandles] = useState<Candle[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodLabel>('5Y');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/analysis/${ticker}/candles`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => {
        if (!mounted) return;
        setAllCandles(Array.isArray(json.candles) ? json.candles : []);
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

  const data: ChartPoint[] = useMemo(() => {
    if (!allCandles) return [];
    const years = PERIODS.find((p) => p.label === period)?.years ?? 5;
    const cutoff = Date.now() - years * 365.25 * 24 * 60 * 60 * 1000;
    return allCandles
      .filter((c) => c.t >= cutoff)
      .map((c) => ({ ...c, date: new Date(c.t).toISOString().slice(0, 10) }));
  }, [allCandles, period]);

  const yDomain = useMemo<[number, number]>(() => {
    if (!data.length) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const d of data) {
      if (d.l < min) min = d.l;
      if (d.h > max) max = d.h;
    }
    const pad = (max - min) * 0.06 || 1;
    return [Math.max(0, min - pad), max + pad];
  }, [data]);

  const stats = useMemo(() => {
    if (!data.length) return null;
    const first = data[0]!;
    const last = data[data.length - 1]!;
    const change = last.c - first.o;
    const changePct = first.o > 0 ? (change / first.o) * 100 : 0;
    return { last: last.c, changePct, up: change >= 0 };
  }, [data]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-72">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !data.length) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 italic py-12 text-center">
        {error ?? 'No price history available for this ticker.'}
      </div>
    );
  }

  return (
    <div>
      {/* Header: current price + period toggle */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {stats && (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              ${stats.last.toFixed(2)}
            </span>
            <span
              className={`text-sm font-semibold ${stats.up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {stats.changePct >= 0 ? '+' : ''}{stats.changePct.toFixed(2)}% ({period})
            </span>
          </div>
        )}
        <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5 gap-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPeriod(p.label)}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                period === p.label
                  ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
          <XAxis
            dataKey="date"
            scale="band"
            tickFormatter={formatXTick}
            minTickGap={40}
            tick={{ fontSize: 11, fill: 'currentColor' }}
            className="text-gray-400 dark:text-gray-500"
            tickLine={false}
            axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
          />
          <YAxis
            domain={yDomain}
            orientation="right"
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            tick={{ fontSize: 11, fill: 'currentColor' }}
            className="text-gray-400 dark:text-gray-500"
            tickLine={false}
            axisLine={false}
            width={52}
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
              const plotHeight = 340 - 8 - 4; // height - top - bottom
              
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
              
              // Volume bar (bottom 16%)
              const volTop = top + plotHeight * 0.84;
              const yBottom = top + plotHeight;
              const maxVol = Math.max(...data.map(pt => pt.v || 0), 1);
              const vH = maxVol > 0 ? ((d.v || 0) / maxVol) * (yBottom - volTop) : 0;
              
              // Bar width clamp
              const bodyW = Math.max(1, Math.min(width * 0.7, 14));
              
              return (
                <g key={d.t}>
                  {/* volume */}
                  <rect
                    x={cx - bodyW / 2}
                    y={yBottom - vH}
                    width={bodyW}
                    height={vH}
                    fill={color}
                    opacity={0.18}
                  />
                  {/* wick */}
                  <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
                  {/* body */}
                  <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
                </g>
              );
            }} 
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PriceCandlestickChart;
