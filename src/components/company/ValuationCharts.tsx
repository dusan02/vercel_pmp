'use client';

import {
    ResponsiveContainer,
    ComposedChart,
    Area,
    Line,
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
    { id: '1y',  label: '1Y',  months: 12 },
    { id: '3y',  label: '3Y',  months: 36 },
    { id: '5y',  label: '5Y',  months: 60 },
    { id: '10y', label: '10Y', months: 120 },
    { id: 'all', label: 'All', months: 999 },
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
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 shadow-xl min-w-[140px]">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 border-b border-gray-100 dark:border-gray-700 pb-1">{label}</p>
            <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: payload[0].stroke || payload[0].fill }} />
                <span className="font-bold text-gray-900 dark:text-white text-sm">
                    {typeof payload[0]?.value === 'number' ? `${payload[0].value.toFixed(2)}x` : '—'}
                </span>
            </div>
        </div>
    );
}

function StatPill({ label, value, highlight }: { label: string; value: number | null; highlight?: 'green' | 'red' | 'gray' }) {
    const bgClass = highlight === 'green' ? 'bg-emerald-50 dark:bg-emerald-900/20'
                  : highlight === 'red'   ? 'bg-red-50 dark:bg-red-900/20'
                  : 'bg-gray-50 dark:bg-gray-800/50';
                  
    const col = highlight === 'green' ? 'text-emerald-700 dark:text-emerald-400'
               : highlight === 'red'   ? 'text-red-700 dark:text-red-400'
               : 'text-gray-800 dark:text-gray-200';
               
    return (
        <div className={`flex flex-col items-center justify-center px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700/50 flex-1 min-w-[70px] ${bgClass}`}>
            <span className={`text-[10px] uppercase tracking-wider mb-1 font-semibold text-gray-500 dark:text-gray-400`}>{label}</span>
            <span className={`text-base font-bold tabular-nums ${col}`}>
                {value !== null ? `${value.toFixed(1)}x` : '—'}
            </span>
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
        if (raw.length === 0) return [];
        
        if (period === 'all') return raw;

        const periodMonths = PERIODS.find(p => p.id === period)?.months ?? 60;
        
        // Get the latest date from the dataset itself, rather than strictly today
        // This ensures the charts work even if data is a few days old
        const latestPoint = raw[raw.length - 1];
        if (!latestPoint) return [];

        const latestDate = new Date(latestPoint.date);
        
        const cutoff = new Date(latestDate);
        cutoff.setMonth(cutoff.getMonth() - periodMonths);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        
        return raw.filter(d => d.date >= cutoffStr);
    }, [data, metric, period]);

    // Recalculate stats based *only* on the selected time period
    const currentStats = useMemo(() => {
        if (!filteredHistory || filteredHistory.length === 0) return null;
        
        const values = filteredHistory.map(h => h.value).sort((a, b) => a - b);
        const count = values.length;
        
        const pct = (p: number) => {
            if (count === 0) return 0;
            const idx = (p / 100) * (count - 1);
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            const weight = idx - lo;
            const valLo = values[lo] ?? 0;
            const valHi = values[hi] ?? 0;
            return valLo + (valHi - valLo) * weight;
        };

        return {
            p10: pct(10),
            p25: pct(25),
            median: pct(50),
            p75: pct(75),
            p90: pct(90),
            max: values[count - 1],
            min: values[0],
            avg: values.reduce((a,b) => a+b, 0) / count,
            count
        };
    }, [filteredHistory]);

    const current = metric === 'pe' ? (data?.current?.pe ?? null) : (data?.current?.ps ?? null);
    const cfg     = METRICS.find(m => m.id === metric)!;

    // Determine if current is cheap / expensive vs percentiles of the current period
    const valBadge = (current !== null && current !== undefined && currentStats)
        ? current <= currentStats.p25 ? { label: 'Cheap Zone', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' }
        : current >= currentStats.p75 ? { label: 'Expensive Zone', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400 border border-red-200 dark:border-red-800' }
        : { label: 'Fair Value Zone', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700' }
        : null;

    const yDomain: [number | 'auto', number | 'auto'] = (currentStats && currentStats.p90 && currentStats.max)
        ? [0, Math.min(currentStats.p90 * 1.5, currentStats.max * 1.1)]
        : [0, 'auto'];

    if (loading) return (
        <div className="flex justify-center items-center h-64 bg-gray-50 dark:bg-gray-800/20 rounded-2xl border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
                <span className="text-xs text-gray-500">Loading valuation history...</span>
            </div>
        </div>
    );

    if (!data || filteredHistory.length === 0) return (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-16 bg-gray-50 dark:bg-gray-800/20 rounded-2xl border border-gray-100 dark:border-gray-800">
            No historical {cfg.label} data available for this timeframe.
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Top Header: Controls & Current Value */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                
                {/* Left side: Current Value & Badges */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-end gap-3">
                        <span className="text-4xl font-extrabold tracking-tight tabular-nums" style={{ color: cfg.color }}>
                            {current !== null && current !== undefined ? `${current.toFixed(1)}x` : '—'}
                        </span>
                        <div className="pb-1.5 flex flex-col">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Current {cfg.label}</span>
                        </div>
                    </div>
                    
                    {valBadge && (
                        <div className="inline-flex mt-1">
                            <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${valBadge.color}`}>
                                {valBadge.label} vs {period.toUpperCase()} History
                            </span>
                        </div>
                    )}
                </div>

                {/* Right side: Toggles */}
                <div className="flex flex-col gap-2 md:items-end">
                    <div className="bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-lg inline-flex shadow-inner">
                        {METRICS.map(m => (
                            <button key={m.id} onClick={() => setMetric(m.id)}
                                className={`text-[11px] px-4 py-1.5 rounded-md font-bold transition-all ${
                                    metric === m.id
                                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}>
                                {m.label}
                            </button>
                        ))}
                    </div>
                    
                    <div className="bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-lg inline-flex shadow-inner">
                        {PERIODS.map(p => (
                            <button key={p.id} onClick={() => setPeriod(p.id)}
                                className={`text-[10px] px-3 py-1 rounded-md font-bold transition-all ${
                                    period === p.id
                                        ? 'text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                                style={period === p.id ? { backgroundColor: cfg.color } : {}}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap gap-2 w-full">
                <StatPill label="P10 (Cheap)" value={currentStats?.p10 ?? null} highlight="green" />
                <StatPill label="P25" value={currentStats?.p25 ?? null} />
                <StatPill label="Median" value={currentStats?.median ?? null} />
                <StatPill label="P75" value={currentStats?.p75 ?? null} />
                <StatPill label="P90 (Exp)" value={currentStats?.p90 ?? null} highlight="red" />
            </div>

            {/* Chart Area */}
            <div className="pt-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm p-4 relative overflow-hidden">
                <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={filteredHistory} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="peGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                            </linearGradient>
                            <linearGradient id="psGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                            </linearGradient>
                        </defs>
                        
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-800" />
                        
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 500 }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => {
                                const d = new Date(v);
                                return period === '1y' 
                                    ? d.toLocaleDateString('en-US', { month: 'short' }) 
                                    : d.getFullYear().toString();
                            }}
                            minTickGap={40}
                            dy={10}
                        />
                        
                        <YAxis
                            tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }}
                            axisLine={false} tickLine={false}
                            width={45}
                            tickFormatter={v => `${v}x`}
                            domain={yDomain}
                        />
                        
                        <Tooltip content={<RatioTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '5 5' }} />

                        {/* Valuation Bands */}
                        {currentStats?.p90 && (
                            <ReferenceLine y={currentStats.p90} stroke="#f87171" strokeWidth={1} strokeDasharray="5 5"
                                label={{ value: `P90`, position: 'insideTopRight', fontSize: 10, fill: '#f87171', fontWeight: 600 }} />
                        )}
                        {currentStats?.median && (
                            <ReferenceLine y={currentStats.median} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="3 3"
                                label={{ value: `Median`, position: 'insideTopRight', fontSize: 10, fill: '#9ca3af', fontWeight: 600 }} />
                        )}
                        {currentStats?.p10 && (
                            <ReferenceLine y={currentStats.p10} stroke="#34d399" strokeWidth={1} strokeDasharray="5 5"
                                label={{ value: `P10`, position: 'insideBottomRight', fontSize: 10, fill: '#34d399', fontWeight: 600 }} />
                        )}

                        {/* Main Data Line */}
                        <Area
                            type="monotone"
                            dataKey="value"
                            name={cfg.label}
                            stroke={cfg.color}
                            strokeWidth={3}
                            fill={`url(#${cfg.gradient})`}
                            activeDot={{ r: 6, strokeWidth: 0, fill: cfg.color }}
                            isAnimationActive={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>

                {/* Micro legend */}
                <div className="absolute bottom-2 left-10 flex gap-4 bg-white/80 dark:bg-gray-900/80 px-3 py-1 rounded-full text-[9px] font-medium text-gray-500 backdrop-blur-sm border border-gray-100 dark:border-gray-800">
                    <span className="flex items-center gap-1"><div className="w-2 h-0.5 bg-red-400 rounded-full"></div> Expensive</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-0.5 bg-gray-400 rounded-full"></div> Fair</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-0.5 bg-emerald-400 rounded-full"></div> Cheap</span>
                </div>
            </div>
            
            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right px-2">
                Based on {currentStats?.count.toLocaleString() ?? 0} daily trading points.
            </p>
        </div>
    );
}

