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
import { filterStatementsByViewMode, formatChartYAxis, buildPeriodLabel } from '@/lib/utils/chartUtils';
import { ChartViewToggle } from './shared/ChartViewToggle';
import { ChartQuarterTick } from './shared/ChartQuarterTick';
import { CHART_FONT } from '@/components/charts/chartTheme';
import { ChartTooltip } from './shared/ChartTooltip';
import { ChartBody, ChartControls, ChartPlot, ChartFootnote } from './shared/ChartFrame';
import { MetricToggleButtons, toggleMetric } from './shared/MetricToggleButtons';
import type { FinancialStatement } from './analysis/types';

// Re-export for backward compatibility (many files import from here)
export type { FinancialStatement };

interface FinancialChartProps {
    statements: FinancialStatement[];
}

const AVAILABLE_METRICS = [
    { key: 'revenue', label: 'Revenue', color: '#3B82F6' },
    { key: 'netIncome', label: 'Net Income', color: '#10B981' },
    { key: 'ebit', label: 'EBIT', color: '#F59E0B' },
] as const;

// Margins mode: same toggle keys, but EBIT→Op Margin % and Net Income→Net
// Margin % lines (revenue keeps its $ bars).
const MARGIN_METRICS = [
    { key: 'revenue', label: 'Revenue', color: '#3B82F6' },
    { key: 'netIncome', label: 'Net Margin', color: '#10B981' },
    { key: 'ebit', label: 'Op Margin', color: '#F59E0B' },
] as const;


export default function FinancialChart({ statements }: FinancialChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
    // 'levels' = $ grouped bars (current); 'margins' = Revenue bars ($) +
    // Operating/Net margin lines on a right % axis — surfaces the
    // "revenue grows while profitability shrinks" divergence that grouped
    // bars hide when Revenue dwarfs NI/EBIT.
    const [displayMode, setDisplayMode] = useState<'levels' | 'margins'>('levels');
    const [selectedMetrics, setSelectedMetrics] = useState(['revenue', 'netIncome', 'ebit']);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];
        const filtered = filterStatementsByViewMode(statements, viewMode);
        const sorted = [...filtered].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
        return sorted.map(s => {
            const ebitValue = s.ebit ?? 0;
            const label = buildPeriodLabel(s.fiscalPeriod, s.fiscalYear);
            const revM = s.revenue != null ? s.revenue / 1e6 : null;
            return {
                name: label,
                date: label,
                // null (not 0) for missing values — a missing quarter must not
                // render as a zero bar (indistinguishable from a real zero)
                revenue: revM,
                netIncome: s.netIncome != null ? s.netIncome / 1e6 : null,
                ebit: ebitValue / 1e6,
                opMargin: s.revenue != null && s.revenue > 0 && s.ebit != null
                    ? (s.ebit / s.revenue) * 100 : null,
                netMargin: s.revenue != null && s.revenue > 0 && s.netIncome != null
                    ? (s.netIncome / s.revenue) * 100 : null,
            };
        });
    }, [statements, viewMode]);

    const yMin = useMemo(() => {
        // Consider ALL selected metrics — clipping only netIncome hid negative
        // EBIT bars when netIncome was deselected. In margins mode the left
        // axis carries Revenue only (lines live on the right % axis).
        const values = chartData.flatMap(d =>
            selectedMetrics.map(k => {
                if (k === 'revenue') return d.revenue;
                if (displayMode === 'margins') return null;
                return (k === 'netIncome' || k === 'ebit' ? d[k] : null);
            })
        );
        const min = Math.min(0, ...(values.filter((v): v is number => v != null)));
        return min < 0 ? Math.floor(min * 1.1) : 0;
    }, [chartData, selectedMetrics, displayMode]);


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

    return (
        <ChartBody>
            <ChartControls className="justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <ChartViewToggle viewMode={viewMode} onChange={setViewMode} />
                    <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex">
                        {(['levels', 'margins'] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => setDisplayMode(m)}
                                className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${
                                    displayMode === m
                                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                }`}
                            >
                                {m === 'levels' ? 'Levels' : 'Margins'}
                            </button>
                        ))}
                    </div>
                </div>
                <MetricToggleButtons
                    metrics={displayMode === 'margins' ? MARGIN_METRICS : AVAILABLE_METRICS}
                    selected={selectedMetrics}
                    onToggle={k => setSelectedMetrics(prev => toggleMetric(prev, k))}
                />
            </ChartControls>

            <ChartPlot>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={chartData}
                        margin={{ top: 10, right: displayMode === 'margins' ? 4 : 10, left: 10, bottom: viewMode === 'quarterly' ? 8 : 5 }}
                        barGap={2}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                        <XAxis 
                            dataKey="date"
                            tick={viewMode === 'quarterly' ? <ChartQuarterTick chartData={chartData} /> : { fontSize: CHART_FONT.axis, fill: '#6B7280', fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                            dy={viewMode === 'annual' ? 6 : 0}
                            height={viewMode === 'quarterly' ? 44 : 24}
                        />
                        <YAxis 
                            yAxisId="left"
                            tickFormatter={formatChartYAxis} 
                            tick={{ fontSize: CHART_FONT.axis, fill: '#6B7280' }} 
                            axisLine={false}
                            tickLine={false}
                            width={50}
                            domain={[yMin, 'auto']}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            hide={displayMode !== 'margins'}
                            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                            tick={{ fontSize: CHART_FONT.axis, fill: '#6B7280' }}
                            axisLine={false}
                            tickLine={false}
                            width={42}
                            domain={['auto', 'auto']}
                        />
                        <Tooltip
                            content={<ChartTooltip metrics={displayMode === 'margins' ? MARGIN_METRICS : AVAILABLE_METRICS} percentKeys={['opMargin', 'netMargin']} />}
                            cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }}
                        />
                        <ReferenceLine y={0} yAxisId="left" stroke="#9CA3AF" />
                        
                        {/* Dynamické renderovanie vybraných metrík */}
                        <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#3B82F6" radius={[2, 2, 0, 0]} maxBarSize={40}
                            hide={!selectedMetrics.includes('revenue')} isAnimationActive={false} />
                        {displayMode === 'levels' && (
                            <>
                                <Bar yAxisId="left" dataKey="netIncome" name="Net Income" fill="#10B981" radius={[2, 2, 0, 0]} maxBarSize={40}
                                    hide={!selectedMetrics.includes('netIncome')} isAnimationActive={false} />
                                <Bar yAxisId="left" dataKey="ebit" name="EBIT" fill="#F59E0B" radius={[2, 2, 0, 0]} maxBarSize={40}
                                    hide={!selectedMetrics.includes('ebit')} isAnimationActive={false} />
                            </>
                        )}
                        {displayMode === 'margins' && (
                            <>
                                <Line yAxisId="right" type="monotone" dataKey="opMargin" name="Op Margin" stroke="#F59E0B" strokeWidth={2} dot={false}
                                    hide={!selectedMetrics.includes('ebit')} isAnimationActive={false} />
                                <Line yAxisId="right" type="monotone" dataKey="netMargin" name="Net Margin" stroke="#10B981" strokeWidth={2} dot={false}
                                    hide={!selectedMetrics.includes('netIncome')} isAnimationActive={false} />
                            </>
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </ChartPlot>

            <ChartFootnote />
        </ChartBody>
    );
}
