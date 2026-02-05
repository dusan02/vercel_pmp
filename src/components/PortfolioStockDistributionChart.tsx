'use client';

import React, { useMemo, useState } from 'react';

// Unified color palette matching other charts where possible
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
    '#000000', // Black
];

interface PortfolioStockDistributionChartProps {
    data: Array<{
        ticker: string;
        value: number;
    }>;
    size?: number; // Base size for the donut itself
}

export function PortfolioStockDistributionChart({ data, size = 300 }: PortfolioStockDistributionChartProps) {
    const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);

    const { slices, totalValue } = useMemo(() => {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) return { slices: [], totalValue: 0 };

        // Sort descending by value
        const sorted = [...data].sort((a, b) => b.value - a.value);

        let accumulatedAngle = 0;
        const slicesWithCoords = sorted.map((item, index) => {
            const percentage = (item.value / total) * 100;
            const startAngle = accumulatedAngle;
            const endAngle = accumulatedAngle + (percentage / 100) * 360;
            const middleAngle = startAngle + (endAngle - startAngle) / 2;
            accumulatedAngle = endAngle;

            const effectiveIndex = index % CHART_COLORS.length;

            return {
                ...item,
                percentage,
                startAngle,
                endAngle,
                middleAngle,
                color: CHART_COLORS[effectiveIndex],
            };
        });

        return { slices: slicesWithCoords, totalValue: total };
    }, [data]);

    if (slices.length === 0) {
        // Empty State Placeholder
        const placeholderRadius = size / 2;
        const placeholderInner = placeholderRadius * 0.6;

        return (
            <div className="w-full p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider">
                    Asset Allocation
                </h3>
                <div className="flex justify-center flex-col items-center">
                    <div
                        className="relative w-full opacity-30 grayscale"
                        style={{ maxWidth: size + 240, aspectRatio: 1 }}
                    >
                        <svg
                            viewBox={`0 0 ${size + 240} ${size + 240}`}
                            preserveAspectRatio="xMidYMid meet"
                            className="w-full h-full"
                        >
                            <g transform={`translate(${(size + 240) / 2}, ${(size + 240) / 2})`}>
                                {/* Placeholder Donut */}
                                <circle r={placeholderRadius} fill="none" stroke="var(--clr-border)" strokeWidth="2" strokeDasharray="4 4" />
                                <circle r={placeholderInner} fill="none" stroke="var(--clr-border)" strokeWidth="2" strokeDasharray="4 4" />
                                <text textAnchor="middle" dy="0.3em" className="fill-gray-400 text-sm font-medium">No Data</text>
                            </g>
                        </svg>
                    </div>
                </div>
            </div>
        );
    }

    // Radius config
    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.6; // Donut hole
    const labelRadius = outerRadius + 20;  // Radius where the line break starts

    // Increase viewBox to accommodate labels
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
        <div className="w-full p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider">
                Asset Allocation
            </h3>
            <div className="flex justify-center">
                <div
                    className="relative w-full"
                    style={{ maxWidth: viewBoxSize, aspectRatio: 1 }}
                >
                    <svg
                        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
                        preserveAspectRatio="xMidYMid meet"
                        className="w-full h-full"
                    >
                        <g transform={`translate(${center}, ${center})`}>
                            {/* 1. Slices */}
                            {slices.flatMap((slice) => {
                                const isHovered = hoveredTicker === slice.ticker;
                                const outer = isHovered ? outerRadius + 5 : outerRadius;
                                const angleSpan = slice.endAngle - slice.startAngle;

                                // SVG arc can't render a perfect 360° arc in a single path (start=end degenerates).
                                // For 100% allocation (single ticker), split into two 180° arcs.
                                const paths = angleSpan >= 359.999
                                    ? [
                                        createArc(slice.startAngle, slice.startAngle + 180, outer, innerRadius),
                                        createArc(slice.startAngle + 180, slice.startAngle + 360, outer, innerRadius),
                                      ]
                                    : [createArc(slice.startAngle, slice.endAngle, outer, innerRadius)];

                                return paths.map((d, idx) => (
                                    <path
                                        key={`${slice.ticker}-${idx}`}
                                        d={d}
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
                                ));
                            })}

                            {/* 2. Labels & Lines */}
                            {slices.map((slice) => {
                                // Only show label if slice is > 1% to avoid clutter, or if there are few items
                                if (slice.percentage < 2 && slices.length > 10) return null;

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
                                            className="text-xs font-bold fill-gray-900 dark:fill-gray-100"
                                        >
                                            {slice.ticker}
                                        </text>
                                        <text
                                            x={textX}
                                            y={textY + 10} // Percent below line
                                            textAnchor={textAnchor}
                                            className="text-[10px] fill-gray-500 dark:fill-gray-400"
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
                                className="text-sm font-medium fill-gray-500 dark:fill-gray-400"
                            >
                                Total
                            </text>
                            <text
                                x="0"
                                y="15"
                                textAnchor="middle"
                                className="text-xl font-bold fill-gray-900 dark:fill-gray-100"
                            >
                                ${(totalValue / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k
                            </text>
                        </g>
                    </svg>
                </div>
            </div>
        </div>
    );
}

