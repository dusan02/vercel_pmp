'use client';

import React, { useMemo, useState } from 'react';
import {
    PORTFOLIO_DONUT_GEOMETRY,
    createDonutArcPaths,
    getDonutViewBox,
    layoutDonutLabels,
} from '@/lib/utils/portfolioDonutLayout';
import { PortfolioDonutCard, PortfolioDonutLabels } from '@/components/portfolio/PortfolioDonutLabels';

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
    size?: number;
}

export function PortfolioStockDistributionChart({
    data,
    size = PORTFOLIO_DONUT_GEOMETRY.size,
}: PortfolioStockDistributionChartProps) {
    const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);

    const { slices, totalValue } = useMemo(() => {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) return { slices: [], totalValue: 0 };

        const sorted = [...data].sort((a, b) => b.value - a.value);

        let accumulatedRad = 0;
        const slicesWithCoords = sorted.map((item, index) => {
            const share = item.value / total;
            const percentage = share * 100;
            const startRad = accumulatedRad;
            const endRad = accumulatedRad + share * Math.PI * 2;
            const midAngleRad = (startRad + endRad) / 2;
            accumulatedRad = endRad;

            return {
                ...item,
                percentage,
                startRad,
                endRad,
                midAngleRad,
                color: CHART_COLORS[index % CHART_COLORS.length],
            };
        });

        return { slices: slicesWithCoords, totalValue: total };
    }, [data]);

    const { centerY } = getDonutViewBox(size);
    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.6;

    const labels = useMemo(
        () =>
            layoutDonutLabels(
                slices
                    .filter((s) => s.percentage >= 4 || slices.length <= 8)
                    .map((s) => ({
                        key: `label-${s.ticker}`,
                        label: s.ticker,
                        percentage: s.percentage,
                        midAngleRad: s.midAngleRad,
                    })),
                outerRadius,
                centerY,
            ),
        [slices, outerRadius, centerY],
    );

    return (
        <PortfolioDonutCard
            title="Asset Allocation"
            size={size}
            isEmpty={slices.length === 0}
            emptyInnerRatio={0.6}
        >
            {slices.flatMap((slice) => {
                const isHovered = hoveredTicker === slice.ticker;
                const outer = isHovered ? outerRadius + 5 : outerRadius;
                const paths = createDonutArcPaths(slice.startRad, slice.endRad, innerRadius, outer);

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
        </PortfolioDonutCard>
    );
}
