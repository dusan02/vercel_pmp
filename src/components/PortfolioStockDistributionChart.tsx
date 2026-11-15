'use client';

import React, { useMemo, useState } from 'react';
import { PORTFOLIO_DONUT_GEOMETRY, layoutDonutLabels } from '@/lib/utils/portfolioDonutLayout';
import { PortfolioDonutLabels } from '@/components/portfolio/PortfolioDonutLabels';

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

export function PortfolioStockDistributionChart({
    data,
    size = PORTFOLIO_DONUT_GEOMETRY.size,
}: PortfolioStockDistributionChartProps) {
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

    const viewBoxWidth = size + PORTFOLIO_DONUT_GEOMETRY.paddingX * 2;
    const viewBoxHeight = size + PORTFOLIO_DONUT_GEOMETRY.paddingY * 2;
    const centerX = viewBoxWidth / 2;
    const centerY = viewBoxHeight / 2;
    const aspectRatio = `${viewBoxWidth} / ${viewBoxHeight}`;

    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.6; // Donut hole

    const labels = useMemo(
        () =>
            layoutDonutLabels(
                slices
                    .filter((s) => s.percentage >= 4 || slices.length <= 8)
                    .map((s) => ({
                        key: `label-${s.ticker}`,
                        label: s.ticker,
                        percentage: s.percentage,
                        midAngleRad: (s.middleAngle * Math.PI) / 180,
                    })),
                outerRadius,
                centerY,
            ),
        [slices, outerRadius, centerY],
    );

    if (slices.length === 0) {
        // Empty State Placeholder
        const placeholderRadius = size / 2;
        const placeholderInner = placeholderRadius * 0.6;

        return (
            <div className="w-full h-full flex flex-col p-4 md:p-5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm xl:text-base font-semibold text-[var(--clr-subtext)] mb-3 uppercase tracking-wider">
                    Asset Allocation
                </h3>
                <div className="flex-1 flex justify-center flex-col items-center">
                    <div
                        className="relative w-full opacity-30 grayscale"
                        style={{ maxWidth: viewBoxWidth, aspectRatio }}
                    >
                        <svg
                            viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                            preserveAspectRatio="xMidYMid meet"
                            className="w-full h-full"
                        >
                            <g transform={`translate(${centerX}, ${centerY})`}>
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

    // Helper functions
    const polarToCartesian = (centerXCoord: number, centerYCoord: number, radius: number, angleInDegrees: number) => {
        const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
        return {
            x: centerXCoord + radius * Math.cos(angleInRadians),
            y: centerYCoord + radius * Math.sin(angleInRadians),
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
        <div className="w-full h-full flex flex-col p-4 md:p-5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm xl:text-base font-semibold text-[var(--clr-subtext)] mb-3 uppercase tracking-wider">
                Asset Allocation
            </h3>
            <div className="flex-1 flex items-center justify-center">
                <div
                    className="relative w-full"
                    style={{ maxWidth: viewBoxWidth, aspectRatio }}
                >
                    <svg
                        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                        preserveAspectRatio="xMidYMid meet"
                        className="w-full h-full"
                    >
                        <g transform={`translate(${centerX}, ${centerY})`}>
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

                            <PortfolioDonutLabels labels={labels} totalValue={totalValue} />
                        </g>
                    </svg>
                </div>
            </div>
        </div>
    );
}

