'use client';

import React, { useMemo, useState, useRef } from 'react';
import * as d3Hierarchy from 'd3-hierarchy';
import { getColorForPercentChange } from '@/lib/utils/heatmapColors';
import styles from '@/styles/heatmap.module.css';

interface PortfolioPerformanceTreemapProps {
    data: Array<{
        ticker: string;
        value: number; // Size (Position Value)
        dailyChangePercent: number; // Color (Performance)
        dailyChangeValue: number; // Tooltip info
    }>;
}

export function PortfolioPerformanceTreemap({ data }: PortfolioPerformanceTreemapProps) {
    const [tooltipParams, setTooltipParams] = useState<{
        x: number;
        y: number;
        item: PortfolioPerformanceTreemapProps['data'][0];
    } | null>(null);

    const chartRef = useRef<HTMLDivElement>(null);

    const { root, width, height } = useMemo(() => {
        // Dimensions - maintain 16:9 or similar aspect ratio for consistent squarification
        const w = 1200;
        const h = 600;

        if (data.length === 0) return { root: null, width: w, height: h };

        const rootData = {
            name: 'Portfolio',
            children: data
        };

        const hierarchy = d3Hierarchy.hierarchy(rootData)
            .sum((d: any) => d.value)
            .sort((a, b) => (b.value || 0) - (a.value || 0)); // Sort Size Descending

        const treemapLayout = d3Hierarchy.treemap()
            .size([w, h])
            .padding(1)
            .round(true)
            .tile(d3Hierarchy.treemapSquarify); // Standard squarify tiling

        treemapLayout(hierarchy as any);

        return { root: hierarchy as any, width: w, height: h };
    }, [data]);

    if (!root) return null;

    return (
        <div className="w-full p-4 md:p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider flex justify-between items-center">
                <span>Performance Map (Daily)</span>
                <span className="text-xs normal-case opacity-70">
                    Size = Value • Color = Daily Change
                </span>
            </h3>

            <div
                className={`relative w-full aspect-[2/1] bg-black overflow-hidden select-none ${styles.heatmapContainer}`}
                style={{ backgroundColor: '#000000' }}
                ref={chartRef}
                onMouseLeave={() => setTooltipParams(null)}
            >
                {/* 
                    Using 'styles.heatmapContainer' gives the black bg and overflow hidden.
                    We map d3 coordinates (based on 1200x600) to percentages for responsiveness.
                */}
                {root.leaves().map((leaf: any) => {
                    const x0 = (leaf.x0 / width) * 100;
                    const x1 = (leaf.x1 / width) * 100;
                    const y0 = (leaf.y0 / height) * 100;
                    const y1 = (leaf.y1 / height) * 100;

                    const wPercent = x1 - x0;
                    const hPercent = y1 - y0;

                    const item = leaf.data;
                    const color = getColorForPercentChange(item.dailyChangePercent, 'day');
                    const isSmall = wPercent < 3 || hPercent < 5; // Tweak visibility threshold

                    // Use classes from heatmap.module.css for consistent look
                    return (
                        <div
                            key={item.ticker}
                            className={`${styles.heatmapTile} group`}
                            style={{
                                left: `${x0}%`,
                                top: `${y0}%`,
                                width: `${wPercent}%`,
                                height: `${hPercent}%`,
                                backgroundColor: color,
                                position: 'absolute'
                            }}
                            onMouseMove={(e) => {
                                if (chartRef.current) {
                                    const rect = chartRef.current.getBoundingClientRect();
                                    setTooltipParams({
                                        x: e.clientX - rect.left,
                                        y: e.clientY - rect.top,
                                        item: item
                                    });
                                }
                            }}
                        >
                            {/* Inner content wrapper for centering and hover effects (zoom/opacity) */}
                            <div className={`${styles.heatmapTileContent} flex flex-col items-center justify-center p-0.5`}>
                                <div
                                    className={`${styles.heatmapTileSymbol} truncate max-w-full`}
                                    style={{
                                        fontSize: isSmall ? '10px' : 'clamp(12px, 2.5cqw, 24px)', // Responsive font size
                                        containerType: 'inline-size'
                                    }}
                                >
                                    {item.ticker}
                                </div>
                                {!isSmall && (
                                    <div
                                        className={`${styles.heatmapTilePercent}`}
                                        style={{ fontSize: 'clamp(10px, 2cqw, 16px)' }}
                                    >
                                        {item.dailyChangePercent > 0 ? '+' : ''}{item.dailyChangePercent.toFixed(2)}%
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {tooltipParams && (
                    <div
                        className="fixed z-50 pointer-events-none bg-gray-900 border border-gray-700 text-white text-xs rounded-lg shadow-xl p-3"
                        style={{
                            left: chartRef.current ? chartRef.current.getBoundingClientRect().left + tooltipParams.x + 10 : 0,
                            top: chartRef.current ? chartRef.current.getBoundingClientRect().top + tooltipParams.y + 10 : 0,
                        }}
                    >
                        <div className="font-bold text-sm mb-1">{tooltipParams.item.ticker}</div>
                        <div className="flex justify-between gap-4 mb-1">
                            <span className="text-gray-400">Value:</span>
                            <span className="font-semibold">${tooltipParams.item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-400">Change:</span>
                            <span className={`font-semibold ${tooltipParams.item.dailyChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {tooltipParams.item.dailyChangePercent > 0 ? '+' : ''}
                                {tooltipParams.item.dailyChangePercent.toFixed(2)}%
                            </span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-400">P&L:</span>
                            <span className={`font-semibold ${tooltipParams.item.dailyChangeValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {tooltipParams.item.dailyChangeValue > 0 ? '+' : ''}
                                ${Math.abs(tooltipParams.item.dailyChangeValue).toFixed(2)}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
