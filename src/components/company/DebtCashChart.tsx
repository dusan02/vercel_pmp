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

interface DebtCashChartProps {
    statements: FinancialStatement[];
}

const METRICS = [
    { key: 'cash', label: 'Liquidity (Cash & ST. Inv)', color: '#10B981' },
    { key: 'totalDebt', label: 'Total Debt', color: '#EF4444' },
    { key: 'netDebt', label: 'Net Debt', color: '#6B7280' }
] as const;

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    
    // Find specific values
    const cashEntry = payload.find((p: any) => p.dataKey === 'cash');
    const debtEntry = payload.find((p: any) => p.dataKey === 'totalDebt');
    const netDebtEntry = payload.find((p: any) => p.dataKey === 'netDebt');

    const cash = cashEntry ? cashEntry.value * 1e6 : 0;
    const debt = debtEntry ? debtEntry.value * 1e6 : 0;
    const netDebt = netDebtEntry ? netDebtEntry.value * 1e6 : 0;

    const formatter = new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' });

    return (
        <div className="bg-white dark:bg-gray-800 p-4 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl text-sm min-w-[200px]">
            <p className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                {label}
            </p>
            
            <div className="space-y-2">
                <div className="flex justify-between items-center gap-4">
                    <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                        Liquidity
                    </span>
                    <span className="font-medium">${formatter.format(cash)}</span>
                </div>
                <div className="flex justify-between items-center gap-4">
                    <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                        Total Debt
                    </span>
                    <span className="font-medium">${formatter.format(debt)}</span>
                </div>
                
                <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center gap-4">
                    <span className="flex items-center gap-1.5 text-gray-900 dark:text-white font-medium">
                        <span className="w-2.5 h-0.5 bg-gray-500" />
                        Net Debt
                    </span>
                    <span className={`font-bold ${netDebt <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {netDebt <= 0 ? `-$${formatter.format(Math.abs(netDebt))}` : `$${formatter.format(netDebt)}`}
                    </span>
                </div>
            </div>

            {/* AI Context insight */}
            {debt > 0 && cash > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                    {cash >= debt 
                        ? `👍 Company can pay off all debt using its liquidity (${(cash / debt).toFixed(1)}x coverage).` 
                        : `⚠️ Liquidity covers only ${((cash / debt) * 100).toFixed(0)}% of total debt.`}
                </div>
            )}
        </div>
    );
}

export default function DebtCashChart({ statements }: DebtCashChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['cash', 'totalDebt', 'netDebt']);

    const { chartData, latestAnalysis } = useMemo(() => {
        if (!statements || statements.length === 0) return { chartData: [], latestAnalysis: null };
        const filtered = filterStatementsByViewMode(statements, viewMode);
        const sorted = [...filtered].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
        
        const data = sorted
            .filter(s => s.totalDebt !== null || s.cashAndEquivalents !== null)
            .map(s => {
                const cashVal = (s.cashAndEquivalents ?? 0) / 1e6;
                const debtVal = (s.totalDebt ?? 0) / 1e6;
                const netDebt = debtVal - cashVal;
                
                const label = buildPeriodLabel(s.fiscalPeriod, s.fiscalYear);
                return { name: label, date: label, cash: cashVal, totalDebt: debtVal, netDebt };
            });

        // Analysis of latest period for badges
        const latest = data[data.length - 1];
        let analysis = null;
        if (latest) {
            analysis = {
                isNetCash: latest.netDebt <= 0,
                netDebtValue: latest.netDebt,
                coverageRatio: latest.totalDebt > 0 ? latest.cash / latest.totalDebt : null
            };
        }

        return { chartData: data, latestAnalysis: analysis };
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

    // Determine Y-axis domain dynamically to handle negative Net Debt nicely
    const minNetDebt = Math.min(...chartData.map(d => d.netDebt));
    const yMin = minNetDebt < 0 ? Math.floor(minNetDebt * 1.1) : 0;

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                <div className="flex flex-col gap-2">
                    <ChartViewToggle viewMode={viewMode} onChange={setViewMode} />
                    
                    {/* Dynamic AI Badges */}
                    {latestAnalysis && (
                        <div className="flex gap-2 items-center mt-1">
                            {latestAnalysis.isNetCash ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                    Net Cash Position
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                    Net Debt Position
                                </span>
                            )}
                            
                            {latestAnalysis.coverageRatio !== null && latestAnalysis.coverageRatio < 0.2 && !latestAnalysis.isNetCash && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                    Low Liquidity
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-1.5 sm:gap-2 self-start">
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
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />

                        {/* Zero Line for Net Debt */}
                        <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="3 3" className="dark:stroke-gray-600" />

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
                        <Line
                            type="monotone"
                            dataKey="netDebt"
                            name="Net Debt"
                            stroke="#4B5563"
                            strokeWidth={3}
                            dot={{ r: 3, fill: '#4B5563', strokeWidth: 2, stroke: '#fff' }}
                            activeDot={{ r: 5, fill: '#111827', strokeWidth: 2, stroke: '#fff' }}
                            hide={!selectedMetrics.includes('netDebt')}
                            isAnimationActive={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Info Panel */}
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700/50">
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    <strong>Net Debt</strong> indicates the overall debt situation. A value below zero (Net Cash) means the company has more liquidity than debt, showing strong financial safety. 
                    Liquidity shown represents cash, equivalents, and short-term investments.
                </p>
            </div>
        </div>
    );
}
