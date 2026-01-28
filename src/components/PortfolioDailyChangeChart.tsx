'use client';

import React, { useMemo } from 'react';

interface PortfolioDailyChangeChartProps {
    data: Array<{
        ticker: string;
        dailyChange: number;
    }>;
}

export function PortfolioDailyChangeChart({ data }: PortfolioDailyChangeChartProps) {
    const chartData = useMemo(() => {
        // Sort by dailyChange descending (highest gain first)
        return [...data].sort((a, b) => b.dailyChange - a.dailyChange);
    }, [data]);

    const maxAbsValue = useMemo(() => {
        return Math.max(...chartData.map(d => Math.abs(d.dailyChange)), 0);
    }, [chartData]);

    if (chartData.length === 0 || maxAbsValue === 0) {
        return null;
    }

    return (
        <div className="w-full p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider">
                Daily Change
            </h3>

            <div className="flex items-end gap-2 h-48 min-w-max pb-2">
                {chartData.map((item) => {
                    const isPositive = item.dailyChange >= 0;
                    const heightPercent = maxAbsValue > 0 ? (Math.abs(item.dailyChange) / maxAbsValue) * 100 : 0;
                    // Ensure at least some visibility for small values
                    const displayHeight = Math.max(heightPercent, 2);

                    return (
                        <div key={item.ticker} className="flex flex-col items-center group w-12 sm:w-16">
                            {/* Value label above bar (visible on hover) */}
                            <div className="mb-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium whitespace-nowrap z-10">
                                <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                                    {item.dailyChange > 0 ? '+' : ''}
                                    ${Math.abs(item.dailyChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                            </div>

                            {/* Bar */}
                            <div
                                className={`w-full rounded-t-sm transition-all duration-300 ${isPositive ? 'bg-green-400 dark:bg-green-600/60 hover:bg-green-500' : 'bg-red-400 dark:bg-red-600/60 hover:bg-red-500'
                                    }`}
                                style={{ height: `${displayHeight}%` }}
                            />

                            {/* Baseline */}
                            <div className="w-full h-px bg-gray-200 dark:bg-gray-700" />

                            {/* Ticker label */}
                            <div className="mt-2 text-xs font-bold text-gray-700 dark:text-gray-300 text-center">
                                {item.ticker}
                            </div>

                            {/* Change Value below ticker */}
                            <div className={`text-[10px] font-medium text-center ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                {item.dailyChange > 0 ? '+' : ''}
                                {Math.abs(item.dailyChange) >= 1000
                                    ? `$${(Math.abs(item.dailyChange) / 1000).toFixed(1)}k`
                                    : `$${Math.abs(item.dailyChange).toFixed(0)}`
                                }
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
