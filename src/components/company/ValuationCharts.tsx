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
    bandAvg: number | null;
    bandMin: number | null;
    bandMax: number | null;
}

interface RevenuePoint {
    year: string;
    revenue: number | null;
    netIncome: number | null;
}

interface HistoryData {
    chartData: ChartPoint[];
    revenueData: RevenuePoint[];
    stats: { peAvg: number | null; peMin: number | null; peMax: number | null };
}

interface ValuationChartsProps {
    ticker: string;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-xs">
            <p className="font-semibold text-gray-600 dark:text-gray-400 mb-2">{label}</p>
            {payload.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-gray-700 dark:text-gray-300">{p.name}:</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                        {typeof p.value === 'number' ? `$${p.value.toFixed(2)}` : p.value}
                    </span>
                </div>
            ))}
        </div>
    );
};

const RevenueTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-xs">
            <p className="font-semibold text-gray-600 dark:text-gray-400 mb-2">{label}</p>
            {payload.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-gray-700 dark:text-gray-300">{p.name}:</span>
                    <span className="font-bold text-gray-900 dark:text-white">${p.value}B</span>
                </div>
            ))}
        </div>
    );
};

export default function ValuationCharts({ ticker }: ValuationChartsProps) {
    const [data, setData] = useState<HistoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeChart, setActiveChart] = useState<'pe' | 'revenue'>('pe');

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/analysis/${ticker}/history`);
                if (!res.ok) throw new Error('Failed');
                setData(await res.json());
            } catch {
                // silently fail — charts just won't render
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

    // Downsample to every 3rd point for the P/E chart readability
    const sampledData = chartData.filter((_, i) => i % 3 === 0);

    return (
        <div className="space-y-6">
            {/* Tab switcher */}
            <div className="flex gap-2 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveChart('pe')}
                    className={`text-sm px-4 py-1.5 rounded-md transition-colors font-medium ${activeChart === 'pe' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                >
                    📊 P/E Bands
                </button>
                <button
                    onClick={() => setActiveChart('revenue')}
                    className={`text-sm px-4 py-1.5 rounded-md transition-colors font-medium ${activeChart === 'revenue' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                >
                    📦 Revenue vs. Price
                </button>
            </div>

            {activeChart === 'pe' && (
                <div>
                    {/* Stats summary */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        {[
                            { label: 'Avg P/E (10Y)', value: stats.peAvg?.toFixed(1) ?? 'N/A', color: 'blue' },
                            { label: 'Min P/E (Support)', value: stats.peMin?.toFixed(1) ?? 'N/A', color: 'green' },
                            { label: 'Max P/E (Resistance)', value: stats.peMax?.toFixed(1) ?? 'N/A', color: 'red' },
                        ].map(s => (
                            <div key={s.label} className={`text-center p-3 rounded-lg bg-${s.color}-50 dark:bg-${s.color}-900/20 border border-${s.color}-100 dark:border-${s.color}-900/30`}>
                                <p className={`text-lg font-bold text-${s.color}-600 dark:text-${s.color}-400`}>{s.value}×</p>
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
                            {/* Min/Max band — fill between them */}
                            <Area
                                type="monotone"
                                dataKey="bandMax"
                                name="Resistance (Max P/E)"
                                stroke="#ef4444"
                                strokeWidth={1}
                                strokeDasharray="4 2"
                                fill="none"
                                dot={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="bandMin"
                                name="Support (Min P/E)"
                                stroke="#10b981"
                                strokeWidth={1}
                                strokeDasharray="4 2"
                                fill="url(#bandGrad)"
                                dot={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="bandAvg"
                                name="Fair Value (Avg P/E)"
                                stroke="#f59e0b"
                                strokeWidth={1.5}
                                fill="none"
                                dot={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="price"
                                name="Actual Price"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="url(#priceGrad)"
                                dot={false}
                                activeDot={{ r: 4 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-gray-400 text-center mt-2">
                        When price is <span className="text-green-500 font-medium">below the green band</span> → historically undervalued.
                        When <span className="text-red-500 font-medium">above red</span> → historically expensive.
                    </p>
                </div>
            )}

            {activeChart === 'revenue' && (
                <div>
                    {revenueData.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-10">No annual revenue data available.</p>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={300}>
                                <ComposedChart data={revenueData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                    <YAxis
                                        yAxisId="rev"
                                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                                        tickFormatter={(v) => `$${v}B`}
                                        orientation="left"
                                    />
                                    <YAxis
                                        yAxisId="ni"
                                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                                        tickFormatter={(v) => `$${v}B`}
                                        orientation="right"
                                    />
                                    <Tooltip content={<RevenueTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar
                                        yAxisId="rev"
                                        dataKey="revenue"
                                        name="Revenue"
                                        fill="#3b82f6"
                                        opacity={0.8}
                                        radius={[3, 3, 0, 0]}
                                    />
                                    <Line
                                        yAxisId="ni"
                                        type="monotone"
                                        dataKey="netIncome"
                                        name="Net Income"
                                        stroke="#10b981"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: '#10b981' }}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                            <p className="text-xs text-gray-400 text-center mt-2">
                                Annual Revenue (bars, left axis) vs. Net Income (line, right axis) — billions USD
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
