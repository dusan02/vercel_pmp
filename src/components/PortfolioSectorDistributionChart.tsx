'use client';

import React, { useMemo, useState } from 'react';
import * as d3Hierarchy from 'd3-hierarchy';
import { scaleLinear } from 'd3-scale';

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

// Helper to lighten/darken a hex color
// simplistic implementation since we might not have d3-color
function adjustColor(hex: string, percent: number) {
    if (!hex) return '#000000';
    // strip the leading # if it's there
    hex = hex.replace(/^\s*#|\s*$/g, '');

    // convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
    if (hex.length === 3) {
        hex = hex.replace(/(.)/g, '$1$1');
    }

    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);

    if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;

    // calculated adjustment
    const amt = Math.floor(2.55 * percent);

    // adjust
    r += amt;
    g += amt;
    b += amt;

    // clamp
    if (r > 255) r = 255; else if (r < 0) r = 0;
    if (g > 255) g = 255; else if (g < 0) g = 0;
    if (b > 255) b = 255; else if (b < 0) b = 0;

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Helper functions for SVG paths
const polarToCartesian = (angle: number, r: number) => {
    // angle is in radians, 0 is at 12 o'clock if we rotate -PI/2
    const a = angle - Math.PI / 2;
    return {
        x: r * Math.cos(a),
        y: r * Math.sin(a)
    };
};

const createArcPath = (startAngle: number, endAngle: number, rInner: number, rOuter: number) => {
    const startOuter = polarToCartesian(endAngle, rOuter);
    const endOuter = polarToCartesian(startAngle, rOuter);
    const startInner = polarToCartesian(endAngle, rInner);
    const endInner = polarToCartesian(startAngle, rInner);

    const largeArc = endAngle - startAngle <= Math.PI ? 0 : 1;

    return [
        'M', startOuter.x, startOuter.y,
        'A', rOuter, rOuter, 0, largeArc, 0, endOuter.x, endOuter.y,
        'L', endInner.x, endInner.y,
        'A', rInner, rInner, 0, largeArc, 1, startInner.x, startInner.y,
        'Z'
    ].join(' ');
};

export function PortfolioSectorDistributionChart({ data, size = 300 }: PortfolioDonutChartProps) {
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
            value: 0, // will be summed by d3
            children: Array.from(hierarchyMap.entries()).map(([sectorName, industryMap]) => ({
                name: sectorName,
                children: Array.from(industryMap.entries()).map(([industryName, val]) => ({
                    name: industryName,
                    value: val
                }))
            }))
        };

        const root = d3Hierarchy.hierarchy(rootObject)
            .sum(d => d.value || 0)
            .sort((a, b) => (b.value || 0) - (a.value || 0));

        // 3. Partition layout
        // Use generic <any> to allow flexibility with d3 types
        const partition = d3Hierarchy.partition<any>()
            .size([2 * Math.PI, 1]); // x is angle (radians), y is radius (0..1)

        const rootNode = partition(root);

        // 4. Process nodes for rendering
        const descendants = rootNode.descendants().filter(d => d.depth > 0); // skip root

        // Assign colors
        const sectorColorMap: Record<string, string> = {};

        // Populate sector colors first
        descendants.filter(d => d.depth === 1).forEach((node, i) => {
            const sectorName = node.data.name || 'Unknown';
            // Use predefined or fallback
            sectorColorMap[sectorName] = SECTOR_COLORS[sectorName] || FALLBACK_COLORS[i % FALLBACK_COLORS.length] || '#000000';
        });

        const processedNodes = descendants.map(node => {
            // Find parent sector for coloring
            const isSector = node.depth === 1;
            const sectorNode = isSector ? node : node.parent!;
            const sectorName = sectorNode.data.name || 'Unknown';
            const baseColor = sectorColorMap[sectorName] || '#000000';

            let color = baseColor;

            if (!isSector) {
                // It's an industry. Calculate shade.
                const siblings = sectorNode.children || [];
                const index = siblings.indexOf(node);
                const count = siblings.length;

                // Generate shades: -20% (darker) to +20% (lighter)
                // If only 1 child, use base color
                if (count > 1) {
                    // range from -20 to +20
                    // 0 -> -20, count-1 -> +20
                    const percent = count === 1 ? 0 : -30 + (index / (count - 1)) * 60;
                    color = adjustColor(baseColor, percent);
                } else {
                    // Slightly distinct from sector base to show boundary
                    color = adjustColor(baseColor, 10);
                }
            }

            return {
                name: node.data.name,
                value: node.value || 0,
                percentage: ((node.value || 0) / total) * 100,
                depth: node.depth,
                x0: node.x0,
                x1: node.x1,
                color,
                sector: sectorName
            };
        });

        return { nodes: processedNodes, totalValue: total };
    }, [data]);

    if (nodes.length === 0) {
        // Empty State Placeholder
        const placeholderRadius = size / 2;
        const placeholderInner = placeholderRadius * 0.45;
        // const placeholderMiddle = placeholderRadius * 0.7; // Unused

        return (
            <div className="w-full p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider">
                    Segment Distribution
                </h3>
                <div className="flex justify-center flex-col items-center">
                    <div
                        className="relative w-full opacity-30 grayscale"
                        style={{ maxWidth: size + 280, aspectRatio: 1 }}
                    >
                        <svg
                            viewBox={`0 0 ${size + 280} ${size + 280}`}
                            preserveAspectRatio="xMidYMid meet"
                            className="w-full h-full"
                        >
                            <g transform={`translate(${(size + 280) / 2}, ${(size + 280) / 2})`}>
                                {/* Placeholder Donut */}
                                <path
                                    d={createArcPath(0, 2 * Math.PI, placeholderInner, placeholderRadius)}
                                    fill="none"
                                    stroke="var(--clr-border)"
                                    strokeWidth="20"
                                    strokeDasharray="10 5"
                                />
                                <text textAnchor="middle" dy="0.3em" className="fill-gray-400 text-sm font-medium">No Data</text>
                            </g>
                        </svg>
                    </div>
                </div>
            </div>
        );
    }

    // Dimensions
    const padding = 160; // Space for labels
    const viewBoxSize = size + padding * 2;
    const center = viewBoxSize / 2;
    const radius = size / 2;

    // Radii configuration
    const innerRadius = radius * 0.45; // Hole
    const middleRadius = radius * 0.7; // Boundary between Sector and Industry
    const outerRadius = radius;

    // Functions
    const getRadii = (depth: number) => {
        if (depth === 1) return { inner: innerRadius, outer: middleRadius }; // Sector
        return { inner: middleRadius, outer: outerRadius }; // Industry
    };

    return (
        <div className="w-full p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider">
                Segment Distribution
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
                            {/* Slices */}
                            {nodes.flatMap((node, i) => {
                                const { inner, outer } = getRadii(node.depth);
                                const isHovered = hoveredNode === node.name;

                                // Expand slightly on hover
                                const displayOuter = isHovered ? outer + 5 : outer;
                                const span = node.x1 - node.x0;
                                const TWO_PI = Math.PI * 2;
                                const paths = span >= TWO_PI - 1e-6
                                    ? [
                                        createArcPath(node.x0, node.x0 + Math.PI, inner, displayOuter),
                                        createArcPath(node.x0 + Math.PI, node.x1, inner, displayOuter),
                                    ]
                                    : [createArcPath(node.x0, node.x1, inner, displayOuter)];

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

                            {/* Labels for Outer Layer (Industries) */}
                            {nodes.filter(n => n.depth === 2 && n.percentage > 2).map((node, i) => {
                                // Calculate position
                                const midAngle = (node.x0 + node.x1) / 2;
                                const { outer } = getRadii(node.depth);

                                const labelR = outer + 20;
                                const pos = polarToCartesian(midAngle, labelR);
                                const isRight = midAngle < Math.PI;

                                // Elbow line
                                const elbowStart = polarToCartesian(midAngle, outer);
                                const elbowEnd = { x: isRight ? pos.x + 20 : pos.x - 20, y: pos.y };

                                return (
                                    <g key={`label-${i}`} className="pointer-events-none">
                                        <polyline
                                            points={`${elbowStart.x},${elbowStart.y} ${pos.x},${pos.y} ${elbowEnd.x},${elbowEnd.y}`}
                                            fill="none"
                                            stroke="#9ca3af"
                                            strokeWidth="1"
                                        />
                                        <text
                                            x={elbowEnd.x + (isRight ? 5 : -5)}
                                            y={elbowEnd.y + 4}
                                            textAnchor={isRight ? 'start' : 'end'}
                                            className="text-sm font-bold fill-gray-900 dark:fill-gray-100"
                                        >
                                            {node.name}
                                        </text>
                                        <text
                                            x={elbowEnd.x + (isRight ? 5 : -5)}
                                            y={elbowEnd.y + 16}
                                            textAnchor={isRight ? 'start' : 'end'}
                                            className="text-xs fill-gray-500 dark:fill-gray-400"
                                        >
                                            {node.percentage.toFixed(1)}%
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Center Total */}
                            <text
                                x="0"
                                y="-10"
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
                                ${formatCompact(totalValue)}
                            </text>
                        </g>
                    </svg>
                </div>
            </div>
        </div>
    );
}

function formatCompact(num: number) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toFixed(0);
}
