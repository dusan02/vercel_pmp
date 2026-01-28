'use client';

import React, { useMemo } from 'react';

// Google Sheets color palette
const CHART_COLORS = [
    '#4285F4', // Blue
    '#EA4335', // Red
    '#FBBC04', // Yellow
    '#34A853', // Green
    '#9C27B0', // Purple
    '#FF6D00', // Orange
    '#00ACC1', // Teal
    '#E91E63', // Pink
    '#CDDC39', // Lime
    '#3F51B5', // Indigo
];

interface PortfolioSlice {
    ticker: string;
    value: number;
    percentage: number;
    color: string;
}

interface PortfolioDonutChartProps {
    data: Array<{
        ticker: string;
        value: number;
    }>;
    size?: number;
}

export function PortfolioDonutChart({ data, size = 200 }: PortfolioDonutChartProps) {
    const chartData = useMemo(() => {
        // Calculate total value
        const totalValue = data.reduce((sum, item) => sum + item.value, 0);

        if (totalValue === 0) return [];

        // Sort by value descending and assign colors
        const sorted = [...data]
            .sort((a, b) => b.value - a.value)
            .map((item, index) => ({
                ticker: item.ticker,
                value: item.value,
                percentage: (item.value / totalValue) * 100,
                color: CHART_COLORS[index % CHART_COLORS.length],
            }));

        return sorted;
    }, [data]);

    // Calculate SVG path for donut segments
    const createArc = (startAngle: number, endAngle: number, outerRadius: number, innerRadius: number) => {
        const start = polarToCartesian(0, 0, outerRadius, endAngle);
        const end = polarToCartesian(0, 0, outerRadius, startAngle);
        const innerStart = polarToCartesian(0, 0, innerRadius, endAngle);
        const innerEnd = polarToCartesian(0, 0, innerRadius, startAngle);

        const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

        return [
            'M', start.x, start.y,
            'A', outerRadius, outerRadius, 0, largeArcFlag, 0, end.x, end.y,
            'L', innerEnd.x, innerEnd.y,
            'A', innerRadius, innerRadius, 0, largeArcFlag, 1, innerStart.x, innerStart.y,
            'Z'
        ].join(' ');
    };

    const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
        const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
        return {
            x: centerX + radius * Math.cos(angleInRadians),
            y: centerY + radius * Math.sin(angleInRadians),
        };
    };

    if (chartData.length === 0) {
        return null;
    }

    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.6; // 40% hole
    const viewBoxSize = size + 20; // Add padding
    const center = viewBoxSize / 2;

    let currentAngle = 0;

    return (
        <div className="flex flex-col lg:flex-row items-center gap-6 p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            {/* Chart */}
            <div className="flex-shrink-0">
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
                    className="drop-shadow-md"
                >
                    <g transform={`translate(${center}, ${center})`}>
                        {chartData.map((slice, index) => {
                            const startAngle = currentAngle;
                            const endAngle = currentAngle + (slice.percentage / 100) * 360;
                            currentAngle = endAngle;

                            const path = createArc(startAngle, endAngle, outerRadius, innerRadius);

                            return (
                                <path
                                    key={slice.ticker}
                                    d={path}
                                    fill={slice.color}
                                    stroke="white"
                                    strokeWidth="2"
                                    className="transition-opacity hover:opacity-80 cursor-pointer"
                                    style={{
                                        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))',
                                    }}
                                >
                                    <title>
                                        {slice.ticker}: ${slice.value.toLocaleString()} ({slice.percentage.toFixed(1)}%)
                                    </title>
                                </path>
                            );
                        })}
                    </g>
                </svg>
            </div>

            {/* Legend */}
            <div className="flex-1 flex flex-col gap-1 max-h-64 overflow-y-auto justify-center min-w-[140px]">
                {chartData.map((slice) => (
                    <div
                        key={slice.ticker}
                        className="flex items-center gap-2 text-sm"
                    >
                        <div
                            className="w-3 h-3 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: slice.color }}
                        />
                        <div className="flex items-center gap-2 w-full">
                            <span className="font-bold text-gray-900 dark:text-gray-100 w-12">
                                {slice.ticker}
                            </span>
                            <div className="flex flex-col leading-none">
                                <span className="text-gray-700 dark:text-gray-300 font-medium">
                                    ${slice.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                                <span className="text-gray-400 dark:text-gray-500 text-[10px]">
                                    {slice.percentage.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
