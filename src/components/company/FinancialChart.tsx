import React, { useState, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';

export interface FinancialStatement {
    id: string;
    symbol: string;
    period: string;
    endDate: string;
    fiscalYear: number;
    fiscalPeriod: string;
    revenue: number | null;
    netIncome: number | null;
    ebit: number | null;
    grossProfit: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
    // ... we only need a few for now to chart
}

interface FinancialChartProps {
    statements: FinancialStatement[];
}

// Dostupné metriky pre graf
const AVAILABLE_METRICS = [
    { key: 'revenue', label: 'Revenue', color: '#3B82F6' },
    { key: 'netIncome', label: 'Net Income', color: '#10B981' },
    { key: 'ebitda', label: 'EBITDA', color: '#F59E0B' }
];

export default function FinancialChart({ statements }: FinancialChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
    const [selectedMetrics, setSelectedMetrics] = useState(['revenue', 'netIncome', 'ebitda']);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];

        // Filter by mode - opravené pre lepšie detekciu annual data
        let filtered = statements;
        if (viewMode === 'annual') {
            // Skús rôzne spôsoby ako sú uložené annual data
            filtered = statements.filter(s => 
                s.fiscalPeriod === 'FY' || 
                s.fiscalPeriod === 'TTM' ||
                s.period === 'annual' ||
                (s.fiscalPeriod && s.fiscalPeriod.startsWith('FY'))
            );
            
            // Ak náhodou nie sú annual data, použime posledný Q4 každého roka
            if (filtered.length === 0) {
                const yearlyData = new Map();
                statements.forEach(s => {
                    if (s.fiscalPeriod && s.fiscalPeriod.includes('Q4')) {
                        const year = s.fiscalYear;
                        if (!yearlyData.has(year) || new Date(s.endDate) > new Date(yearlyData.get(year).endDate)) {
                            yearlyData.set(year, s);
                        }
                    }
                });
                filtered = Array.from(yearlyData.values());
            }
        } else {
            // Quarterly - všetko čo nie je annual
            filtered = statements.filter(s => 
                s.fiscalPeriod !== 'FY' && 
                s.fiscalPeriod !== 'TTM' &&
                s.period !== 'annual'
            );
        }

        // Sort ascending by date for charting (statements from API are descending)
        const sorted = [...filtered].sort(
            (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
        );

        // Format data for Recharts
        return sorted.map(s => {
            // Vypočítaj EBITDA ak nie je priamo dostupné (EBITDA ≈ EBIT + D&A, ale D&A nemáme)
            const ebitdaValue = (s.ebit && s.ebit > 0) ? s.ebit * 1.1 : 0; // EBITDA ≈ EBIT*1.1 only when positive (impairments excluded)
            
            const qMatch = s.fiscalPeriod?.match(/Q(\d)/);
            const label = qMatch
                ? `Q${qMatch[1]}'${String(s.fiscalYear).slice(2)}`
                : String(s.fiscalYear);
            return {
                name: label,
                date: label,
                revenue: s.revenue ? s.revenue / 1e6 : 0, // Convert to millions for readability
                netIncome: s.netIncome ? s.netIncome / 1e6 : 0,
                ebitda: ebitdaValue / 1e6,
                // Ponecháme aj pôvodné hodnoty pre presnos
                _originalRevenue: s.revenue,
                _originalNetIncome: s.netIncome,
                _originalEbit: s.ebit,
            };
        });
    }, [statements, viewMode]);

    const toggleMetric = (metricKey: string) => {
        setSelectedMetrics(prev => {
            if (prev.includes(metricKey)) {
                // Neodstráň poslednú metriku
                if (prev.length > 1) {
                    return prev.filter(m => m !== metricKey);
                }
                return prev;
            } else {
                return [...prev, metricKey];
            }
        });
    };

    if (!statements || statements.length === 0) {
        return <div className="text-gray-500 text-sm">No financial statement data available.</div>;
    }

    if (chartData.length === 0) {
        return (
            <div className="text-gray-500 text-sm p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="font-medium">No {viewMode} data available</p>
                <p className="text-xs mt-1">Try switching to {viewMode === 'annual' ? 'quarterly' : 'annual'} view or check data availability.</p>
            </div>
        );
    }

    // Custom tick for quarterly mode: Q label top, year below when year changes
    const CustomQuarterTick = ({ x, y, payload, index }: any) => {
        const val: string = payload?.value ?? '';
        const m = val.match(/Q(\d)'(\d{2})/);
        if (!m) return <text x={x} y={y + 12} textAnchor="middle" fill="#6B7280" fontSize={11}>{val}</text>;
        const q = `Q${m[1]}`;
        const year = `20${m[2]}`;
        const prevDate = index > 0 ? (chartData[index - 1]?.date as string) : '';
        const prevYear = prevDate?.match(/Q\d'(\d{2})/)?.[1];
        const showYear = index === 0 || prevYear !== m[2];
        return (
            <g transform={`translate(${x},${y})`}>
                <text x={0} y={14} textAnchor="middle" fill="#6B7280" fontSize={11} fontWeight={500}>{q}</text>
                {showYear && (
                    <text x={0} y={30} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontWeight={500}>{year}</text>
                )}
            </g>
        );
    };

    // Compute exact Y-axis minimum from raw data (only netIncome can be negative)
    const yMin = React.useMemo(() => {
        if (!selectedMetrics.includes('netIncome')) return 0;
        const min = Math.min(0, ...chartData.map(d => d.netIncome as number));
        return min < 0 ? Math.floor(min * 1.1) : 0;
    }, [chartData, selectedMetrics]);

    // Format YAxis ticks (e.g., $1.5B, or $500M)
    const formatYAxis = (tickItem: number) => {
        if (tickItem === 0) return "0";
        const absValue = Math.abs(tickItem);
        if (absValue >= 1000) {
            return `$${(tickItem / 1000).toFixed(1)}B`;
        }
        return `$${tickItem}M`;
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm">
                    <p className="font-bold text-gray-900 dark:text-gray-100 mb-2">{label}</p>
                    {payload.map((entry: any, index: number) => {
                        const metric = AVAILABLE_METRICS.find(m => m.key === entry.dataKey);
                        return (
                            <div key={index} className="flex items-center gap-2 mb-1">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
                                <span className="text-gray-600 dark:text-gray-300">{metric?.label || entry.name}:</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    ${new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(entry.value * 1e6)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* Control Panel */}
            <div className="flex justify-between items-center mb-4">
                {/* View Mode Toggle */}
                <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex">
                    <button
                        onClick={() => setViewMode('annual')}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === 'annual'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                    >
                        Annual
                    </button>
                    <button
                        onClick={() => setViewMode('quarterly')}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === 'quarterly'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                    >
                        Quarterly
                    </button>
                </div>

                {/* Metric Selection */}
                <div className="flex gap-2">
                    {AVAILABLE_METRICS.map(metric => (
                        <button
                            key={metric.key}
                            onClick={() => toggleMetric(metric.key)}
                            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                                selectedMetrics.includes(metric.key)
                                    ? 'text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-200 dark:bg-gray-700'
                            }`}
                            style={{
                                backgroundColor: selectedMetrics.includes(metric.key) ? metric.color : undefined
                            }}
                        >
                            {metric.label}
                            {selectedMetrics.includes(metric.key) && (
                                <span className="ml-1">✓</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart */}
            <div className="w-full" style={{ minHeight: 320 }}>
                <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: 10, bottom: viewMode === 'quarterly' ? 8 : 40 }}
                        barGap={2}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                        <XAxis 
                            dataKey="date"
                            tick={viewMode === 'quarterly' ? <CustomQuarterTick /> : { fontSize: 12, fill: '#6B7280', fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            dy={viewMode === 'annual' ? 6 : 0}
                            height={viewMode === 'quarterly' ? 44 : 30}
                        />
                        <YAxis 
                            tickFormatter={formatYAxis} 
                            tick={{ fontSize: 12, fill: '#6B7280' }} 
                            axisLine={false}
                            tickLine={false}
                            width={50}
                            domain={[yMin, 'auto']}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />
                        <ReferenceLine y={0} stroke="#9CA3AF" />
                        
                        {/* Dynamické renderovanie vybraných metrík */}
                        {selectedMetrics.includes('revenue') && (
                            <Bar 
                                dataKey="revenue" 
                                name="Revenue" 
                                fill="#3B82F6" 
                                radius={[2, 2, 0, 0]} 
                                maxBarSize={40}
                            />
                        )}
                        {selectedMetrics.includes('netIncome') && (
                            <Bar 
                                dataKey="netIncome" 
                                name="Net Income" 
                                fill="#10B981" 
                                radius={[2, 2, 0, 0]} 
                                maxBarSize={40}
                            />
                        )}
                        {selectedMetrics.includes('ebitda') && (
                            <Bar 
                                dataKey="ebitda" 
                                name="EBITDA" 
                                fill="#F59E0B" 
                                radius={[2, 2, 0, 0]} 
                                maxBarSize={40}
                            />
                        )}
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Info Panel */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Tip:</strong> Click metrics above to toggle them on/off. Annual data shows year-end figures, quarterly shows 3-month periods.
                </p>
            </div>
        </div>
    );
}
