'use client';

import React, { useMemo, useState } from 'react';

// Consistent color palette
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

interface PortfolioDonutChartProps {
    data: Array<{
        ticker: string;
        value: number;
    }>;
    size?: number; // Base size for the donut itself
}

export function PortfolioDonutChart({ data, size = 200 }: PortfolioDonutChartProps) {
    const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);

    const { slices, totalValue } = useMemo(() => {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) return { slices: [], totalValue: 0 };

        // Sort desc
        const sorted = [...data].sort((a, b) => b.value - a.value);

        let accumulatedAngle = 0;
        const slicesWithCoords = sorted.map((item, index) => {
            const percentage = (item.value / total) * 100;
            const startAngle = accumulatedAngle;
            const endAngle = accumulatedAngle + (percentage / 100) * 360;
            const middleAngle = startAngle + (endAngle - startAngle) / 2;
            accumulatedAngle = endAngle;

            return {
                ...item,
                percentage,
                startAngle,
                endAngle,
                middleAngle,
                color: CHART_COLORS[index % CHART_COLORS.length],
            };
        });

        return { slices: slicesWithCoords, totalValue: total };
    }, [data]);

    if (slices.length === 0) return null;

    // Radius config
    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.6; // Donut hole
    const labelRadius = outerRadius + 20;  // Radius where the line break starts
    const textRadius = outerRadius + 40;   // Radius where text starts

    // Increase viewBox to accommodate labels (approx +150px each side worst case)
    const padding = 120;
    const viewBoxSize = size + padding * 2;
    const center = viewBoxSize / 2;

    // Helper functions
    const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
        const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
        return {
            x: centerX + radius * Math.cos(angleInRadians),
            y: centerY + radius * Math.sin(angleInRadians),
        };
    };

    const createArc = (startAngle: number, endAngle: number, outerRad: number, innerRad: number) => {
        const start = polarToCartesian(0, 0, outerRad, endAngle);
        const end = polarToCartesian(0, 0, outerRad, startAngle);
        const innerStart = polarToCartesian(0, 0, innerRad, endAngle);
        const innerEnd = polarToCartesian(0, 0, innerRad, startAngle);

        const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

        return [
            'M', start.x, start.y,
            'A', outerRad, outerRad, 0, largeArcFlag, 0, end.x, end.y,
            'L', innerEnd.x, innerEnd.y,
            'A', innerRad, innerRad, 0, largeArcFlag, 1, innerStart.x, innerStart.y,
            'Z'
        ].join(' ');
    };

    return (
        <div className="w-full flex justify-center bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="relative w-full max-w-[600px] aspect-[1.3] min-h-[300px]">
                <svg
                    viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="w-full h-full"
                >
                    <g transform={`translate(${center}, ${center})`}>
                        {/* 1. Slices */}
                        {slices.map((slice) => {
                            const isHovered = hoveredTicker === slice.ticker;
                            const path = createArc(
                                slice.startAngle,
                                slice.endAngle,
                                isHovered ? outerRadius + 5 : outerRadius,
                                innerRadius
                            );

                            return (
                                <g key={slice.ticker}>
                                    <path
                                        d={path}
                                        fill={slice.color}
                                        stroke="white"
                                        strokeWidth="2"
                                        className="transition-all duration-200 cursor-pointer"
                                        onMouseEnter={() => setHoveredTicker(slice.ticker)}
                                        onMouseLeave={() => setHoveredTicker(null)}
                                        style={{ opacity: hoveredTicker && !isHovered ? 0.6 : 1 }}
                                    >
                                        <title>{slice.ticker}: ${slice.value.toLocaleString()} ({slice.percentage.toFixed(1)}%)</title>
                                    </path>
                                </g>
                            );
                        })}

                        {/* 2. Labels & Lines */}
                        {slices.map((slice) => {
                            // Only show label if slice is > 1% to avoid clutter, or if there are few items
                            if (slice.percentage < 1 && slices.length > 10) return null;

                            const startPt = polarToCartesian(0, 0, outerRadius, slice.middleAngle);
                            const elbowPt = polarToCartesian(0, 0, labelRadius, slice.middleAngle);

                            // Determine text side roughly based on angle
                            const isRightSide = slice.middleAngle < 180;
                            const xSign = isRightSide ? 1 : -1;

                            // End point for the line
                            const endPt = {
                                x: elbowPt.x + (20 * xSign),
                                y: elbowPt.y
                            };

                            // Text anchor position
                            const textAnchor = isRightSide ? 'start' : 'end';
                            const textX = endPt.x + (5 * xSign);
                            const textY = endPt.y;

                            return (
                                <g key={`label-${slice.ticker}`} className="pointer-events-none">
                                    {/* Connection Line */}
                                    <polyline
                                        points={`${startPt.x},${startPt.y} ${elbowPt.x},${elbowPt.y} ${endPt.x},${endPt.y}`}
                                        fill="none"
                                        stroke="#9ca3af" // gray-400
                                        strokeWidth="1"
                                    />

                                    {/* Text Label */}
                                    <text
                                        x={textX}
                                        y={textY - 4} // Ticker above line
                                        textAnchor={textAnchor}
                                        className="text-[10px] sm:text-xs font-bold fill-gray-900 dark:fill-gray-100"
                                    >
                                        {slice.ticker}
                                    </text>
                                    <text
                                        x={textX}
                                        y={textY + 10} // Percent below line
                                        textAnchor={textAnchor}
                                        className="text-[9px] sm:text-[10px] fill-gray-500 dark:fill-gray-400"
                                    >
                                        {slice.percentage.toFixed(1)}%
                                    </text>
                                </g>
                            );
                        })}

                        {/* Center text (Total) */}
                        <text
                            x="0"
                            y="-5"
                            textAnchor="middle"
                            className="text-xs font-medium fill-gray-500 dark:fill-gray-400"
                        >
                            Total
                        </text>
                        <text
                            x="0"
                            y="15"
                            textAnchor="middle"
                            className="text-sm font-bold fill-gray-900 dark:fill-gray-100"
                        >
                            ${(totalValue / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k
                        </text>
                    </g>
                </svg>
            </div>
        </div>
    );
}
