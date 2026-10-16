'use client';

import {
    ResponsiveContainer,
    ComposedChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
} from 'recharts';
import { useState, useMemo, useEffect } from 'react';
import { CHART_FONT } from '@/components/charts/chartTheme';
import { ChartBody, ChartControls, ChartPlot, ChartFootnote } from './shared/ChartFrame';
import { pct } from '@/lib/utils/analysisMath';
import type { RatioStats } from './analysis/types';

interface HistoryPoint { date: string; value: number; }

interface HistoryData {
    peHistory: HistoryPoint[];
    psHistory: HistoryPoint[];
    current: { pe: number | null; ps: number | null };
    stats: { pe: RatioStats | null; ps: RatioStats | null };
}

interface ValuationChartsProps {
    ticker: string;
    peHistory?: { date: string; value: number }[];
    psHistory?: { date: string; value: number }[];
    current?: { pe: number | null; ps: number | null } | null;
    stats?: { pe: RatioStats | null; ps: RatioStats | null } | null;
}

const PERIODS = [
    { id: '1y',  label: '1Y',  years: 1  },
    { id: '3y',  label: '3Y',  years: 3  },
    { id: '5y',  label: '5Y',  years: 5  },
    { id: '10y', label: '10Y', years: 10 },
] as const;
type PeriodId = typeof PERIODS[number]['id'];

const METRICS = [
    { id: 'pe', label: 'P/E Ratio', color: '#6366f1', gradient: 'peGrad' },
    { id: 'ps', label: 'P/S Ratio', color: '#0ea5e9', gradient: 'psGrad' },
] as const;
type MetricId = 'pe' | 'ps';

function RatioTooltip({ active, payload, label, stats }: any) {
    if (!active || !payload?.length) return null;
    const valItem = payload.find((p: any) => p.dataKey === 'value') ?? payload[0];
    const v = typeof valItem?.value === 'number' ? valItem.value : null;
    const vsMedian = v != null && stats?.median && stats.median > 0
        ? ((v - stats.median) / stats.median) * 100
        : null;
    const zone = v != null && stats
        ? v >= stats.p90 ? { text: 'Above P90 · Expensive', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
        : v >= stats.p75 ? { text: 'P75–P90 · Elevated', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' }
        : v <= stats.p10 ? { text: 'Below P10 · Cheap', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }
        : v <= stats.p25 ? { text: 'P10–P25 · Attractive', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }
        : { text: 'P25–P75 · Fair Zone', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' }
        : null;

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-xs min-w-[150px]">
            <p className="text-gray-500 dark:text-gray-400 mb-1 font-medium">{label}</p>
            <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold text-sm text-gray-900 dark:text-white tabular-nums">
                    {v !== null ? `${v.toFixed(2)}×` : '—'}
                </span>
                {vsMedian !== null && (
                    <span className={`text-[10px] font-semibold tabular-nums ${vsMedian > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {vsMedian >= 0 ? '+' : ''}{vsMedian.toFixed(1)}% vs Med
                    </span>
                )}
            </div>
            {zone && (
                <div className={`mt-1.5 text-center text-[10px] font-bold rounded px-2 py-0.5 ${zone.cls}`}>
                    {zone.text}
                </div>
            )}
        </div>
    );
}

function StatPill({ label, value, highlight }: { label: string; value: number | null; highlight?: 'green' | 'red' | 'gray' }) {
    const col = highlight === 'green' ? 'text-emerald-600 dark:text-emerald-400'
               : highlight === 'red'   ? 'text-red-500 dark:text-red-400'
               : 'text-gray-800 dark:text-gray-200';
    return (
        <span className="flex items-baseline gap-1 shrink-0">
            <span className="text-gray-500 dark:text-gray-500">{label}</span>
            <span className={`font-semibold tabular-nums ${col}`}>
                {value !== null ? `${value.toFixed(1)}×` : '—'}
            </span>
        </span>
    );
}

export default function ValuationCharts({ ticker, peHistory, psHistory, current: currentProp, stats: propStats }: ValuationChartsProps) {
    const [metric, setMetric]   = useState<MetricId>('pe');
    const [period, setPeriod]   = useState<PeriodId>('5y');

    const data: HistoryData | null = useMemo(() => (peHistory || psHistory) ? {
        peHistory: peHistory ?? [],
        psHistory: psHistory ?? [],
        current: currentProp ?? { pe: null, ps: null },
        stats: propStats ?? { pe: null, ps: null },
    } : null, [peHistory, psHistory, currentProp, propStats]);

    // Determine which periods have data (data starts ~2021-07, so 10Y may be empty)
    const availablePeriods = useMemo(() => {
        const allHistory = [...(peHistory ?? []), ...(psHistory ?? [])];
        if (allHistory.length === 0) return PERIODS;
        const oldestDate = allHistory.reduce((min, p) => p.date < min ? p.date : min, allHistory[0]!.date);
        const oldest = new Date(oldestDate);
        const now = new Date();
        const yearsAvailable = (now.getTime() - oldest.getTime()) / (365 * 24 * 60 * 60 * 1000);
        return PERIODS.filter(p => p.years <= yearsAvailable + 0.5); // +0.5 tolerance
    }, [peHistory, psHistory]);

    // Auto-fallback: if selected period is not available, switch to longest available
    useEffect(() => {
        if (availablePeriods.length > 0 && !availablePeriods.find(p => p.id === period)) {
            setPeriod(availablePeriods[availablePeriods.length - 1]!.id);
        }
    }, [availablePeriods, period]);

    // Filter history to selected period (client-side)
    const filteredHistory = useMemo(() => {
        if (!data) return [];
        const raw = metric === 'pe' ? (data.peHistory ?? []) : (data.psHistory ?? []);
        const periodYears = PERIODS.find(p => p.id === period)?.years ?? 5;
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - periodYears);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        return raw.filter(d => d.date >= cutoffStr);
    }, [data, metric, period]);

    // Use canonical backend daily stats on the default 5Y period so Median /
    // P10–P90 match KeyMetricsTable & AnalysisHero to the tenth; for sub-periods
    // (1Y, 3Y) recompute with the same linear-interpolation `pct()` helper.
    const stats = useMemo(() => {
        if (period === '5y' && data?.stats?.[metric]) {
            return data.stats[metric];
        }
        if (filteredHistory.length < 5) return null;
        const values = filteredHistory.map(d => d.value).sort((a, b) => a - b);
        const n = values.length;
        return {
            avg: parseFloat((values.reduce((s, v) => s + v, 0) / n).toFixed(2)),
            p10: parseFloat(pct(values, 10).toFixed(2)),
            p25: parseFloat(pct(values, 25).toFixed(2)),
            median: parseFloat(pct(values, 50).toFixed(2)),
            p75: parseFloat(pct(values, 75).toFixed(2)),
            p90: parseFloat(pct(values, 90).toFixed(2)),
            min: values[0]!,
            max: values[n - 1]!,
            count: n,
        } as RatioStats;
    }, [filteredHistory, period, data, metric]);

    const chartData = useMemo(() => {
        const band = stats && stats.p25 > 0 && stats.p75 > stats.p25
            ? [stats.p25, stats.p75] as [number, number]
            : null;
        return filteredHistory.map(d => ({ ...d, fairBand: band }));
    }, [filteredHistory, stats]);

    const current = metric === 'pe' ? (data?.current?.pe ?? null) : (data?.current?.ps ?? null);
    const cfg     = METRICS.find(m => m.id === metric)!;

    // Determine if current is cheap / expensive vs percentiles
    const valBadge = (current !== null && current !== undefined && stats)
        ? current <= stats.p25 ? { label: 'Below P25 (Relatively Cheap)', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
        : current >= stats.p75 ? { label: 'Above P75 (Relatively Expensive)', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
        : { label: 'Fair Value Zone (P25–P75)', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' }
        : null;

    // Upper bound must be the LARGER of p90*1.3 and max — Math.min here clipped
    // the actual line whenever max exceeded p90*1.3 (e.g. a spike above P90).
    const linearDomain: [number | 'auto', number | 'auto'] = (stats && stats.p10 && stats.p90 && stats.max)
        ? [Math.max(0, Math.floor(stats.p10 * 0.8)), Math.max(stats.p90 * 1.3, stats.max)]
        : [0, 'auto'];

    // Wide ranges (a flat ~2× band with a 190× spike from near-zero earnings)
    // squash the meaningful zone on a linear axis — switch to log so both the
    // band and the spike stay readable. Log requires strictly positive data.
    const useLog = stats != null && stats.min > 0 && stats.max / stats.min > 4;
    const logTicks = useMemo(() => {
        if (!useLog || !stats) return undefined;
        const lo = Math.max(stats.min * 0.8, 0.01);
        const hi = stats.max * 1.25;
        const ticks: number[] = [];
        for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
            for (const m of [1, 2, 5]) {
                const v = m * 10 ** e;
                if (v >= lo && v <= hi) ticks.push(v);
            }
        }
        return ticks.length >= 2 ? ticks : undefined;
    }, [useLog, stats]);
    const yDomain: [number | 'auto', number | 'auto'] = useLog && stats
        ? [Math.max(stats.min * 0.8, 0.01), stats.max * 1.25]
        : linearDomain;

    if (!data) return (
        <div className="text-center text-gray-500 text-sm py-10">
            No historical data. Run Deep Analysis to populate valuation history.
        </div>
    );

    return (
        <ChartBody>
            {/* Controls row */}
            <ChartControls>
                {/* Metric toggle */}
                <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex shrink-0">
                    {METRICS.map(m => (
                        <button key={m.id} onClick={() => setMetric(m.id)}
                            className={`text-[10px] px-3 py-1 rounded font-medium transition-colors ${
                                metric === m.id
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}>
                            {m.label}
                        </button>
                    ))}
                </div>
                {/* Period toggle — only show periods that have data */}
                <div className="flex gap-1 shrink-0">
                    {availablePeriods.map(p => (
                        <button key={p.id} onClick={() => setPeriod(p.id)}
                            className={`text-[10px] px-2.5 py-1 rounded font-medium transition-colors ${
                                period === p.id
                                    ? 'text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                            style={period === p.id ? { backgroundColor: cfg.color } : {}}>
                            {p.label}
                        </button>
                    ))}
                </div>
                {/* Valuation badge */}
                {valBadge && (
                    <span className={`ml-auto shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full ${valBadge.color}`}>
                        {valBadge.label}
                    </span>
                )}
            </ChartControls>

            {/* Chart */}
            {filteredHistory.length === 0 ? (
                <ChartPlot className="flex items-center justify-center bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                    <p className="text-center text-gray-500 text-sm">No {cfg.label} data for this period.</p>
                </ChartPlot>
            ) : (
                <ChartPlot>
                    <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 58, left: 8, bottom: 24 }}>
                        <defs>
                            <linearGradient id="peGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
                            </linearGradient>
                            <linearGradient id="psGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.03} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => v.slice(0, 7)}
                            minTickGap={42}
                        />
                        <YAxis
                            tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }}
                            axisLine={false} tickLine={false}
                            width={38}
                            scale={useLog ? 'log' : 'auto'}
                            tickFormatter={(v: number) => v >= 10 ? `${Math.round(v)}×` : `${Number(v.toFixed(1))}×`}
                            domain={yDomain}
                            {...(logTicks ? { ticks: logTicks } : {})}
                        />
                        <Tooltip content={<RatioTooltip stats={stats} />} cursor={{ stroke: '#9ca3af', strokeWidth: 1 }} />

                        {/* Shaded P25–P75 Fair Value Zone */}
                        <Area
                            type="monotone"
                            dataKey="fairBand"
                            stroke="none"
                            fill="#9ca3af"
                            fillOpacity={0.12}
                            connectNulls
                            isAnimationActive={false}
                            legendType="none"
                        />

                        {/* P90 — Expensive zone upper boundary */}
                        {stats?.p90 && (
                            <ReferenceLine y={stats.p90} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2"
                                label={{ value: `P90 ${stats.p90.toFixed(1)}×`, position: 'right', fontSize: CHART_FONT.annotation, fill: '#ef4444' }} />
                        )}
                        {/* Median */}
                        {stats?.median && (
                            <ReferenceLine y={stats.median} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 2"
                                label={{ value: `Med ${stats.median.toFixed(1)}×`, position: 'right', fontSize: CHART_FONT.annotation, fill: '#9ca3af' }} />
                        )}
                        {/* P10 — Cheap zone lower boundary */}
                        {stats?.p10 && (
                            <ReferenceLine y={stats.p10} stroke="#10b981" strokeWidth={1} strokeDasharray="4 2"
                                label={{ value: `P10 ${stats.p10.toFixed(1)}×`, position: 'right', fontSize: CHART_FONT.annotation, fill: '#10b981' }} />
                        )}
                        {/* Current — placed insideTopLeft so the label never collides with
                            the right-edge curve peak or the right-margin P10/Med/P90 labels */}
                        {current != null && current > 0 && (
                            <ReferenceLine y={current} stroke={cfg.color} strokeWidth={1.5} strokeDasharray="3 2"
                                label={{ value: `Now ${current.toFixed(1)}×`, position: 'insideTopLeft', fontSize: CHART_FONT.annotation, fill: cfg.color, fontWeight: 700 }} />
                        )}

                        {/* Filled area + line */}
                        <Area
                            type="monotone"
                            dataKey="value"
                            name={cfg.label}
                            stroke={cfg.color}
                            strokeWidth={2}
                            fill={`url(#${cfg.gradient})`}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    </ComposedChart>
                    </ResponsiveContainer>
                </ChartPlot>
            )}

            <ChartFootnote>
                {/* Current + percentile stats — compact nowrap row */}
                <div className="flex items-center gap-3 overflow-x-auto flex-nowrap text-[10px]">
                    <span className="flex items-baseline gap-1 shrink-0">
                        <span className="text-gray-500 uppercase tracking-wide">Current {cfg.label.split(' ')[0]}</span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: cfg.color }}>
                            {current !== null && current !== undefined ? `${current.toFixed(1)}×` : '—'}
                        </span>
                    </span>
                    <StatPill label="Median" value={stats?.median ?? null} />
                    <StatPill label="P10" value={stats?.p10 ?? null} highlight="green" />
                    <StatPill label="P25" value={stats?.p25 ?? null} />
                    <StatPill label="P75" value={stats?.p75 ?? null} />
                    <StatPill label="P90" value={stats?.p90 ?? null} highlight="red" />
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 dark:text-gray-500">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-emerald-500 inline-block" /> P10 Cheap</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-gray-400/20 rounded-sm inline-block" /> P25–P75 Fair Zone</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-gray-400 inline-block" /> Median</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-red-500 inline-block" /> P90 Expensive</span>
                    <span className="flex items-center gap-1.5 sm:ml-auto text-gray-400 dark:text-gray-600">{filteredHistory.length} weekly points{useLog ? ' · Log scale' : ''}</span>
                </div>
            </ChartFootnote>
        </ChartBody>
    );
}

