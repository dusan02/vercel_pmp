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
import { CHART_FONT } from '@/components/charts/chartTheme';

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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.payload;
  const price = raw?.price;
  const implied = raw?.impliedPrice ?? raw?.forecastImplied;
  // Guard: implied must be a positive finite number for the over/under ratio
  const diff = (price != null && implied != null && implied > 0) ? ((price - implied) / implied) * 100 : null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-gray-500 dark:text-gray-400 mb-1.5 font-medium">{label}</p>
      {price != null && (
        <div className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: '#3b82f6' }} />
          <span className="text-gray-800 dark:text-gray-100 font-semibold">Actual Price:</span>
          <span className="font-mono">${Number(price).toFixed(2)}</span>
        </div>
      )}
      {implied != null && (
        <div className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: raw?.isForecast ? '#fbbf24' : '#10b981' }} />
          <span className="text-gray-800 dark:text-gray-100 font-semibold">Implied Price{raw?.isForecast ? ' (fcst)' : ''}:</span>
          <span className="font-mono">${Number(implied).toFixed(2)}</span>
        </div>
      )}
      {diff !== null && (
        <div className={`mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700 font-semibold ${diff > 0 ? 'text-red-500' : 'text-green-500'}`}>
          {diff > 0 ? 'Overvalued' : 'Undervalued'} by {Math.abs(diff).toFixed(1)}%
        </div>
      )}
    </div>
  );
}


export function CorrelationChart({ priceHistory, impliedPS, impliedPE, corrPS, corrPE }: CorrelationChartProps) {
  const [mode, setMode] = useState<Mode>('ps');

  const { mergedData, correlation, label, hasForecast } = useMemo(() => {
    const implied = mode === 'ps' ? impliedPS : impliedPE;
    const corr = mode === 'ps' ? corrPS : corrPE;

    const priceMap = new Map(priceHistory.map(p => [p.date, p.price]));
    const merged = implied
      .map(pt => ({
        date: pt.date,
        // Historical implied line must STOP at the forecast boundary —
        // otherwise the area draws straight through the forecast points.
        impliedPrice: pt.isForecast ? null : pt.impliedPrice,
        price: priceMap.get(pt.date),
        isForecast: pt.isForecast,
        // Pre-compute forecast value for reliable rendering (function dataKey is unreliable in Recharts)
        forecastImplied: pt.isForecast ? pt.impliedPrice : null,
      }))
      .filter(d => typeof d.price === 'number' || d.isForecast);

    // Rebase both series to 100 at the first common point — raw $ scales differ
    // by orders of magnitude (implied ≈ rev/eps × median multiple vs market price),
    // so on a shared $ axis the implied line looked flat and the chart read as broken.
    const base = merged.find(d => typeof d.price === 'number' && d.impliedPrice != null);
    const basePrice = base?.price ?? null;
    const baseImplied = base?.impliedPrice ?? null;
    const indexed = merged.map(d => ({
      ...d,
      priceIdx: typeof d.price === 'number' && basePrice ? (d.price / basePrice) * 100 : null,
      impliedIdx: d.impliedPrice != null && baseImplied ? (d.impliedPrice / baseImplied) * 100 : null,
      forecastIdx: d.forecastImplied != null && baseImplied ? (d.forecastImplied / baseImplied) * 100 : null,
    }));

    const hasForecastData = merged.some(d => d.isForecast);

    return {
      mergedData: indexed,
      correlation: corr,
      label: mode === 'ps' ? 'Implied Price (P/S)' : 'Implied Price (P/E)',
      hasForecast: hasForecastData,
    };
  }, [mode, impliedPS, impliedPE, priceHistory, corrPS, corrPE]);

  if (!mergedData.length) {
    return <div className="text-center text-gray-500 text-sm py-10">No correlation data available.</div>;
  }

  const corrColor = correlation !== null
    ? Math.abs(correlation) > 0.7 ? 'text-green-600 dark:text-green-400'
    : Math.abs(correlation) > 0.4 ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-gray-500 dark:text-gray-400'
    : 'text-gray-500';
  const corrLabel = correlation !== null
    ? Math.abs(correlation) > 0.7 ? (correlation > 0 ? 'Strong (+)' : 'Strong (−)')
      : Math.abs(correlation) > 0.4 ? (correlation > 0 ? 'Moderate (+)' : 'Moderate (−)')
      : 'Weak'
    : 'n/a';

  return (
    <div className="space-y-3">
      {/* Explanation */}
      <p className="text-[11px] text-gray-500 dark:text-gray-500 leading-relaxed">
        Compares actual price to <strong>implied price</strong> — what the stock <em>should</em> trade at based on {mode === 'ps' ? 'revenue per share × median P/S multiple' : 'EPS × median P/E multiple'}.
        Both series rebased to <strong>100</strong> at period start — when actual grows faster than implied, the stock drifts <span className="text-red-500">above</span> (overvalued); below implies <span className="text-green-500">undervalued</span>. Hover for raw $ values.
      </p>

      {/* Negative correlation warning */}
      {correlation !== null && correlation < -0.4 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 leading-relaxed">
          ⚠️ Strong negative correlation: price moves <em>opposite</em> to implied value. The standard over/undervalued interpretation may not apply — the market is pricing this stock on factors outside {mode === 'ps' ? 'revenue' : 'earnings'} alone.
        </p>
      )}

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
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={mergedData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
            <XAxis dataKey="date" tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={formatDateTick} angle={-30} textAnchor="end" height={40} />
            <YAxis tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => v.toFixed(0)} domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: CHART_FONT.annotation }} />

            <Area
              type="monotone"
              dataKey="impliedIdx"
              name={`${label} (idx)`}
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.12}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="priceIdx"
              name="Actual Price (idx)"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              connectNulls
            />

            {/* Forecast shading — only render if forecast data exists */}
            {hasForecast && (
              <Area
                type="monotone"
                dataKey="forecastIdx"
                name="Forecast (idx)"
                stroke="#fbbf24"
                fill="#fbbf24"
                fillOpacity={0.18}
                strokeWidth={1}
                strokeDasharray="4 4"
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
