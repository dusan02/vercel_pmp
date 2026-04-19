import React, { useState, useMemo } from 'react';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { FinancialStatement } from './FinancialChart';
import { filterStatementsByViewMode, formatChartYAxis, buildPeriodLabel } from '@/lib/utils/chartUtils';
import { ChartViewToggle } from './shared/ChartViewToggle';
import { ChartQuarterTick } from './shared/ChartQuarterTick';
import { ChartTooltip } from './shared/ChartTooltip';
import { MetricToggleButtons, toggleMetric as toggle } from './shared/MetricToggleButtons';

interface DebtCashChartProps {
    statements: FinancialStatement[];
}

const METRICS = [
    { key: 'cash', label: 'Liquidity (Cash & ST. Inv)', color: '#10B981' },
    { key: 'totalDebt', label: 'Total Debt', color: '#EF4444' },
    { key: 'netDebt', label: 'Net Debt', color: '#6366F1' },
] as const;

export default function DebtCashChart({ statements }: DebtCashChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['cash', 'totalDebt', 'netDebt']);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];
        const filtered = filterStatementsByViewMode(statements, viewMode);
        const sorted = [...filtered].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
        return sorted.map(s => {
            const cashVal = (s.cashAndEquivalents ?? 0) / 1e6;
            const debtVal = (s.totalDebt ?? 0) / 1e6;
            const netDebtVal = debtVal - cashVal;
            const label = buildPeriodLabel(s.fiscalPeriod, s.fiscalYear);
            return { name: label, date: label, cash: cashVal, totalDebt: debtVal, netDebt: netDebtVal };
        });
    }, [statements, viewMode]);


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

    const yMin = useMemo(() => {
        if (!selectedMetrics.includes('netDebt')) return 0;
        const min = Math.min(0, ...chartData.map(d => d.netDebt));
        return min < 0 ? Math.floor(min * 1.1) : 0;
    }, [chartData, selectedMetrics]);

    const latestData = chartData[chartData.length - 1];
    const isNetCash = latestData && latestData.netDebt < 0;

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <ChartViewToggle viewMode={viewMode} onChange={setViewMode} />
                    {isNetCash && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            Net Cash Position
                        </span>
                    )}
                </div>
                <MetricToggleButtons
                    metrics={METRICS}
                    selected={selectedMetrics}
                    onToggle={k => setSelectedMetrics(prev => toggle(prev, k))}
                />
            </div>

            <div className="w-full" style={{ minHeight: 280 }}>
                <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart
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
                        <Tooltip content={<ChartTooltip metrics={METRICS} />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />
                        <ReferenceLine y={0} stroke="#9CA3AF" />

                        <Bar
                            dataKey="cash"
                            name="Liquidity"
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
                        {selectedMetrics.includes('netDebt') && (
                            <Line
                                type="monotone"
                                dataKey="netDebt"
                                name="Net Debt"
                                stroke="#6366F1"
                                strokeWidth={2}
                                strokeDasharray="5 3"
                                dot={{ r: 3, fill: '#6366F1' }}
                                activeDot={{ r: 5 }}
                                isAnimationActive={false}
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
