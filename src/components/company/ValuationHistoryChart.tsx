"use client";

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';

type ValuationPoint = {
  date: string;
  price: number;
  intrinsic: number;
  undervaluationPct: number;
  isForecast?: boolean;
};

interface ValuationHistoryChartProps {
  valuationHistory: ValuationPoint[];
  valuationForecast?: { date: string; intrinsic: number }[];
  summary?: {
    currentUndervaluation: number | null;
    avg5yUndervaluation: number | null;
    intrinsicCagr: number | null;
  } | null;
  ticker?: string;
}

function fmt(v: number | null | undefined, decimals = 1) {
  if (v == null || Number.isNaN(v)) return 'n/a';
  return `${v.toFixed(decimals)}%`;
}

function fmtDollar(v: number) {
  return `$${v.toFixed(2)}`;
}

// ── Tick label formatter ────────────────────────────────────────────────────
function formatXTick(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const price = payload.find((p: any) => p.dataKey === 'price')?.value;
  const intrinsic = payload.find((p: any) => p.dataKey === 'intrinsic')?.value;

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
      {undervalued != null && (
        <div className={`mt-1.5 text-center text-[10px] font-bold rounded px-2 py-0.5 ${undervalued > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
          {undervalued > 0 ? `${undervalued.toFixed(0)}% UNDERVALUED` : `${Math.abs(undervalued).toFixed(0)}% OVERVALUED`}
        </div>
      )}
    </div>
  );
}

// ── Split price line into colored segments ──────────────────────────────────
// We render two Line series: one for green segments (price < intrinsic) and
// one for red segments (price >= intrinsic), using null to break each segment.
function splitPriceByRelation(data: ValuationPoint[]) {
  const green: (number | null)[] = [];
  const red: (number | null)[] = [];

  data.forEach(d => {
    if (d.isForecast) {
      green.push(null);
      red.push(null);
      return;
    }
    const isUnder = d.price <= d.intrinsic;
    green.push(isUnder ? d.price : null);
    red.push(!isUnder ? d.price : null);
  });

  return { green, red };
}

// ── Badge ──────────────────────────────────────────────────────────────────
function Badge({ label, value, color }: { label: string; value: string; color: 'green' | 'blue' | 'amber' | 'gray' }) {
  const cls = {
    green: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    gray: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  }[color];

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${cls}`}>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export function ValuationHistoryChart({
  valuationHistory,
  valuationForecast = [],
  summary,
  ticker,
}: ValuationHistoryChartProps) {
  const allData = useMemo(() => {
    const hist = valuationHistory ?? [];
    const fore = (valuationForecast ?? []).map(f => ({
      date: f.date,
      price: null as unknown as number,
      intrinsic: f.intrinsic,
      undervaluationPct: 0,
      isForecast: true,
    }));
    return [...hist, ...fore];
  }, [valuationHistory, valuationForecast]);

  const { green, red } = useMemo(() => splitPriceByRelation(allData), [allData]);

  const chartData = useMemo(() =>
    allData.map((d, i) => ({ ...d, priceGreen: green[i], priceRed: red[i] })),
    [allData, green, red]
  );

  if (!valuationHistory?.length) {
    return <div className="text-center text-gray-400 text-sm py-10">No valuation data available.</div>;
  }

  const last = valuationHistory[valuationHistory.length - 1]!;
  const currentUv = summary?.currentUndervaluation ?? last.undervaluationPct;
  const avg5y = summary?.avg5yUndervaluation;
  const cagr = summary?.intrinsicCagr;

  // Determine verdict
  const isUndervalued = currentUv > 0;
  const isCheaperThanAvg = avg5y != null && currentUv > avg5y;

  const verdict = isUndervalued
    ? isCheaperThanAvg
      ? 'Very Attractive'
      : 'Attractive'
    : 'Overvalued';

  const verdictColor = verdict === 'Very Attractive'
    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
    : verdict === 'Attractive'
    ? 'text-blue-600 dark:text-blue-400 font-bold'
    : 'text-red-500 dark:text-red-400 font-bold';

  const headlineColor = isUndervalued ? 'bg-gray-800 dark:bg-gray-200' : 'bg-red-500';

  return (
    <div className="space-y-4">
      {/* Headline */}
      <p className="text-sm text-gray-700 dark:text-gray-300">
        <span className={`inline-block w-3 h-3 rounded-sm mr-1.5 align-middle ${headlineColor}`} />
        {ticker && <strong>{ticker}</strong>} {isUndervalued
          ? `is cheaper now than it has been on average over the past 5 years.`
          : `is more expensive now than it has been on average over the past 5 years.`}
      </p>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge
          label="History Conclusion"
          value={verdict}
          color={verdict === 'Very Attractive' ? 'green' : verdict === 'Attractive' ? 'blue' : 'gray'}
        />
        <Badge
          label="Current Valuation"
          value={currentUv != null ? `${Math.abs(currentUv).toFixed(0)}% ${isUndervalued ? 'undervalued' : 'overvalued'}` : 'n/a'}
          color={isUndervalued ? 'green' : 'gray'}
        />
        {avg5y != null && (
          <Badge
            label="5-Year Average"
            value={`${Math.abs(avg5y).toFixed(0)}% undervaluation`}
            color="blue"
          />
        )}
        {cagr != null && (
          <Badge
            label="Average Value Growth"
            value={`${cagr.toFixed(0)}%`}
            color="amber"
          />
        )}
      </div>

      {/* Chart */}
      <div className="relative w-full bg-white dark:bg-gray-900 rounded-xl" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 16, right: 80, left: 8, bottom: 32 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700/60" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatXTick}
              angle={-20}
              textAnchor="end"
              height={40}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={v => `$${v.toFixed(0)}`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Forecast zone reference */}
            {valuationForecast.length > 0 && (
              <ReferenceLine
                x={valuationForecast[0]!.date}
                stroke="#d1d5db"
                strokeDasharray="4 2"
                label={{ value: 'Forecast', position: 'insideTopLeft', fontSize: 9, fill: '#9ca3af' }}
              />
            )}

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

        {/* End-of-chart floating labels */}
        <EndLabels
          intrinsicValue={last.intrinsic}
          priceValue={last.price}
          undervaluationPct={currentUv}
        />
      </div>
    </div>
  );
}

// ── Floating end labels (absolute positioned) ──────────────────────────────
function EndLabels({
  intrinsicValue,
  priceValue,
  undervaluationPct,
}: {
  intrinsicValue: number;
  priceValue: number;
  undervaluationPct: number;
}) {
  const isUnder = undervaluationPct > 0;
  return (
    <div className="absolute right-1 top-4 flex flex-col gap-1.5 items-end pointer-events-none">
      {/* Intrinsic Value label */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Intrinsic Value</span>
        <span className="bg-gray-700 dark:bg-gray-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
          {fmtDollar(intrinsicValue)}
        </span>
      </div>
      {/* Price label */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Price</span>
        <span className={`text-white text-[10px] font-bold px-2 py-0.5 rounded-md ${isUnder ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {fmtDollar(priceValue)}
        </span>
      </div>
      {/* Undervaluation badge */}
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${isUnder ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
        {Math.abs(undervaluationPct).toFixed(0)}% {isUnder ? 'undervalued' : 'overvalued'}
      </span>
    </div>
  );
}

export default ValuationHistoryChart;
