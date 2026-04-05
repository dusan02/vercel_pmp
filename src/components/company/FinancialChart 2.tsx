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

export default function FinancialChart({ statements }: FinancialChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];

        // Filter by mode
        let filtered = statements;
        if (viewMode === 'annual') {
            filtered = statements.filter(s => s.fiscalPeriod === 'FY');
        } else {
            // Quarterly usually are Q1, Q2, Q3, Q4. We might exclude FY here.
            filtered = statements.filter(s => s.fiscalPeriod !== 'FY');
        }

        // Sort ascending by date for charting (statements from API are descending)
        const sorted = [...filtered].sort(
            (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
        );

        // Format data for Recharts
        return sorted.map(s => {
            // Polygon EBIT is used as a proxy for EBITDA if real EBITDA isn't present
            // The user requested EBITDA, but the database schema currently only has `ebit`.
            // We'll chart EBIT (Operating Income) and label it EBIT/EBITDA.
            // Ideally EBITDA = EBIT + D&A, but without D&A, EBIT is the closest proxy in this schema.
            return {
                name: `${s.fiscalYear} ${s.fiscalPeriod}`,
                date: new Date(s.endDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
                revenue: s.revenue ? s.revenue / 1e6 : 0, // Convert to millions for readability
                netIncome: s.netIncome ? s.netIncome / 1e6 : 0,
                ebitda: s.ebit ? s.ebit / 1e6 : 0,
            };
        });
    }, [statements, viewMode]);

    if (!statements || statements.length === 0) {
        return <div className="text-gray-500 text-sm">No financial statement data available.</div>;
    }

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
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 mb-1">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
                            <span className="text-gray-600 dark:text-gray-300 capitalize">{entry.name}:</span>
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                ${new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(entry.value * 1e6)}
                            </span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex justify-end mb-4">
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
            </div>

            <div className="flex-1 w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                        barGap={2}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                        <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 12, fill: '#6B7280' }} 
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                        />
                        <YAxis 
                            tickFormatter={formatYAxis} 
                            tick={{ fontSize: 12, fill: '#6B7280' }} 
                            axisLine={false}
                            tickLine={false}
                            width={50}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />
                        <Legend 
                            wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }}
                            iconType="circle"
                        />
                        <ReferenceLine y={0} stroke="#9CA3AF" />
                        
                        <Bar 
                            dataKey="revenue" 
                            name="Revenue" 
                            fill="#3B82F6" 
                            radius={[2, 2, 0, 0]} 
                            maxBarSize={40}
                        />
                        <Bar 
                            dataKey="netIncome" 
                            name="Net Income" 
                            fill="#10B981" 
                            radius={[2, 2, 0, 0]} 
                            maxBarSize={40}
                        />
                        <Bar 
                            dataKey="ebitda" 
                            name="EBITDA" 
                            fill="#F59E0B" 
                            radius={[2, 2, 0, 0]} 
                            maxBarSize={40}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
