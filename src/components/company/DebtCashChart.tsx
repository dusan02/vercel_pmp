import React, { useState, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { FinancialStatement } from './FinancialChart';

interface DebtCashChartProps {
    statements: FinancialStatement[];
}

const METRICS = [
    { key: 'cash', label: 'Cash & Equivalents', color: '#10B981' },
    { key: 'totalDebt', label: 'Total Debt', color: '#EF4444' },
    { key: 'netDebt', label: 'Net Debt', color: '#8B5CF6' },
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

export default function DebtCashChart({ statements }: DebtCashChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
    const [selectedMetrics, setSelectedMetrics] = useState(['cash', 'totalDebt']);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];

        let filtered = statements;
        if (viewMode === 'annual') {
            filtered = statements.filter(s =>
                s.fiscalPeriod === 'FY' ||
                s.fiscalPeriod === 'TTM' ||
                s.period === 'annual' ||
                (s.fiscalPeriod && s.fiscalPeriod.startsWith('FY'))
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
                s.fiscalPeriod !== 'FY' &&
                s.fiscalPeriod !== 'TTM' &&
                s.period !== 'annual'
            );
        }

        const sorted = [...filtered].sort(
            (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
        );

        return sorted
            .filter(s => s.totalDebt !== null || s.cashAndEquivalents !== null)
            .map(s => {
                const cashVal = (s.cashAndEquivalents ?? 0) / 1e6;
                const debtVal = (s.totalDebt ?? 0) / 1e6;
                const qMatch = s.fiscalPeriod?.match(/Q(\d)/);
                const shortYear = `'${String(s.fiscalYear).slice(2)}`;
                const label = qMatch
                    ? `Q${qMatch[1]}${shortYear}`
                    : shortYear;
                return {
                    name: label,
                    date: label,
                    cash: cashVal,
                    totalDebt: debtVal,
                    netDebt: debtVal - cashVal,
                };
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

    // Custom tick for quarterly mode
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

    const yMin = useMemo(() => {
        if (!selectedMetrics.includes('netDebt')) return 0;
        const min = Math.min(0, ...chartData.map(d => d.netDebt));
        return min < 0 ? Math.floor(min * 1.1) : 0;
    }, [chartData, selectedMetrics]);

    return (
        <div className="w-full h-full flex flex-col">
            {/* Control Panel — wraps on mobile */}
            <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
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
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {METRICS.map(metric => (
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
                            tick={viewMode === 'quarterly' ? <CustomQuarterTick /> : { fontSize: 11, fill: '#6B7280', fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            dy={viewMode === 'annual' ? 6 : 0}
                            height={viewMode === 'quarterly' ? 44 : 24}
                        />
                        <YAxis
                            tickFormatter={formatYAxis}
                            tick={{ fontSize: 12, fill: '#6B7280' }}
                            axisLine={false}
                            tickLine={false}
                            width={55}
                            domain={[yMin, 'auto']}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />

                        {selectedMetrics.includes('cash') && (
                            <Bar
                                dataKey="cash"
                                name="Cash & Equivalents"
                                fill="#10B981"
                                radius={[2, 2, 0, 0]}
                                maxBarSize={40}
                            />
                        )}
                        {selectedMetrics.includes('totalDebt') && (
                            <Bar
                                dataKey="totalDebt"
                                name="Total Debt"
                                fill="#EF4444"
                                radius={[2, 2, 0, 0]}
                                maxBarSize={40}
                            />
                        )}
                        {selectedMetrics.includes('netDebt') && (
                            <Bar
                                dataKey="netDebt"
                                name="Net Debt"
                                fill="#8B5CF6"
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
                    <strong>Tip:</strong> Cash &amp; Equivalents includes short-term investments. Total Debt includes both long-term and current debt obligations. Net Debt = Total Debt − Cash.
                </p>
            </div>
        </div>
    );
}
