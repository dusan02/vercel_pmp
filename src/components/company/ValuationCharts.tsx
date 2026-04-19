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
import { useState, useEffect, useMemo } from 'react';

interface HistoryPoint { date: string; value: number; }

interface RatioStats {
    avg: number; p10: number; p25: number; median: number;
    p75: number; p90: number; min: number; max: number; count: number;
}

interface HistoryData {
    peHistory: HistoryPoint[];
    psHistory: HistoryPoint[];
    current: { pe: number | null; ps: number | null };
    stats: { pe: RatioStats | null; ps: RatioStats | null };
}

interface ValuationChartsProps {
    ticker: string;
}

const PERIODS = [
    { id: '1y',  label: '1Y',  years: 1  },
    { id: '3y',  label: '3Y',  years: 3  },
    { id: '5y',  label: '5Y',  years: 5  },
    { id: '10y', label: '10Y', years: 10 },
    { id: 'all', label: 'All', years: 99 },
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
        <div className="flex flex-col items-center px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg min-w-[52px] sm:min-w-[64px]">
            <span className={`text-xs sm:text-sm font-bold tabular-nums ${col}`}>
                {value !== null ? `${value.toFixed(1)}×` : '—'}
            </span>
            <span className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{label}</span>
        </div>
    );
}

export default function ValuationCharts({ ticker }: ValuationChartsProps) {
    const [data, setData]       = useState<HistoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [metric, setMetric]   = useState<MetricId>('pe');
    const [period, setPeriod]   = useState<PeriodId>('5y');

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/analysis/${ticker}/history`);
                if (res.ok) setData(await res.json());
            } finally {
                setLoading(false);
            }
        })();
    }, [ticker]);

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

    const stats   = metric === 'pe' ? (data?.stats?.pe  ?? null) : (data?.stats?.ps  ?? null);
    const current = metric === 'pe' ? (data?.current?.pe ?? null) : (data?.current?.ps ?? null);
    const cfg     = METRICS.find(m => m.id === metric)!;

    // Determine if current is cheap / expensive vs percentiles
    const valBadge = (current !== null && current !== undefined && stats)
        ? current <= stats.p25 ? { label: 'Cheap Zone', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
        : current >= stats.p75 ? { label: 'Expensive Zone', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
        : { label: 'Fair Value Zone', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' }
        : null;

    const yDomain: [number | 'auto', number | 'auto'] = (stats && stats.p90 && stats.max)
        ? [0, Math.min(stats.p90 * 1.3, stats.max)]
        : [0, 'auto'];

    if (loading) return (
        <div className="flex justify-center items-center h-44">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
        </div>
    );

    if (!data) return (
        <div className="text-center text-gray-400 text-sm py-10">
            No historical data. Run Deep Analysis to populate valuation history.
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Metric toggle */}
                <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex">
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
                {/* Period toggle */}
                <div className="flex gap-1">
                    {PERIODS.map(p => (
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
                    <span className={`ml-auto text-[10px] font-semibold px-2.5 py-1 rounded-full ${valBadge.color}`}>
                        {valBadge.label}
                    </span>
                )}
            </div>

            {/* Current + Stats pills */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 items-end">
                {/* Current value — prominent */}
                <div className="flex flex-col mr-1 sm:mr-2">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wide">Current {cfg.label.split(' ')[0]}</span>
                    <span className="text-xl sm:text-2xl font-bold tabular-nums" style={{ color: cfg.color }}>
                        {current !== null && current !== undefined ? `${current.toFixed(1)}×` : '—'}
                    </span>
                </div>
                <StatPill label="Median" value={stats?.median ?? null} />
                <StatPill label="P10 (cheap)" value={stats?.p10 ?? null} highlight="green" />
                <StatPill label="P25" value={stats?.p25 ?? null} />
                <StatPill label="P75" value={stats?.p75 ?? null} />
                <StatPill label="P90 (exp.)" value={stats?.p90 ?? null} highlight="red" />
            </div>

            {/* Chart */}
            {filteredHistory.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                    No {cfg.label} data for this period.
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={filteredHistory} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
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
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => v.slice(0, 7)}
                            interval={Math.max(Math.floor(filteredHistory.length / 8) - 1, 0)}
                        />
                        <YAxis
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                            axisLine={false} tickLine={false}
                            width={38}
                            tickFormatter={v => `${v}×`}
                            domain={yDomain}
                        />
                        <Tooltip content={<RatioTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1 }} />

                        {/* P90 — Expensive zone upper boundary */}
                        {stats?.p90 && (
                            <ReferenceLine y={stats.p90} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2"
                                label={{ value: `P90 ${stats.p90.toFixed(1)}×`, position: 'right', fontSize: 9, fill: '#ef4444' }} />
                        )}
                        {/* P75 — subtle */}
                        {stats?.p75 && (
                            <ReferenceLine y={stats.p75} stroke="#f97316" strokeWidth={1} strokeDasharray="2 4"
                                label={{ value: `P75`, position: 'right', fontSize: 8, fill: '#f97316' }} />
                        )}
                        {/* Median */}
                        {stats?.median && (
                            <ReferenceLine y={stats.median} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 2"
                                label={{ value: `Median ${stats.median.toFixed(1)}×`, position: 'right', fontSize: 9, fill: '#9ca3af' }} />
                        )}
                        {/* P25 — subtle */}
                        {stats?.p25 && (
                            <ReferenceLine y={stats.p25} stroke="#34d399" strokeWidth={1} strokeDasharray="2 4"
                                label={{ value: `P25`, position: 'right', fontSize: 8, fill: '#34d399' }} />
                        )}
                        {/* P10 — Cheap zone lower boundary */}
                        {stats?.p10 && (
                            <ReferenceLine y={stats.p10} stroke="#10b981" strokeWidth={1} strokeDasharray="4 2"
                                label={{ value: `P10 ${stats.p10.toFixed(1)}×`, position: 'right', fontSize: 9, fill: '#10b981' }} />
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
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-emerald-500 inline-block" /> Cheap</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-gray-400 inline-block" /> Median</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-red-500 inline-block" /> Expensive</span>
                <span className="flex items-center gap-1.5 sm:ml-auto text-gray-300 dark:text-gray-600">Based on {stats?.count ?? 0} daily trading points.</span>
            </div>
        </div>
    );
}

