'use client';

import {
    ResponsiveContainer,
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Area,
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

const TABS = [
    { id: 'pe',      label: 'P/E Bands' },
    { id: 'ps',      label: 'P/S Bands' },
    { id: 'ev',      label: 'EV/EBITDA' },
    { id: 'fcf',     label: 'FCF Power'  },
    { id: 'revenue', label: 'Revenue'    },
] as const;

type TabId = typeof TABS[number]['id'];

function PriceTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const fmtPrice = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-xs space-y-1">
            <p className="font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.stroke || p.color || p.fill }} />
                    <span className="text-gray-600 dark:text-gray-300">{p.name}:</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                        {typeof p.value === 'number' ? fmtPrice(p.value) : '—'}
                    </span>
                </div>
            ))}
        </div>
    );
}

function MultipleTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-xs space-y-1">
            <p className="font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.stroke || p.color || p.fill }} />
                    <span className="text-gray-600 dark:text-gray-300">{p.name}:</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                        {typeof p.value === 'number' ? `${p.value.toFixed(1)}×` : '—'}
                    </span>
                </div>
            ))}
        </div>
    );
}

function BarTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-xs space-y-1">
            <p className="font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.stroke || p.color || p.fill }} />
                    <span className="text-gray-600 dark:text-gray-300">{p.name}:</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                        {typeof p.value === 'number' ? `$${p.value.toFixed(2)}B` : '—'}
                    </span>
                </div>
            ))}
        </div>
    );
}

function StatBadge({ label, value, unit, variant }: { label: string; value: string; unit: string; variant: 'blue' | 'green' | 'red' }) {
    const colours = {
        blue:  'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30 text-blue-700 dark:text-blue-400',
        green: 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/30 text-green-700 dark:text-green-400',
        red:   'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400',
    };
    return (
        <div className={`text-center p-2.5 rounded-lg border ${colours[variant]}`}>
            <p className="text-base font-bold">{value}{unit}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
        </div>
    );
}

const xTickFmt = (v: string) => v.slice(0, 7);
const xProps = { tick: { fontSize: 10, fill: '#9ca3af' }, axisLine: false, tickLine: false, interval: 11 as const };
const yPriceProps = { tick: { fontSize: 10, fill: '#9ca3af' }, axisLine: false, tickLine: false, tickFormatter: (v: number) => `$${v}` };
const yMultipleProps = { tick: { fontSize: 10, fill: '#9ca3af' }, axisLine: false, tickLine: false, tickFormatter: (v: number) => `${v.toFixed(0)}×` };

export default function ValuationCharts({ ticker }: ValuationChartsProps) {
    const [data, setData] = useState<HistoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('pe');

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

    if (loading) return (
        <div className="flex justify-center items-center h-44">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
    );

    if (!data || data.chartData.length === 0) return (
        <div className="text-center text-gray-400 text-sm py-10">
            No historical data available. Run Deep Analysis to populate.
        </div>
    );

    const { chartData, revenueData, stats } = data;
    // Downsample: every 3rd monthly point → ~40 pts for 10Y
    const pts = chartData.filter((_, i) => i % 3 === 0);
    // Only keep points where band values are non-null (fixes invisible bands bug)
    const pePts = pts.filter(d => d.peBandAvg !== null);
    const psPts = pts.filter(d => d.psBandAvg !== null);

    const na = (v: number | null) => v !== null ? v.toFixed(1) : 'N/A';

    const renderBandChart = (
        bandPts: typeof pts,
        avgKey: 'peBandAvg' | 'psBandAvg',
        minKey: 'peBandMin' | 'psBandMin',
        maxKey: 'peBandMax' | 'psBandMax',
        avgVal: number | null, minVal: number | null, maxVal: number | null,
    ) => (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
                <StatBadge label="Avg ×" value={na(avgVal)} unit="×" variant="blue" />
                <StatBadge label="Min ×" value={na(minVal)} unit="×" variant="green" />
                <StatBadge label="Max ×" value={na(maxVal)} unit="×" variant="red" />
            </div>
            {bandPts.length === 0 ? (
                <p className="text-xs text-center text-gray-400 py-8">No band data — run Deep Analysis to populate P/E history.</p>
            ) : (
                <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={bandPts} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <defs>
                            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" className="dark:stroke-gray-700" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={xTickFmt} {...xProps} />
                        <YAxis {...yPriceProps} domain={['auto', 'auto']} />
                        <Tooltip content={<PriceTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1 }} />
                        {/* Resistance (max) */}
                        <Line type="monotone" dataKey={maxKey} name="Resistance" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2" dot={false} connectNulls />
                        {/* Fair Value (avg) */}
                        <Line type="monotone" dataKey={avgKey} name="Fair Value" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls />
                        {/* Support (min) */}
                        <Line type="monotone" dataKey={minKey} name="Support" stroke="#10b981" strokeWidth={1} strokeDasharray="4 2" dot={false} connectNulls />
                        {/* Actual Price */}
                        <Area type="monotone" dataKey="price" name="Actual Price" stroke="#3b82f6" strokeWidth={2} fill="url(#priceGrad)" dot={false} connectNulls />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
            <div className="flex flex-wrap gap-4 justify-center text-[10px] text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-blue-500" />Actual Price</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-yellow-500" />Fair Value (avg multiple)</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-[1px] border-t border-dashed border-red-500" />Resistance (max)</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-[1px] border-t border-dashed border-green-500" />Support (min)</span>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Tab bar */}
            <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex flex-wrap gap-0.5">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`text-[10px] px-2.5 py-1 rounded font-medium transition-colors ${
                            activeTab === tab.id
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* P/E Bands — fix: use peBandAvg/Min/Max (not peAvg/Min/Max which was the bug) */}
            {activeTab === 'pe' && renderBandChart(pePts, 'peBandAvg', 'peBandMin', 'peBandMax', stats.peAvg, stats.peMin, stats.peMax)}

            {/* P/S Bands */}
            {activeTab === 'ps' && renderBandChart(psPts, 'psBandAvg', 'psBandMin', 'psBandMax', stats.psAvg, stats.psMin, stats.psMax)}

            {/* EV/EBITDA */}
            {activeTab === 'ev' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                        <StatBadge label="Avg ×" value={na(stats.evAvg)} unit="×" variant="blue" />
                        <StatBadge label="Min ×" value={na(stats.evMin)} unit="×" variant="green" />
                        <StatBadge label="Max ×" value={na(stats.evMax)} unit="×" variant="red" />
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={pts} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" className="dark:stroke-gray-700" vertical={false} />
                            <XAxis dataKey="date" tickFormatter={xTickFmt} {...xProps} />
                            <YAxis {...yMultipleProps} domain={['auto', 'auto']} />
                            <Tooltip content={<MultipleTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1 }} />
                            <Line type="monotone" dataKey="evEbitda" name="EV/EBITDA" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
                            {stats.evAvg && <ReferenceLine y={stats.evAvg} stroke="#8b5cf6" strokeDasharray="4 2" strokeWidth={1} label={{ value: `Avg ${stats.evAvg.toFixed(1)}×`, position: 'right', fontSize: 9, fill: '#8b5cf6' }} />}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* FCF Power */}
            {activeTab === 'fcf' && (
                <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={revenueData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" className="dark:stroke-gray-700" vertical={false} />
                        <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}B`} />
                        <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(107,114,128,0.05)' }} />
                        <ReferenceLine y={0} stroke="#9ca3af" />
                        <Bar dataKey="fcf" name="Free Cash Flow" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
                        <Line type="monotone" dataKey="netIncome" name="Net Income" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                </ResponsiveContainer>
            )}

            {/* Revenue */}
            {activeTab === 'revenue' && (
                <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={revenueData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" className="dark:stroke-gray-700" vertical={false} />
                        <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}B`} />
                        <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(107,114,128,0.05)' }} />
                        <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" opacity={0.7} radius={[3, 3, 0, 0]} maxBarSize={40} />
                        <Line type="monotone" dataKey="netIncome" name="Net Income" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
