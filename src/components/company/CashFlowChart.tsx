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

interface CashFlowChartProps {
    statements: FinancialStatement[];
}

const METRICS = [
    { key: 'operatingCF', label: 'Operating CF', color: '#F59E0B' },
    { key: 'freeCF', label: 'Free Cash Flow', color: '#3B82F6' },
    { key: 'netIncome', label: 'Net Income', color: '#10B981' },
    { key: 'sbc', label: 'SBC', color: '#EC4899' },
] as const;

function formatYAxis(value: number): string {
    if (value === 0) return '0';
    const abs = Math.abs(value);
    if (abs >= 1000) return `$${(value / 1000).toFixed(1)}B`;
    if (abs >= 1) return `$${value.toFixed(0)}M`;
    return `$${value.toFixed(1)}M`;
}

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

export default function CashFlowChart({ statements }: CashFlowChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');

    // Determine which metrics have data
    const availableMetrics = useMemo(() => {
        const hasOperatingCF = statements.some(s => s.operatingCashFlow !== null);
        const hasSbc = statements.some(s => (s as any).sbc !== null && (s as any).sbc !== 0);
        const defaults = ['operatingCF', 'netIncome'];
        if (hasOperatingCF) defaults.push('freeCF'); // Always show freeCF if we have operating CF
        if (hasSbc) defaults.push('sbc');
        return defaults;
    }, [statements]);

    const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['operatingCF', 'freeCF', 'netIncome']);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];

        let filtered = statements;
        if (viewMode === 'annual') {
            filtered = statements.filter(s =>
                s.fiscalPeriod === 'FY' || s.fiscalPeriod === 'TTM' ||
                s.period === 'annual' || (s.fiscalPeriod && s.fiscalPeriod.startsWith('FY'))
            );
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
            filtered = statements.filter(s =>
                s.fiscalPeriod !== 'FY' && s.fiscalPeriod !== 'TTM' && s.period !== 'annual'
            );
        }

        const sorted = [...filtered].sort(
            (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
        );

        return sorted
            .filter(s => s.operatingCashFlow !== null || s.netIncome !== null)
            .map(s => {
                const ocf = (s.operatingCashFlow ?? 0) / 1e6;
                const capex = s.capex ? Math.abs(s.capex) / 1e6 : 0;
                const fcf = s.capex !== null ? ocf - capex : ocf; // approximate if no capex
                const ni = (s.netIncome ?? 0) / 1e6;
                const sbc = ((s as any).sbc ?? 0) / 1e6;
                const qMatch = s.fiscalPeriod?.match(/Q(\d)/);
                const shortYear = `'${String(s.fiscalYear).slice(2)}`;
                const label = qMatch ? `Q${qMatch[1]}${shortYear}` : shortYear;
                return { name: label, date: label, operatingCF: ocf, freeCF: fcf, netIncome: ni, sbc };
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

    if (!statements || statements.length === 0 || chartData.length === 0) {
        return (
            <div className="text-gray-500 text-sm p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="font-medium">No cash flow data available</p>
                <p className="text-xs mt-1">Click Refresh Analysis to fetch from Polygon.</p>
            </div>
        );
    }

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
                {showYear && <text x={0} y={30} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontWeight={500}>{year}</text>}
            </g>
        );
    };

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
                <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex">
                    <button onClick={() => setViewMode('annual')}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === 'annual' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                        Annual
                    </button>
                    <button onClick={() => setViewMode('quarterly')}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === 'quarterly' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                        Quarterly
                    </button>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {visibleMetrics.map(metric => (
                        <button key={metric.key} onClick={() => toggleMetric(metric.key)}
                            className={`text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-all ${selectedMetrics.includes(metric.key) ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-200 dark:bg-gray-700'}`}
                            style={{ backgroundColor: selectedMetrics.includes(metric.key) ? metric.color : undefined }}>
                            {metric.label}{selectedMetrics.includes(metric.key) && <span className="ml-1">✓</span>}
                        </button>
                    ))}
                </div>
            </div>
            <div className="w-full" style={{ minHeight: 320 }}>
                <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: viewMode === 'quarterly' ? 8 : 5 }} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                        <XAxis dataKey="date" tick={viewMode === 'quarterly' ? <CustomQuarterTick /> : { fontSize: 11, fill: '#6B7280', fontWeight: 500 }}
                            axisLine={false} tickLine={false} interval={0} dy={viewMode === 'annual' ? 6 : 0} height={viewMode === 'quarterly' ? 44 : 24} />
                        <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} width={55} domain={[yMin, 'auto']} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />
                        <ReferenceLine y={0} stroke="#9CA3AF" />
                        {selectedMetrics.includes('operatingCF') && <Bar dataKey="operatingCF" name="Operating CF" fill="#F59E0B" radius={[2, 2, 0, 0]} maxBarSize={40} />}
                        {selectedMetrics.includes('freeCF') && <Bar dataKey="freeCF" name="Free Cash Flow" fill="#3B82F6" radius={[2, 2, 0, 0]} maxBarSize={40} />}
                        {selectedMetrics.includes('netIncome') && <Bar dataKey="netIncome" name="Net Income" fill="#10B981" radius={[2, 2, 0, 0]} maxBarSize={40} />}
                        {selectedMetrics.includes('sbc') && <Bar dataKey="sbc" name="SBC" fill="#EC4899" radius={[2, 2, 0, 0]} maxBarSize={40} />}
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Tip:</strong> Free Cash Flow = Operating Cash Flow − Capital Expenditures. FCF represents cash available for dividends, buybacks, and debt repayment.
                </p>
            </div>
        </div>
    );
}
