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
import { filterStatementsByViewMode, buildPeriodLabel } from '@/lib/utils/chartUtils';
import { ChartViewToggle } from './shared/ChartViewToggle';
import { ChartQuarterTick } from './shared/ChartQuarterTick';

interface ShareDilutionChartProps {
    statements: FinancialStatement[];
}

function formatSharesAxis(value: number): string {
    if (value === 0) return '0';
    const abs = Math.abs(value);
    if (abs >= 1000) return `${(value / 1000).toFixed(1)}B`;
    if (abs >= 1) return `${value.toFixed(0)}M`;
    return `${value.toFixed(1)}M`;
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm">
            <p className="font-bold text-gray-900 dark:text-gray-100 mb-2">{label}</p>
            {payload.map((entry: any, i: number) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-gray-600 dark:text-gray-300">{entry.name}:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {entry.dataKey === 'buybackRatio'
                            ? `${entry.value.toFixed(2)}%`
                            : new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(entry.value * 1e6)
                        }
                    </span>
                </div>
            ))}
        </div>
    );
}

export default function ShareDilutionChart({ statements }: ShareDilutionChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
    const [showBuyback, setShowBuyback] = useState(true);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];

        const filtered = filterStatementsByViewMode(statements, viewMode);
        const sorted = [...filtered]
            .filter(s => s.sharesOutstanding !== null && s.sharesOutstanding > 0)
            .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

        return sorted.map((s, idx) => {
            const shares = (s.sharesOutstanding ?? 0) / 1e6; // in millions
            const prev = idx > 0 ? sorted[idx - 1] : undefined;
            const prevShares = prev?.sharesOutstanding
                ? prev.sharesOutstanding / 1e6
                : null;
            // Buyback ratio: positive = shares decreased (buyback), negative = dilution
            const buybackRatio = prevShares && prevShares > 0
                ? ((prevShares - shares) / prevShares) * 100
                : 0;
            const label = buildPeriodLabel(s.fiscalPeriod, s.fiscalYear);
            return { name: label, date: label, shares, buybackRatio };
        });
    }, [statements, viewMode]);

    if (!statements || statements.length === 0 || chartData.length === 0) {
        return (
            <div className="text-gray-500 text-sm p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="font-medium">No share count data available</p>
                <p className="text-xs mt-1">Click Refresh Analysis to fetch from Polygon.</p>
            </div>
        );
    }

    const maxBuyback = Math.max(...chartData.map(d => Math.abs(d.buybackRatio)), 1);
    const buybackDomain = [-maxBuyback * 1.2, maxBuyback * 1.2];

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                <ChartViewToggle viewMode={viewMode} onChange={setViewMode} />
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    <button className="text-[10px] px-2 py-1 rounded font-medium text-white shadow-sm" style={{ backgroundColor: '#3B82F6' }}>
                        Shares Outstanding ✓
                    </button>
                    <button onClick={() => setShowBuyback(!showBuyback)}
                        className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${showBuyback ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-200 dark:bg-gray-700'}`}
                        style={{ backgroundColor: showBuyback ? '#10B981' : undefined }}>
                        Buyback Ratio %{showBuyback && <span className="ml-1">✓</span>}
                    </button>
                </div>
            </div>
            <div className="w-full" style={{ minHeight: 320 }}>
                <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: showBuyback ? 50 : 10, left: 10, bottom: viewMode === 'quarterly' ? 8 : 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                        <XAxis dataKey="date"
                            tick={viewMode === 'quarterly' ? <ChartQuarterTick chartData={chartData} /> : { fontSize: 11, fill: '#6B7280', fontWeight: 500 }}
                            axisLine={false} tickLine={false} interval={0} dy={viewMode === 'annual' ? 6 : 0} height={viewMode === 'quarterly' ? 44 : 24} />
                        <YAxis yAxisId="left" tickFormatter={formatSharesAxis} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} width={55} />
                        {showBuyback && (
                            <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                                tick={{ fontSize: 11, fill: '#10B981' }} axisLine={false} tickLine={false} width={45} domain={buybackDomain} />
                        )}
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />
                        <ReferenceLine yAxisId="left" y={0} stroke="#9CA3AF" />
                        <Bar yAxisId="left" dataKey="shares" name="Shares Outstanding" fill="#3B82F6" radius={[2, 2, 0, 0]} maxBarSize={40} />
                        {showBuyback && (
                            <Line yAxisId="right" type="monotone" dataKey="buybackRatio" name="Buyback Ratio %"
                                stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: '#10B981' }} activeDot={{ r: 5 }} />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Tip:</strong> Positive buyback ratio = shares decreased (buybacks). Negative = dilution (new shares issued). Consistent buybacks indicate shareholder-friendly management.
                </p>
            </div>
        </div>
    );
}
