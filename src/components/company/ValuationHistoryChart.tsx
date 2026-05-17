"use client";

import React from 'react';
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

type ValuationPoint = {
  date: string;
  price: number;
  intrinsic: number;
  undervaluationPct: number;
};

interface ValuationHistoryChartProps {
  valuationHistory: ValuationPoint[];
  summary?: {
    currentUndervaluation: number | null;
    avg5yUndervaluation: number | null;
    intrinsicCagr: number | null;
  } | null;
}

function formatPct(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const price = payload.find((p: any) => p.dataKey === 'price');
  const intrinsic = payload.find((p: any) => p.dataKey === 'intrinsic');
  const uv = payload.find((p: any) => p.dataKey === 'undervaluationPct');
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow text-xs">
      <div className="text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      {price && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" />Price: <span className="font-mono">${price.value.toFixed(2)}</span></div>}
      {intrinsic && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-500" />Intrinsic: <span className="font-mono">${intrinsic.value.toFixed(2)}</span></div>}
      {uv && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />Undervaluation: <span className="font-mono">{uv.value.toFixed(1)}%</span></div>}
    </div>
  );
}

export function ValuationHistoryChart({ valuationHistory, summary }: ValuationHistoryChartProps) {
  if (!valuationHistory?.length) {
    return <div className="text-center text-gray-400 text-sm py-10">No valuation data available.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-200 px-3 py-1 rounded-full font-medium">
          Current: {formatPct(summary?.currentUndervaluation)} undervalued
        </span>
        <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 px-3 py-1 rounded-full font-medium">
          5Y avg: {formatPct(summary?.avg5yUndervaluation)} undervalued
        </span>
        <span className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 px-3 py-1 rounded-full font-medium">
          Intrinsic CAGR: {formatPct(summary?.intrinsicCagr)}
        </span>
      </div>

      <div className="w-full bg-white dark:bg-gray-900 rounded-lg p-3" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={valuationHistory} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={38} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={48} tickFormatter={v => `$${v.toFixed(0)}`} domain={['auto', 'auto']} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52} tickFormatter={v => `${v.toFixed(0)}%`} domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />

            <Area
              yAxisId="left"
              type="monotone"
              dataKey="price"
              name="Price"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.08}
              dot={false}
              strokeWidth={2}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="intrinsic"
              name="Intrinsic Value"
              stroke="#4b5563"
              strokeDasharray="4 2"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="undervaluationPct"
              name="Undervaluation %"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ValuationHistoryChart;
