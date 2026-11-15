'use client';

import React, { useMemo, useState } from 'react';
import * as d3Hierarchy from 'd3-hierarchy';
import {
    PORTFOLIO_DONUT_GEOMETRY,
    adjustHexColor,
    createDonutArcPaths,
    getDonutViewBox,
    layoutDonutLabels,
    shortenIndustryLabel,
} from '@/lib/utils/portfolioDonutLayout';
import { PortfolioDonutCard, PortfolioDonutLabels } from '@/components/portfolio/PortfolioDonutLabels';

// Map sectors to specific base colors for consistency
const SECTOR_COLORS: Record<string, string> = {
    'Technology': '#4285F4', // Blue
    'Healthcare': '#EA4335', // Red
    'Financial Services': '#34A853', // Green
    'Consumer Cyclical': '#FBBC04', // Yellow
    'Communication Services': '#9C27B0', // Purple
    'Industrials': '#FF6D00', // Orange
    'Consumer Defensive': '#00ACC1', // Teal
    'Energy': '#E91E63', // Pink
    'Real Estate': '#CDDC39', // Lime
    'Utilities': '#3F51B5', // Indigo
    'Basic Materials': '#795548', // Brown
};

const FALLBACK_COLORS = [
    '#607D8B', // Blue Grey
    '#9E9E9E', // Grey
    '#795548', // Brown
    '#000000', // Black
];

interface PortfolioDonutChartProps {
    data: Array<{
        ticker: string;
        value: number;
        sector: string;
        industry: string;
    }>;
    size?: number;
}

export function PortfolioSectorDistributionChart({
    data,
    size = PORTFOLIO_DONUT_GEOMETRY.size,
}: PortfolioDonutChartProps) {
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    const { nodes, totalValue } = useMemo(() => {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) return { nodes: [], totalValue: 0 };

        // 1. Group by Sector -> Industry
        const hierarchyMap = new Map<string, Map<string, number>>();

        data.forEach(item => {
            const sector = item.sector || 'Unknown';
            const industry = item.industry || 'Unknown';

            if (!hierarchyMap.has(sector)) {
                hierarchyMap.set(sector, new Map());
            }
            const sectorMap = hierarchyMap.get(sector)!;
            sectorMap.set(industry, (sectorMap.get(industry) || 0) + item.value);
        });

        // 2. Build d3 hierarchy object
        const rootObject = {
            name: 'root',
            value: 0,
            children: Array.from(hierarchyMap.entries()).map(([sectorName, industryMap]) => ({
                name: sectorName,
                children: Array.from(industryMap.entries()).map(([industryName, val]) => ({
                    name: industryName,
                    value: val,
                })),
            })),
        };

        const root = d3Hierarchy.hierarchy(rootObject)
            .sum(d => d.value || 0)
            .sort((a, b) => (b.value || 0) - (a.value || 0));

        // 3. Partition layout: x is angle in radians (0..2π), y is radial depth (0..1)
        const partition = d3Hierarchy.partition<any>().size([2 * Math.PI, 1]);
        const descendants = partition(root).descendants().filter(d => d.depth > 0);

        // Assign colors
        const sectorColorMap: Record<string, string> = {};
        descendants.filter(d => d.depth === 1).forEach((node, i) => {
            const sectorName = node.data.name || 'Unknown';
            sectorColorMap[sectorName] = SECTOR_COLORS[sectorName] || FALLBACK_COLORS[i % FALLBACK_COLORS.length] || '#000000';
        });

        const processedNodes = descendants.map(node => {
            const isSector = node.depth === 1;
            const sectorNode = isSector ? node : node.parent!;
            const sectorName = sectorNode.data.name || 'Unknown';
            const baseColor = sectorColorMap[sectorName] || '#000000';

            let color = baseColor;
            if (!isSector) {
                const siblings = sectorNode.children || [];
                const index = siblings.indexOf(node);
                const count = siblings.length;
                const percent = count > 1 ? -30 + (index / (count - 1)) * 60 : 10;
                color = adjustHexColor(baseColor, percent);
            }

            return {
                name: node.data.name,
                value: node.value || 0,
                percentage: ((node.value || 0) / total) * 100,
                depth: node.depth,
                x0: node.x0,
                x1: node.x1,
                color,
                sector: sectorName,
            };
        });

        return { nodes: processedNodes, totalValue: total };
    }, [data]);

    const { centerY } = getDonutViewBox(size);
    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.45;
    const middleRadius = outerRadius * 0.7;

    const labels = useMemo(
        () =>
            layoutDonutLabels(
                nodes
                    .filter((n) => n.depth === 2 && n.percentage > 4)
                    .map((n, idx) => ({
                        key: `sector-label-${idx}-${n.name}`,
                        label: shortenIndustryLabel(n.name),
                        percentage: n.percentage,
                        midAngleRad: (n.x0 + n.x1) / 2,
                    })),
                outerRadius,
                centerY,
            ),
        [nodes, outerRadius, centerY],
    );

    const getRadii = (depth: number) =>
        depth === 1
            ? { inner: innerRadius, outer: middleRadius }
            : { inner: middleRadius, outer: outerRadius };

    return (
        <PortfolioDonutCard
            title="Segment Distribution"
            size={size}
            isEmpty={nodes.length === 0}
            emptyInnerRatio={0.45}
        >
            {nodes.flatMap((node, i) => {
                const { inner, outer } = getRadii(node.depth);
                const isHovered = hoveredNode === node.name;
                const displayOuter = isHovered ? outer + 5 : outer;
                const paths = createDonutArcPaths(node.x0, node.x1, inner, displayOuter);

                return paths.map((d, idx) => (
                    <path
                        key={`${node.depth}-${i}-${idx}`}
                        d={d}
                        fill={node.color}
                        stroke="white"
                        strokeWidth="1.5"
                        className="transition-all duration-200 cursor-pointer"
                        onMouseEnter={() => setHoveredNode(node.name || null)}
                        onMouseLeave={() => setHoveredNode(null)}
                        style={{ opacity: hoveredNode && hoveredNode !== node.name && hoveredNode !== node.sector ? 0.5 : 1 }}
                    >
                        <title>{node.name}: ${node.value.toLocaleString()} ({node.percentage.toFixed(1)}%)</title>
                    </path>
                ));
            })}
            <PortfolioDonutLabels labels={labels} totalValue={totalValue} />
        </PortfolioDonutCard>
    );
}
