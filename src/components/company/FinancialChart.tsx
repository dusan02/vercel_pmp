import React, { useState, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { filterStatementsByViewMode, formatChartYAxis, buildPeriodLabel } from '@/lib/utils/chartUtils';
import { ChartViewToggle } from './shared/ChartViewToggle';
import { ChartQuarterTick } from './shared/ChartQuarterTick';

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
    totalDebt: number | null;
    cashAndEquivalents: number | null;
    sharesOutstanding: number | null;
    sbc: number | null;
}

interface FinancialChartProps {
    statements: FinancialStatement[];
}

const AVAILABLE_METRICS = [
    { key: 'revenue', label: 'Revenue', color: '#3B82F6' },
    { key: 'netIncome', label: 'Net Income', color: '#10B981' },
    { key: 'ebitda', label: 'EBITDA', color: '#F59E0B' },
] as const;

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm">
            <p className="font-bold text-gray-900 dark:text-gray-100 mb-2">{label}</p>
            {payload.map((entry: any, i: number) => {
                const metric = AVAILABLE_METRICS.find(m => m.key === entry.dataKey);
                return (
                    <div key={i} className="flex items-center gap-2 mb-1">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-gray-600 dark:text-gray-300">{metric?.label ?? entry.name}:</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                            ${new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(entry.value * 1e6)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export default function FinancialChart({ statements }: FinancialChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
    const [selectedMetrics, setSelectedMetrics] = useState(['revenue', 'netIncome', 'ebitda']);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];
        const filtered = filterStatementsByViewMode(statements, viewMode);
        const sorted = [...filtered].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
        return sorted.map(s => {
            const ebitdaValue = (s.ebit && s.ebit > 0) ? s.ebit * 1.1 : 0;
            const label = buildPeriodLabel(s.fiscalPeriod, s.fiscalYear);
            return {
                name: label,
                date: label,
                revenue: s.revenue ? s.revenue / 1e6 : 0,
                netIncome: s.netIncome ? s.netIncome / 1e6 : 0,
                ebitda: ebitdaValue / 1e6,
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

    const yMin = useMemo(() => {
        if (!selectedMetrics.includes('netIncome')) return 0;
        const min = Math.min(0, ...chartData.map(d => d.netIncome as number));
        return min < 0 ? Math.floor(min * 1.1) : 0;
    }, [chartData, selectedMetrics]);

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                <ChartViewToggle viewMode={viewMode} onChange={setViewMode} />
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {AVAILABLE_METRICS.map(metric => (
                        <button
                            key={metric.key}
                            onClick={() => toggleMetric(metric.key)}
                            className={`text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-all ${
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
                        margin={{ top: 10, right: 10, left: 10, bottom: viewMode === 'quarterly' ? 8 : 5 }}
                        barGap={2}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                        <XAxis 
                            dataKey="date"
                            tick={viewMode === 'quarterly' ? <ChartQuarterTick chartData={chartData} /> : { fontSize: 11, fill: '#6B7280', fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            dy={viewMode === 'annual' ? 6 : 0}
                            height={viewMode === 'quarterly' ? 44 : 24}
                        />
                        <YAxis 
                            tickFormatter={formatChartYAxis} 
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
