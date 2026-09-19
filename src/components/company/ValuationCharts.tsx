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

function RatioTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
            <p className="text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            <p className="font-bold text-gray-900 dark:text-white">
                {typeof payload[0]?.value === 'number' ? `${payload[0].value.toFixed(2)}×` : '—'}
            </p>
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

    // Recompute stats for the selected period from filtered data
    const stats   = useMemo(() => {
        if (filteredHistory.length < 5) return null;
        const values = filteredHistory.map(d => d.value).sort((a, b) => a - b);
        const n = values.length;
        const percentile = (p: number) => values[Math.max(0, Math.min(Math.ceil((p / 100) * n) - 1, n - 1))];
        return {
            avg: values.reduce((s, v) => s + v, 0) / n,
            p10: percentile(10),
            p25: percentile(25),
            median: percentile(50),
            p75: percentile(75),
            p90: percentile(90),
            min: values[0]!,
            max: values[n - 1]!,
            count: n,
        } as RatioStats;
    }, [filteredHistory]);

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
                    <ComposedChart data={filteredHistory} margin={{ top: 8, right: 56, left: 8, bottom: 24 }}>
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
                            interval={Math.max(Math.floor(filteredHistory.length / 8) - 1, 0)}
                        />
                        <YAxis
                            tick={{ fontSize: CHART_FONT.axis, fill: '#9ca3af' }}
                            axisLine={false} tickLine={false}
                            width={38}
                            scale={useLog ? 'log' : 'auto'}
                            tickFormatter={v => `${v}×`}
                            domain={yDomain}
                            {...(logTicks ? { ticks: logTicks } : {})}
                        />
                        <Tooltip content={<RatioTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1 }} />

                        {/* P90 — Expensive zone upper boundary */}
                        {stats?.p90 && (
                            <ReferenceLine y={stats.p90} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2"
                                label={{ value: `P90 ${stats.p90.toFixed(1)}×`, position: 'right', fontSize: CHART_FONT.annotation, fill: '#ef4444' }} />
                        )}
                        {/* P75 — subtle */}
                        {stats?.p75 && (
                            <ReferenceLine y={stats.p75} stroke="#f97316" strokeWidth={1} strokeDasharray="2 4"
                                label={{ value: `P75`, position: 'right', fontSize: CHART_FONT.annotation, fill: '#f97316' }} />
                        )}
                        {/* Median */}
                        {stats?.median && (
                            <ReferenceLine y={stats.median} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 2"
                                label={{ value: `Median ${stats.median.toFixed(1)}×`, position: 'right', fontSize: CHART_FONT.annotation, fill: '#9ca3af' }} />
                        )}
                        {/* P25 — subtle */}
                        {stats?.p25 && (
                            <ReferenceLine y={stats.p25} stroke="#34d399" strokeWidth={1} strokeDasharray="2 4"
                                label={{ value: `P25`, position: 'right', fontSize: CHART_FONT.annotation, fill: '#34d399' }} />
                        )}
                        {/* P10 — Cheap zone lower boundary */}
                        {stats?.p10 && (
                            <ReferenceLine y={stats.p10} stroke="#10b981" strokeWidth={1} strokeDasharray="4 2"
                                label={{ value: `P10 ${stats.p10.toFixed(1)}×`, position: 'right', fontSize: CHART_FONT.annotation, fill: '#10b981' }} />
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
                    <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-emerald-500 inline-block" /> Cheap</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-gray-400 inline-block" /> Median</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-red-500 inline-block" /> Expensive</span>
                    <span className="flex items-center gap-1.5 sm:ml-auto text-gray-400 dark:text-gray-600">P10–P90 bands · {filteredHistory.length} weekly points{useLog ? ' · Log scale' : ''}</span>
                </div>
            </ChartFootnote>
        </ChartBody>
    );
}

