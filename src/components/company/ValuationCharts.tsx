'use client';

import {
    ResponsiveContainer,
    ComposedChart,
    LineChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Area,
    AreaChart,
    ReferenceLine,
} from 'recharts';
import { useState, useEffect } from 'react';

interface ChartPoint {
    date: string;
    price: number;
    peRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
    
    peBandAvg: number | null;
    peBandMin: number | null;
    peBandMax: number | null;
    
    psBandAvg: number | null;
    psBandMin: number | null;
    psBandMax: number | null;
}

interface RevenuePoint {
    year: string;
    revenue: number | null;
    netIncome: number | null;
    fcf: number | null;
}

interface HistoryData {
    chartData: ChartPoint[];
    revenueData: RevenuePoint[];
    stats: { 
        peAvg: number | null; peMin: number | null; peMax: number | null;
        psAvg: number | null; psMin: number | null; psMax: number | null;
        evAvg: number | null; evMin: number | null; evMax: number | null;
    };
}

interface ValuationChartsProps {
    ticker: string;
}

const CustomTooltip = ({ active, payload, label, prefix = '$', suffix = '' }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-xs">
            <p className="font-semibold text-gray-600 dark:text-gray-400 mb-2">{label}</p>
            {payload.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
                    <span className="text-gray-700 dark:text-gray-300">{p.name}:</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                        {typeof p.value === 'number' ? `${prefix}${p.value.toLocaleString()}${suffix}` : p.value}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default function ValuationCharts({ ticker }: ValuationChartsProps) {
    const [data, setData] = useState<HistoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeChart, setActiveChart] = useState<'pe' | 'ps' | 'ev' | 'fcf' | 'revenue'>('pe');

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/analysis/${ticker}/history`);
                if (!res.ok) throw new Error('Failed');
                setData(await res.json());
            } catch {
                // silently fail
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [ticker]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
        );
    }

    if (!data || data.chartData.length === 0) {
        return (
            <div className="text-center text-gray-400 text-sm py-10">
                No historical data available yet. Run a Deep Analysis to populate.
            </div>
        );
    }

    const { chartData, revenueData, stats } = data;
    const sampledData = chartData.filter((_, i) => i % 3 === 0);

    const renderBands = (dataKey: string, avgKey: string, minKey: string, maxKey: string, unit = '×') => (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                    { label: `Avg ${unit}`, value: stats[avgKey as keyof typeof stats]?.toFixed(1) ?? 'N/A', color: 'blue' },
                    { label: `Min ${unit}`, value: stats[minKey as keyof typeof stats]?.toFixed(1) ?? 'N/A', color: 'green' },
                    { label: `Max ${unit}`, value: stats[maxKey as keyof typeof stats]?.toFixed(1) ?? 'N/A', color: 'red' },
                ].map(s => (
                    <div key={s.label} className={`text-center p-3 rounded-lg bg-${s.color}-50 dark:bg-${s.color}-900/20 border border-${s.color}-100 dark:border-${s.color}-900/30`}>
                        <p className={`text-lg font-bold text-${s.color}-600 dark:text-${s.color}-400`}>{s.value}{unit}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                    </div>
                ))}
            </div>
            <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={sampledData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.08} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v.slice(0, 7)} interval={11} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}`} domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey={maxKey} name="Resistance" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2" fill="none" dot={false} />
                    <Area type="monotone" dataKey={minKey} name="Support" stroke="#10b981" strokeWidth={1} strokeDasharray="4 2" fill="url(#bandGrad)" dot={false} />
                    <Area type="monotone" dataKey={avgKey} name="Fair Value" stroke="#f59e0b" strokeWidth={1.5} fill="none" dot={false} />
                    <Area type="monotone" dataKey="price" name="Actual Price" stroke="#3b82f6" strokeWidth={2} fill="url(#priceGrad)" dot={false} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg w-fit">
                {[
                    { id: 'pe', label: '📊 P/E Bands' },
                    { id: 'ps', label: '🏷️ P/S Bands' },
                    { id: 'ev', label: '⚡ EV/EBITDA' },
                    { id: 'fcf', label: '💸 FCF Power' },
                    { id: 'revenue', label: '📦 Revenue mix' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveChart(tab.id as any)}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors font-medium ${activeChart === tab.id ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeChart === 'pe' && renderBands('peRatio', 'peAvg', 'peMin', 'peMax')}
            {activeChart === 'ps' && renderBands('psRatio', 'psAvg', 'psMin', 'psMax')}

            {activeChart === 'ev' && (
                <div>
                   <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={sampledData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v.slice(0, 7)} interval={11} />
                            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} domain={['auto', 'auto']} />
                            <Tooltip content={<CustomTooltip prefix="" suffix="x" />} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="evEbitda" name="EV/EBITDA" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                            <ReferenceLine y={stats.evAvg || 0} label={{ position: 'right', value: 'Avg', fill: '#8b5cf6', fontSize: 10 }} stroke="#8b5cf6" strokeDasharray="3 3" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {activeChart === 'fcf' && (
                <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={revenueData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}B`} />
                            <Tooltip content={<CustomTooltip prefix="$" suffix="B" />} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="fcf" name="Free Cash Flow" fill="#10b981" radius={[3, 3, 0, 0]} />
                            <Line type="monotone" dataKey="netIncome" name="Net Income" stroke="#3b82f6" strokeWidth={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-gray-400 text-center">Free Cash Flow vs. Net Income (Annual, $B)</p>
                </div>
            )}

            {activeChart === 'revenue' && (
                <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={revenueData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                        <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}B`} />
                        <Tooltip content={<CustomTooltip prefix="$" suffix="B" />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" opacity={0.6} radius={[3, 3, 0, 0]} />
                        <Line type="monotone" dataKey="netIncome" name="Net Income" stroke="#10b981" strokeWidth={2} />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
