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

            // Size = Absolute Daily P&L (Magnitude of Gain/Loss) - as requested by user
            marketCap: Math.max(0.01, Math.abs(item.dailyChangeValue)),
            // Color/Change logic depends on metric (default to dailyChangePercent for color intensity)
            changePercent: metric === 'percent' ? item.dailyChangePercent : item.dailyChangeValue,
            marketCapDiff: item.dailyChangeValue, // Tooltip value
            // Provide formatted display value for custom rendering
            // User Request: Show both % change AND dollar value in the square
            displayValue: `${formatPercent(item.dailyChangePercent)}\n${formatCurrencyCompact(item.dailyChangeValue, true)}`,
            currentPrice: 0,
            isStale: false
        }));
    }, [data, metric]);

    // Dynamic height based on number of stocks to prevent giant empty squares
    // Min 250px, Max 600px. Approx 100px per row/item logic?
    // If 1 item, aspect ratio should be reasonable (e.g. 16:9 or 2:1), not 1:3 vertical.
    // Let's use a base height and clamp it.
    const dynamicHeight = Math.min(600, Math.max(250, heatmapData.length * 120));

    return (
        <div className="w-full p-4 md:p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider">
                Performance Map (Daily P&L)
            </h3>

            <div
                ref={ref}
                className="relative w-full overflow-y-auto overflow-x-hidden select-none"
                style={{
                    width: '100%',
                    height: `${dynamicHeight}px`,
                    minHeight: '250px',
                    backgroundColor: '#000000',
                    color: 'white' // ensure any text inside is visible against black
                }}
            >
                {width > 0 && dynamicHeight > 0 && (
                    <MarketHeatmap
                        data={heatmapData}
                        width={width}
                        height={dynamicHeight}
                        timeframe="day"
                        metric={metric === 'dollar' ? 'mcap' : 'percent'} // Map 'dollar' to 'mcap' which MarketHeatmap interprets as absolute value coloring
                        sectorLabelVariant="compact"
                    />
                )}
            </div>
        </div>
    );
}
