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
import { FinancialStatement } from './FinancialChart';
import { filterStatementsByViewMode, formatChartYAxis, buildPeriodLabel } from '@/lib/utils/chartUtils';
import { ChartViewToggle } from './shared/ChartViewToggle';
import { ChartQuarterTick } from './shared/ChartQuarterTick';
import { ChartTooltip } from './shared/ChartTooltip';
import { MetricToggleButtons, toggleMetric as toggle } from './shared/MetricToggleButtons';

interface CashFlowChartProps {
    statements: FinancialStatement[];
}

const METRICS = [
    { key: 'operatingCF', label: 'Operating CF', color: '#F59E0B' },
    { key: 'freeCF', label: 'Free Cash Flow', color: '#3B82F6' },
    { key: 'netIncome', label: 'Net Income', color: '#10B981' },
    { key: 'sbc', label: 'SBC', color: '#EC4899' },
] as const;

export default function CashFlowChart({ statements }: CashFlowChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');

    // Determine which metrics have data
    const availableMetrics = useMemo(() => {
        const hasOperatingCF = statements.some(s => s.operatingCashFlow !== null);
        const hasSbc = statements.some(s => s.sbc !== null && s.sbc !== 0);
        const defaults = ['operatingCF', 'netIncome'];
        if (hasOperatingCF) defaults.push('freeCF'); // Always show freeCF if we have operating CF
        if (hasSbc) defaults.push('sbc');
        return defaults;
    }, [statements]);

    const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['operatingCF', 'freeCF', 'netIncome']);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];
        const filtered = filterStatementsByViewMode(statements, viewMode);
        const sorted = [...filtered].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
        return sorted.map(s => {
            const ocf = (s.operatingCashFlow ?? 0) / 1e6;
            const capex = s.capex ? Math.abs(s.capex) / 1e6 : 0;
            const fcf = s.capex !== null ? ocf - capex : ocf;
            const ni = (s.netIncome ?? 0) / 1e6;
            const sbc = (s.sbc ?? 0) / 1e6;
            const label = buildPeriodLabel(s.fiscalPeriod, s.fiscalYear);
            return { name: label, date: label, operatingCF: ocf, freeCF: fcf, netIncome: ni, sbc };
        });
    }, [statements, viewMode]);


    if (!statements || statements.length === 0 || chartData.length === 0) {
        return (
            <div className="text-gray-500 text-sm p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="font-medium">No cash flow data available</p>
                <p className="text-xs mt-1">Click Refresh Analysis to fetch data.</p>
            </div>
        );
    }

    const yMin = useMemo(() => {
        const allVals = chartData.flatMap(d => {
            const vals: number[] = [];
            if (selectedMetrics.includes('operatingCF')) vals.push(d.operatingCF);
            if (selectedMetrics.includes('freeCF')) vals.push(d.freeCF);
            if (selectedMetrics.includes('netIncome')) vals.push(d.netIncome);
            return vals;
        });
        const min = Math.min(0, ...allVals);
        return min < 0 ? Math.floor(min * 1.1) : 0;
    }, [chartData, selectedMetrics]);

    // Filter METRICS to only show ones with data
    const visibleMetrics = METRICS.filter(m => availableMetrics.includes(m.key));

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                <ChartViewToggle viewMode={viewMode} onChange={setViewMode} />
                <MetricToggleButtons
                    metrics={visibleMetrics}
                    selected={selectedMetrics}
                    onToggle={k => setSelectedMetrics(prev => toggle(prev, k))}
                />
            </div>
            <div className="w-full" style={{ minHeight: 260 }}>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: viewMode === 'quarterly' ? 8 : 5 }} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                        <XAxis dataKey="date" tick={viewMode === 'quarterly' ? <ChartQuarterTick chartData={chartData} /> : { fontSize: 11, fill: '#6B7280', fontWeight: 500 }}
                            axisLine={false} tickLine={false} interval={0} dy={viewMode === 'annual' ? 6 : 0} height={viewMode === 'quarterly' ? 44 : 24} />
                        <YAxis tickFormatter={formatChartYAxis} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} width={55} domain={[yMin, 'auto']} />
                        <Tooltip content={<ChartTooltip metrics={METRICS} />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />
                        <ReferenceLine y={0} stroke="#9CA3AF" />
                        <Bar dataKey="operatingCF" name="Operating CF" fill="#F59E0B" radius={[2, 2, 0, 0]} maxBarSize={40}
                            hide={!selectedMetrics.includes('operatingCF')} isAnimationActive={false} />
                        <Bar dataKey="freeCF" name="Free Cash Flow" fill="#3B82F6" radius={[2, 2, 0, 0]} maxBarSize={40}
                            hide={!selectedMetrics.includes('freeCF')} isAnimationActive={false} />
                        <Bar dataKey="netIncome" name="Net Income" fill="#10B981" radius={[2, 2, 0, 0]} maxBarSize={40}
                            hide={!selectedMetrics.includes('netIncome')} isAnimationActive={false} />
                        <Bar dataKey="sbc" name="SBC" fill="#EC4899" radius={[2, 2, 0, 0]} maxBarSize={40}
                            hide={!selectedMetrics.includes('sbc')} isAnimationActive={false} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
