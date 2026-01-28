'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { CompanyNode } from './MarketHeatmap';
import styles from '@/styles/heatmap.module.css';
import { MarketHeatmap } from './MarketHeatmap';
import { useElementResize } from './MarketHeatmap';

interface PortfolioPerformanceTreemapProps {
    data: Array<{
        ticker: string;
        value: number; // Position Value
        dailyChangePercent: number; // Daily % Change
        dailyChangeValue: number; // Daily $ Change (P&L)
        sector?: string;
        industry?: string;
    }>;
}

export function PortfolioPerformanceTreemap({ data }: PortfolioPerformanceTreemapProps) {
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
            // Map Absolute Daily P&L to marketCap (Size)
            // Use Math.max(0.01, ...) to ensure even flat stocks exist in hierarchy, 
            // though d3 might hide tiny ones.
            marketCap: Math.max(0.01, Math.abs(item.dailyChangeValue)),
            changePercent: item.dailyChangePercent, // Color
            marketCapDiff: item.dailyChangeValue, // Tooltip value
            currentPrice: 0,
            isStale: false
        }));
    }, [data]);

    return (
        <div className="w-full p-4 md:p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider flex justify-between items-center">
                <span>Performance Map (Daily P&L)</span>
                <span className="text-xs normal-case opacity-70">
                    Size = |Daily P&L| • Color = Daily Change %
                </span>
            </h3>

            <div
                ref={ref}
                className={`relative w-full h-[600px] bg-black overflow-hidden select-none ${styles.heatmapContainer}`}
                style={{ backgroundColor: '#000000' }}
            >
                {width > 0 && height > 0 && (
                    <MarketHeatmap
                        data={heatmapData}
                        width={width}
                        height={height}
                        timeframe="day"
                        metric="percent" // Color by Percent
                        sectorLabelVariant="compact"
                    />
                )}
            </div>
        </div>
    );
}
