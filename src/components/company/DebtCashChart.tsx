import React, { useState, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { FinancialStatement } from './FinancialChart';
import { filterStatementsByViewMode, formatChartYAxis, buildPeriodLabel } from '@/lib/utils/chartUtils';
import { ChartViewToggle } from './shared/ChartViewToggle';
import { ChartQuarterTick } from './shared/ChartQuarterTick';

interface DebtCashChartProps {
    statements: FinancialStatement[];
}

const METRICS = [
    { key: 'cash', label: 'Cash & Equivalents', color: '#10B981' },
    { key: 'totalDebt', label: 'Total Debt', color: '#EF4444' },
] as const;

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm">
            <p className="font-bold text-gray-900 dark:text-gray-100 mb-2">{label}</p>
            {payload.map((entry: any, i: number) => {
                const metric = METRICS.find(m => m.key === entry.dataKey);
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

export default function DebtCashChart({ statements }: DebtCashChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['cash', 'totalDebt']);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];
        const filtered = filterStatementsByViewMode(statements, viewMode);
        const sorted = [...filtered].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
        return sorted
            .filter(s => s.totalDebt !== null || s.cashAndEquivalents !== null)
            .map(s => {
                const cashVal = (s.cashAndEquivalents ?? 0) / 1e6;
                const debtVal = (s.totalDebt ?? 0) / 1e6;
                const label = buildPeriodLabel(s.fiscalPeriod, s.fiscalYear);
                return { name: label, date: label, cash: cashVal, totalDebt: debtVal };
            });
    }, [statements, viewMode]);

    const toggleMetric = (metricKey: string) => {
        setSelectedMetrics(prev => {
            if (prev.includes(metricKey)) {
                if (prev.length > 1) return prev.filter(m => m !== metricKey);
                return prev;
            }
            return [...prev, metricKey];
        });
    };

    if (!statements || statements.length === 0) {
        return <div className="text-gray-500 text-sm">No balance sheet data available.</div>;
    }

    if (chartData.length === 0) {
        return (
            <div className="text-gray-500 text-sm p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="font-medium">No {viewMode} debt/cash data available</p>
                <p className="text-xs mt-1">Try switching to {viewMode === 'annual' ? 'quarterly' : 'annual'} view or click Refresh Analysis.</p>
            </div>
        );
    }

    const yMin = 0;

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                <ChartViewToggle viewMode={viewMode} onChange={setViewMode} />
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {METRICS.map(metric => (
                        <button
                            key={metric.key}
                            onClick={() => toggleMetric(metric.key)}
                            className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${
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
                            width={55}
                            domain={[yMin, 'auto']}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />

                        <Bar
                            dataKey="cash"
                            name="Cash & Equivalents"
                            fill="#10B981"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={40}
                            hide={!selectedMetrics.includes('cash')}
                            isAnimationActive={false}
                        />
                        <Bar
                            dataKey="totalDebt"
                            name="Total Debt"
                            fill="#EF4444"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={40}
                            hide={!selectedMetrics.includes('totalDebt')}
                            isAnimationActive={false}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Info Panel */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Tip:</strong> Cash &amp; Equivalents = cash_and_cash_equivalents from balance sheet. Total Debt = current + non-current debt obligations combined.
                </p>
            </div>
        </div>
    );
}
