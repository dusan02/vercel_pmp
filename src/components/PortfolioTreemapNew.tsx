'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { CompanyNode } from './MarketHeatmap';
import styles from '@/styles/heatmap.module.css';
import { MarketHeatmap } from './MarketHeatmap';
import { useElementResize } from './MarketHeatmap';
import { formatCurrencyCompact, formatPercent } from '@/lib/utils/format';

interface PortfolioPerformanceTreemapProps {
    data: Array<{
        ticker: string;
        value: number; // Position Value
        dailyChangePercent: number; // Daily % Change
        dailyChangeValue: number; // Daily $ Change (P&L)
        sector?: string;
        industry?: string;
    }>;
    metric?: 'percent' | 'dollar';
}

export function PortfolioPerformanceTreemap({ data, metric = 'percent' }: PortfolioPerformanceTreemapProps) {
    const { ref, size } = useElementResize();
    const width = size.width;
    const height = size.height;

    // Transform portfolio data to CompanyNode format
    // Logic changed per user request:
    // Size = Absolute Daily P&L (Magnitude of Gain/Loss)
    // Color = Daily % Change (Performance)
    const heatmapData: CompanyNode[] = useMemo(() => {
        return data.map(item => ({
            symbol: item.ticker,
            name: item.ticker,
            sector: item.sector || 'Unknown',
            industry: item.industry || 'Unknown',


            // Size = Position Value (always, for stability) determines importance in portfolio
            marketCap: Math.max(0.01, item.value),
            // Color/Change logic depends on metric
            changePercent: metric === 'percent' ? item.dailyChangePercent : item.dailyChangeValue,
            marketCapDiff: item.dailyChangeValue, // Tooltip value
            // Provide formatted display value for custom rendering
            // User Request: Show both % change AND dollar value in the square
            displayValue: `${formatPercent(item.dailyChangePercent)}\n${formatCurrencyCompact(item.dailyChangeValue, true)}`,
            currentPrice: 0,
            isStale: false
        }));
    }, [data, metric]);

    return (
        <div className="w-full p-4 md:p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider">
                Performance Map (Daily P&L)
            </h3>

            <div
                ref={ref}
                className="relative w-full overflow-hidden select-none"
                style={{
                    width: '100%',
                    height: '600px',
                    minHeight: '600px',
                    backgroundColor: '#000000',
                    color: 'white' // ensure any text inside is visible against black
                }}
            >
                {width > 0 && height > 0 && (
                    <MarketHeatmap
                        data={heatmapData}
                        width={width}
                        height={height}
                        timeframe="day"
                        metric={metric === 'dollar' ? 'mcap' : 'percent'} // Map 'dollar' to 'mcap' which MarketHeatmap interprets as absolute value coloring
                        sectorLabelVariant="compact"
                    />
                )}
            </div>
        </div>
    );
}
