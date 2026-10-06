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
import { ChartBody, ChartControls, ChartPlot, ChartFootnote } from './shared/ChartFrame';

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
  const implied = raw?.impliedPrice;
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
      {implied != null ? (
        <div className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
          <span className="text-gray-800 dark:text-gray-100 font-semibold">Implied Price:</span>
          <span className="font-mono">${Number(implied).toFixed(2)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: '#9ca3af' }} />
          <span className="text-gray-500 dark:text-gray-400 italic">implied n/a — no meaningful positive TTM basis</span>
        </div>
      )}
      {diff !== null && (
        <div className={`mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700 font-semibold ${diff > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
          Price {diff > 0 ? 'above' : 'below'} implied by {Math.abs(diff).toFixed(1)}% ({diff > 0 ? 'multiple expansion' : 'multiple compression'})
        </div>
      )}
    </div>
  );
}


export function CorrelationChart({ priceHistory, impliedPS, impliedPE, corrPS, corrPE }: CorrelationChartProps) {
  const [mode, setMode] = useState<Mode>('ps');

  const { mergedData, correlation, label } = useMemo(() => {
    const implied = mode === 'ps' ? impliedPS : impliedPE;
    const corr = mode === 'ps' ? corrPS : corrPE;

    // Merge keyed on the price timeline — every trading week stays a category
    // on the x-axis, so a stretch with no valid implied (non-positive TTM
    // EPS/revenue, or implied collapsed below 5% of price) shows as an honest
    // gap instead of compressing time or carrying a stale value forward.
    const impliedMap = new Map(implied.map(pt => [pt.date, pt.impliedPrice]));
    const merged = priceHistory.map(p => {
      const imp = impliedMap.get(p.date) ?? null;
      const valid = imp != null && imp > 0 && imp >= p.price * 0.05;
      return {
        date: p.date,
        price: p.price,
        impliedPrice: valid ? imp : null,
      };
    });

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
    }));

    return {
      mergedData: indexed,
      correlation: corr,
      label: mode === 'ps' ? 'Implied Price (P/S)' : 'Implied Price (P/E)',
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
    <ChartBody>
      {/* Controls + Correlation Badge */}
      <ChartControls>
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex shrink-0">
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
        <span className={`ml-auto shrink-0 text-xs font-semibold ${corrColor}`} title="Correlation of quarter-over-quarter % changes — whether price moves with the fundamentals updates">
          Corr (QoQ Δ): {correlation !== null ? `${(correlation * 100).toFixed(0)}%` : 'n/a'} <span className="opacity-70">({corrLabel})</span>
        </span>
      </ChartControls>

      <ChartPlot className="bg-white dark:bg-gray-900 rounded-lg p-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={mergedData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
            <XAxis dataKey="date" tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={formatDateTick} angle={-30} textAnchor="end" height={40} />
            <YAxis tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => v.toFixed(0)} domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: CHART_FONT.annotation }} />

            {/* No connectNulls on the implied line — gap weeks (no positive
                TTM basis, or implied collapsed below 5% of price) must show
                as real gaps, not a bridged straight segment. */}
            <Area
              type="monotone"
              dataKey="impliedIdx"
              name={`${label} (idx)`}
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.12}
              strokeWidth={2}
              dot={false}
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
          </ComposedChart>
        </ResponsiveContainer>
      </ChartPlot>

      <ChartFootnote>
        {/* Explanation */}
        <p className="text-[10px] text-gray-500 dark:text-gray-500 leading-relaxed">
          Compares actual price to an <strong>implied price</strong> — {mode === 'ps' ? 'revenue per share' : 'EPS'} × this stock's <strong>median {mode === 'ps' ? 'P/S' : 'P/E'} multiple</strong> over the period, both rebased to 100 at start.
          A widening gap is <span className="text-amber-600">multiple expansion</span> — the market paying more per ${mode === 'ps' ? 'of revenue' : 'of earnings'} than its own median; a narrowing gap is compression.
          Gaps in the implied line mark periods with no positive TTM {mode === 'ps' ? 'revenue' : 'earnings'} basis — a multiple-implied value is not meaningful there.
          Correlation is measured on quarter-over-quarter % changes, not price levels.
          Re-ratings often reflect genuine changes in business quality and margins, so this chart describes <em>co-movement</em>, not fair value — for price-vs-own-history context see the Valuation percentile tooltips and Scenario Lab.
        </p>
        {/* Negative correlation warning */}
        {correlation !== null && correlation < -0.4 && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 leading-relaxed">
            ⚠️ Strong negative correlation: price moves <em>opposite</em> to implied value — the market may be pricing this stock on factors outside {mode === 'ps' ? 'revenue' : 'earnings'} alone.
          </p>
        )}
      </ChartFootnote>
    </ChartBody>
  );
}
