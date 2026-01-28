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
            <h3 className="text-sm font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider">
                Daily Change
            </h3>

            <div className="flex gap-2 h-64 min-w-max pb-2">
                {chartData.map((item) => {
                    const isPositive = item.dailyChange >= 0;
                    const rawHeight = maxAbsValue > 0 ? (Math.abs(item.dailyChange) / maxAbsValue) * 100 : 0;
                    // Ensure minimal visibility line even for 0
                    const heightPercent = Math.max(rawHeight, 1);

                    return (
                        <div key={item.ticker} className="flex flex-col items-center h-full group w-12 sm:w-16">
                            {/* Bar container - takes available vertical space */}
                            <div className="flex-1 w-full flex items-end justify-center relative">
                                {/* Value label above bar */}
                                <div className="mb-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium whitespace-nowrap z-10 absolute bottom-full">
                                    <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                                        {item.dailyChange > 0 ? '+' : ''}
                                        ${Math.abs(item.dailyChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </span>
                                </div>

                                {/* Bar */}
                                <div
                                    className={`w-full rounded-t-sm transition-all duration-300 ${isPositive ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                                        }`}
                                    style={{ height: `${heightPercent}%`, minHeight: '4px' }}
                                ></div>
                            </div>

                            {/* Baseline */}
                            <div className="w-full h-px bg-gray-200 dark:bg-gray-700" />

                            {/* Ticker label */}
                            <div className="mt-2 text-xs font-bold text-[var(--clr-text)] text-center truncate w-full">
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
