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
  Legend,
  ReferenceLine,
} from 'recharts';
import { CHART_FONT } from '@/components/charts/chartTheme';
import { ChartBody, ChartControls, ChartPlot, ChartFootnote } from './shared/ChartFrame';
import { quarterlyDiffCorr } from '@/lib/utils/analysisMath';

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

const PERIODS = [
  { id: '1y', label: '1Y', years: 1 },
  { id: '3y', label: '3Y', years: 3 },
  { id: '5y', label: '5Y', years: 5 },
] as const;
type PeriodId = typeof PERIODS[number]['id'];

function formatDateTick(dateStr: string | unknown) {
  if (typeof dateStr !== 'string' || !dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function fmtSignedPct(v: number | null | undefined, digits = 1) {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function CustomTooltip({ active, payload, label, fundLabel }: any) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.payload;
  const price = raw?.price as number | undefined;
  const pricePct = raw?.pricePct as number | null | undefined;
  const fundPct = raw?.fundPct as number | null | undefined;
  const reratingPct = raw?.reratingPct as number | null | undefined;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-xs min-w-[185px]">
      <p className="text-gray-500 dark:text-gray-400 mb-1.5 font-medium">{label}</p>
      {pricePct != null && (
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Stock Price
          </span>
          <span className="font-mono font-semibold text-gray-900 dark:text-white">
            {fmtSignedPct(pricePct)}
            {price != null && (
              <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
                (${Number(price).toFixed(2)})
              </span>
            )}
          </span>
        </div>
      )}
      {fundPct != null ? (
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {fundLabel}
          </span>
          <span className="font-mono font-semibold text-gray-900 dark:text-white">
            {fmtSignedPct(fundPct)}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-gray-500 dark:text-gray-400 italic">
            n/a — no positive TTM basis
          </span>
        </div>
      )}
      {reratingPct != null && (
        <div
          className={`mt-1.5 text-center text-[10px] font-bold rounded px-2 py-0.5 ${
            Math.abs(reratingPct) < 2
              ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              : reratingPct > 0
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          }`}
        >
          Multiple {reratingPct >= 0 ? 'Expansion' : 'Compression'}: {fmtSignedPct(reratingPct)}
        </div>
      )}
    </div>
  );
}

function Pill({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: string;
  tone?: 'blue' | 'green' | 'amber' | 'gray';
}) {
  const cls = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    gray: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  }[tone];

  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

export function CorrelationChart({
  priceHistory,
  impliedPS,
  impliedPE,
  corrPS,
  corrPE,
}: CorrelationChartProps) {
  const [mode, setMode] = useState<Mode>('ps');
  const [period, setPeriod] = useState<PeriodId>('5y');

  const availablePeriods = useMemo(() => {
    if (!priceHistory.length) return PERIODS;
    const oldest = new Date(priceHistory[0]!.date);
    const newest = new Date(priceHistory[priceHistory.length - 1]!.date);
    const yearsAvailable = (newest.getTime() - oldest.getTime()) / (365 * 24 * 60 * 60 * 1000);
    const filtered = PERIODS.filter(p => p.years <= yearsAvailable + 0.5);
    return filtered.length > 0 ? filtered : PERIODS;
  }, [priceHistory]);

  useEffect(() => {
    if (availablePeriods.length > 0 && !availablePeriods.find(p => p.id === period)) {
      setPeriod(availablePeriods[availablePeriods.length - 1]!.id);
    }
  }, [availablePeriods, period]);

  const { mergedData, correlation, fundLabel, summary } = useMemo(() => {
    const implied = mode === 'ps' ? impliedPS : impliedPE;
    const defaultCorr = mode === 'ps' ? corrPS : corrPE;

    const periodYears = PERIODS.find(p => p.id === period)?.years ?? 5;
    const latestDateStr = priceHistory[priceHistory.length - 1]?.date;
    const cutoff = latestDateStr ? new Date(latestDateStr) : new Date();
    cutoff.setFullYear(cutoff.getFullYear() - periodYears);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const windowedPrices = priceHistory.filter(p => p.date >= cutoffStr);

    // Merge keyed on the price timeline — every trading week stays a category
    // on the x-axis, so a stretch with no valid implied (non-positive TTM
    // EPS/revenue, or implied collapsed below 5% of price) shows as an honest
    // gap instead of compressing time or carrying a stale value forward.
    const impliedMap = new Map(implied.map(pt => [pt.date, pt.impliedPrice]));
    const merged = windowedPrices.map(p => {
      const imp = impliedMap.get(p.date) ?? null;
      const valid = imp != null && imp > 0 && imp >= p.price * 0.05;
      return {
        date: p.date,
        price: p.price,
        impliedPrice: valid ? imp : null,
      };
    });

    // Rebase both series to 0% cumulative change at the first common point of
    // the selected window. Since impliedPrice = perShare × medianMultiple, the
    // constant medianMultiple cancels in (implied_t / implied_0 - 1), so
    // `fundPct` is the exact cumulative % growth of TTM Revenue/sh or TTM EPS,
    // and the vertical gap between `pricePct` and `fundPct` at every date
    // equals the exact multiple expansion/compression over that span:
    //   (1 + pricePct/100) = (1 + fundPct/100) × (1 + reratingPct/100)
    const base = merged.find(d => typeof d.price === 'number' && d.price > 0 && d.impliedPrice != null);
    const basePrice = base?.price ?? null;
    const baseImplied = base?.impliedPrice ?? null;

    const indexed = merged.map(d => {
      const pricePct = typeof d.price === 'number' && basePrice
        ? parseFloat((((d.price / basePrice) - 1) * 100).toFixed(2))
        : null;
      const fundPct = d.impliedPrice != null && baseImplied
        ? parseFloat((((d.impliedPrice / baseImplied) - 1) * 100).toFixed(2))
        : null;
      const reratingPct = pricePct != null && fundPct != null && (1 + fundPct / 100) > 0
        ? parseFloat(((((1 + pricePct / 100) / (1 + fundPct / 100)) - 1) * 100).toFixed(2))
        : null;
      return {
        ...d,
        pricePct,
        fundPct,
        reratingPct,
      };
    });

    // Recompute QoQ correlation for sub-periods (1Y/3Y); use backend value on 5Y
    const pairs = merged
      .filter((d): d is { date: string; price: number; impliedPrice: number } =>
        typeof d.price === 'number' && d.price > 0 && d.impliedPrice != null && d.impliedPrice > 0
      )
      .map(d => ({ date: d.date, price: d.price, implied: d.impliedPrice }));
    const periodCorr = period === '5y' ? defaultCorr : (quarterlyDiffCorr(pairs) ?? defaultCorr);

    const lastValid = [...indexed].reverse().find(d => d.pricePct != null && d.fundPct != null) ?? null;

    return {
      mergedData: indexed,
      correlation: periodCorr,
      fundLabel: mode === 'ps' ? 'TTM Revenue / Share' : 'TTM EPS',
      summary: lastValid
        ? {
            pricePct: lastValid.pricePct!,
            fundPct: lastValid.fundPct!,
            reratingPct: lastValid.reratingPct!,
          }
        : null,
    };
  }, [mode, period, impliedPS, impliedPE, priceHistory, corrPS, corrPE]);

  if (!mergedData.length) {
    return <div className="text-center text-gray-500 text-sm py-10">No correlation data available.</div>;
  }

  const corrColor = correlation !== null
    ? Math.abs(correlation) > 0.7 ? 'text-emerald-600 dark:text-emerald-400'
    : Math.abs(correlation) > 0.4 ? 'text-amber-600 dark:text-amber-400'
    : 'text-gray-500 dark:text-gray-400'
    : 'text-gray-500';
  const corrLabel = correlation !== null
    ? Math.abs(correlation) > 0.7 ? (correlation > 0 ? 'Strong (+)' : 'Strong (−)')
      : Math.abs(correlation) > 0.4 ? (correlation > 0 ? 'Moderate (+)' : 'Moderate (−)')
      : 'Weak'
    : 'n/a';

  const periodLabel = PERIODS.find(p => p.id === period)?.label ?? '5Y';

  return (
    <ChartBody>
      {/* Controls + Period + Correlation Badge */}
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

        <div className="flex gap-1 shrink-0">
          {availablePeriods.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`text-[10px] px-2.5 py-1 rounded font-medium transition-colors ${
                period === p.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span
          className={`ml-auto shrink-0 text-xs font-semibold ${corrColor}`}
          title="Correlation of quarter-over-quarter % changes — whether price moves with the fundamentals updates"
        >
          Corr (QoQ Δ): {correlation !== null ? `${(correlation * 100).toFixed(0)}%` : 'n/a'}{' '}
          <span className="opacity-70">({corrLabel})</span>
        </span>
      </ChartControls>

      <ChartPlot className="bg-white dark:bg-gray-900 rounded-lg p-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={mergedData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateTick}
              angle={-20}
              textAnchor="end"
              height={40}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}%`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip fundLabel={fundLabel} />} />
            <Legend wrapperStyle={{ fontSize: CHART_FONT.annotation }} />
            <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1} />

            {/* No connectNulls on the fundamentals line — gap weeks (no positive
                TTM basis, or collapsed below 5% of price) must show as real gaps. */}
            <Area
              type="monotone"
              dataKey="fundPct"
              name={`${fundLabel} (%)`}
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.12}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="pricePct"
              name="Stock Price (%)"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartPlot>

      <ChartFootnote>
        {summary && (
          <>
            <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-snug">
              Over the past <strong>{periodLabel}</strong>, stock price moved{' '}
              <strong>{fmtSignedPct(summary.pricePct, 0)}</strong> while {fundLabel} moved{' '}
              <strong>{fmtSignedPct(summary.fundPct, 0)}</strong> —{' '}
              {Math.abs(summary.reratingPct) < 2
                ? 'tracking fundamentals closely with minimal multiple change.'
                : summary.reratingPct > 0
                ? `a ${fmtSignedPct(summary.reratingPct, 0)} multiple expansion (${mode === 'ps' ? 'P/S' : 'P/E'} re-rating).`
                : `a ${fmtSignedPct(summary.reratingPct, 0)} multiple compression (${mode === 'ps' ? 'P/S' : 'P/E'} de-rating).`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Pill
                label={`Price (${periodLabel})`}
                value={fmtSignedPct(summary.pricePct, 0)}
                tone={summary.pricePct >= 0 ? 'blue' : 'amber'}
              />
              <Pill
                label={mode === 'ps' ? `Rev/sh (${periodLabel})` : `EPS (${periodLabel})`}
                value={fmtSignedPct(summary.fundPct, 0)}
                tone={summary.fundPct >= 0 ? 'green' : 'amber'}
              />
              <Pill
                label={mode === 'ps' ? 'P/S Re-rating' : 'P/E Re-rating'}
                value={`${fmtSignedPct(summary.reratingPct, 0)} ${
                  Math.abs(summary.reratingPct) < 2
                    ? 'flat'
                    : summary.reratingPct > 0
                    ? 'expansion'
                    : 'compression'
                }`}
                tone={Math.abs(summary.reratingPct) < 2 ? 'gray' : summary.reratingPct > 0 ? 'amber' : 'blue'}
              />
              {correlation !== null && (
                <Pill
                  label="QoQ Corr"
                  value={`${(correlation * 100).toFixed(0)}% (${corrLabel})`}
                  tone={Math.abs(correlation) > 0.7 ? 'green' : Math.abs(correlation) > 0.4 ? 'amber' : 'gray'}
                />
              )}
            </div>
          </>
        )}
        <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
          Both series are rebased to 0% at the start of the selected window; the vertical gap shows cumulative {mode === 'ps' ? 'P/S' : 'P/E'} multiple expansion or compression.
        </p>
        {correlation !== null && correlation < -0.4 && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 leading-relaxed">
            ⚠️ Strong negative correlation: price moves <em>opposite</em> to {mode === 'ps' ? 'revenue/sh' : 'EPS'} changes — the market may be pricing forward expectations or macro shifts ahead of trailing TTM results.
          </p>
        )}
      </ChartFootnote>
    </ChartBody>
  );
}
