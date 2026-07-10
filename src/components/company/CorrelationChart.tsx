"use client";

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface HistoryPoint { date: string; price: number; }
interface ImpliedPoint { date: string; impliedPrice: number; isForecast?: boolean; }

interface CorrelationChartProps {
  priceHistory: HistoryPoint[];
  impliedPS: ImpliedPoint[];
  impliedPE: ImpliedPoint[];
  corrPS: number | null;
  corrPE: number | null;
}

type Mode = 'ps' | 'pe';

function formatDateTick(v: string | unknown) {
  if (typeof v === 'string') return v.slice(0, 7);
  return String(v || '');
}

function formatYAxis(v: number) {
  return `$${v.toFixed(0)}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-800 dark:text-gray-100 font-semibold">{p.name}:</span>
          <span className="font-mono">${p.value?.toFixed?.(2)}</span>
        </div>
      ))}
    </div>
  );
}

function buildForecast(points: { date: string; impliedPrice: number }[], periods = 8) {
  if (points.length < 2) return [];
  const data = points.slice(-periods);
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i]!.impliedPrice;
    sumXY += i * data[i]!.impliedPrice;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return [];
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  // predict next 6 points
  const forecast: { date: string; impliedPrice: number; isForecast: boolean }[] = [];
  const lastDate = new Date(data[data.length - 1]!.date);
  for (let i = 1; i <= 6; i++) {
    const idx = n - 1 + i;
    const price = intercept + slope * idx;
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i * 7); // weekly step
    forecast.push({ date: d.toISOString().slice(0, 10), impliedPrice: price, isForecast: true });
  }
  return forecast;
}

export function CorrelationChart({ priceHistory, impliedPS, impliedPE, corrPS, corrPE }: CorrelationChartProps) {
  const [mode, setMode] = useState<Mode>('ps');

  const { mergedData, correlation, label } = useMemo(() => {
    const implied = mode === 'ps' ? impliedPS : impliedPE;
    const corr = mode === 'ps' ? corrPS : corrPE;

    const priceMap = new Map(priceHistory.map(p => [p.date, p.price]));
    const merged = implied
      .map(pt => ({ date: pt.date, impliedPrice: pt.impliedPrice, price: priceMap.get(pt.date), isForecast: pt.isForecast }))
      .filter(d => typeof d.price === 'number' || d.isForecast);

    const forecast = buildForecast(merged.filter(m => !m.isForecast && typeof m.price === 'number'), 8);
    const combined = [...merged, ...forecast];

    return {
      mergedData: combined,
      correlation: corr,
      label: mode === 'ps' ? 'Implied Price (P/S)' : 'Implied Price (P/E)',
    };
  }, [mode, impliedPS, impliedPE, priceHistory, corrPS, corrPE]);

  if (!mergedData.length) {
    return <div className="text-center text-gray-400 text-sm py-10">No correlation data available.</div>;
  }

  const corrColor = correlation !== null
    ? correlation > 0.7 ? 'text-green-600 dark:text-green-400'
    : correlation > 0.4 ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-gray-500 dark:text-gray-400'
    : 'text-gray-400';
  const corrLabel = correlation !== null
    ? correlation > 0.7 ? 'Strong' : correlation > 0.4 ? 'Moderate' : 'Weak'
    : 'n/a';

  return (
    <div className="space-y-3">
      {/* Explanation */}
      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
        Compares actual price to implied price derived from {mode === 'ps' ? 'revenue per share × median P/S multiple' : 'EPS × median P/E multiple'}. 
        High correlation means the market prices this stock based on {mode === 'ps' ? 'revenue' : 'earnings'}.
      </p>

      {/* Controls + Correlation Badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex">
          {([
            ['ps', 'Price vs Revenue'],
            ['pe', 'Price vs EPS'],
          ] as const).map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`text-[10px] px-3 py-1 rounded font-medium transition-colors ${
                mode === id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <span className={`ml-auto text-xs font-semibold ${corrColor}`}>
          Correlation: {correlation !== null ? `${(correlation * 100).toFixed(0)}%` : 'n/a'} <span className="opacity-70">({corrLabel})</span>
        </span>
      </div>

      <div className="w-full bg-white dark:bg-gray-900 rounded-lg p-3" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={mergedData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={formatDateTick} angle={-30} textAnchor="end" height={40} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={48} tickFormatter={formatYAxis} domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />

            <Area
              type="monotone"
              dataKey="impliedPrice"
              name={label}
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.12}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="price"
              name="Actual Price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              connectNulls
            />

            {/* Forecast shading */}
            <Area
              type="monotone"
              dataKey={(d: any) => (d.isForecast ? d.impliedPrice : null)}
              name="Forecast"
              stroke="#fbbf24"
              fill="#fbbf24"
              fillOpacity={0.18}
              strokeWidth={1}
              strokeDasharray="4 4"
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
