'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TreemapLeaf, CompanyNode } from './MarketHeatmap';
import { scaleLinear } from 'd3-scale';

// --- CONSTANTS & HELPERS (Duplicated from MarketHeatmap.tsx for independence) ---

const TILE_SIZE_THRESHOLDS = {
    MIN_WIDTH: 30,
    MIN_HEIGHT: 20,
    MIN_AREA: 900,
    SMALL_AREA: 2500,
    MEDIUM_AREA: 5000,
    LARGE_AREA: 10000,
} as const;

const FONT_SIZE_CONFIG = {
    MIN_READABLE_SIZE: 8,
    MIN_SYMBOL_SIZE: 8,
    MIN_PERCENT_SIZE: 7,
    MAX_SYMBOL_SIZE: 28,
    MAX_PERCENT_SIZE: 20,
} as const;

const createColorScale = (timeframe: 'day' | 'week' | 'month' = 'day') => {
    const scales = {
        day: {
            domain: [-5, -2, 0, 2, 5],
            range: ['#ef4444', '#f87171', '#374151', '#4ade80', '#22c55e'],
        },
        week: {
            domain: [-10, -5, 0, 5, 10],
            range: ['#dc2626', '#ef4444', '#374151', '#22c55e', '#16a34a'],
        },
        month: {
            domain: [-20, -10, 0, 10, 20],
            range: ['#b91c1c', '#dc2626', '#374151', '#16a34a', '#15803d'],
        },
    };

    const config = scales[timeframe];
    return scaleLinear<string>()
        .domain(config.domain)
        .range(config.range)
        .clamp(true);
};

const formatPercent = (value: number) =>
    `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatMarketCapDiff = (value: number | undefined): string => {
    if (value === undefined || value === null || !isFinite(value) || value === 0) {
        return '';
    }
    const absValue = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';

    if (absValue >= 1_000_000_000_000) return `${sign}$${(absValue / 1_000_000_000_000).toFixed(1)}T`;
    if (absValue >= 1_000_000_000) return `${sign}$${(absValue / 1_000_000_000).toFixed(1)}B`;
    if (absValue >= 1_000_000) return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
    return `${sign}$${absValue.toFixed(0)}`;
};

const clampNumber = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

function calculateFontSizeFromArea(area: number, minSize: number, maxSize: number): number {
    const minArea = TILE_SIZE_THRESHOLDS.MIN_AREA;
    const maxArea = TILE_SIZE_THRESHOLDS.LARGE_AREA * 2;

    if (area <= minArea) return minSize;

    const logArea = Math.log(area / minArea);
    const logMaxArea = Math.log(maxArea / minArea);
    const ratio = Math.min(logArea / logMaxArea, 1);

    return clampNumber(minSize + (maxSize - minSize) * ratio, minSize, maxSize);
}

type TileLabelConfig = {
    showSymbol: boolean;
    showPercent: boolean;
    symbolFontPx: number;
    percentFontPx?: number;
};

function getTileLabelConfig(widthPx: number, heightPx: number): TileLabelConfig {
    const area = widthPx * heightPx;

    if (widthPx < TILE_SIZE_THRESHOLDS.MIN_WIDTH || heightPx < TILE_SIZE_THRESHOLDS.MIN_HEIGHT || area < TILE_SIZE_THRESHOLDS.MIN_AREA) {
        return { showSymbol: false, showPercent: false, symbolFontPx: 0 };
    }

    if (area < TILE_SIZE_THRESHOLDS.SMALL_AREA) {
        const ratio = Math.min((area - TILE_SIZE_THRESHOLDS.MIN_AREA) / (TILE_SIZE_THRESHOLDS.SMALL_AREA - TILE_SIZE_THRESHOLDS.MIN_AREA), 1);
        return { showSymbol: true, showPercent: false, symbolFontPx: Math.round(8 + (11 - 8) * ratio) };
    }

    if (area < TILE_SIZE_THRESHOLDS.MEDIUM_AREA) {
        const ratio = Math.min((area - TILE_SIZE_THRESHOLDS.SMALL_AREA) / (TILE_SIZE_THRESHOLDS.MEDIUM_AREA - TILE_SIZE_THRESHOLDS.SMALL_AREA), 1);
        return { showSymbol: true, showPercent: false, symbolFontPx: Math.round(10 + (14 - 10) * ratio) };
    }

    if (area < TILE_SIZE_THRESHOLDS.LARGE_AREA) {
        const symbolFontPx = calculateFontSizeFromArea(area, FONT_SIZE_CONFIG.MIN_SYMBOL_SIZE + 5, FONT_SIZE_CONFIG.MAX_SYMBOL_SIZE - 8);
        const percentFontPx = calculateFontSizeFromArea(area, FONT_SIZE_CONFIG.MIN_PERCENT_SIZE, FONT_SIZE_CONFIG.MAX_PERCENT_SIZE - 4);
        return { showSymbol: true, showPercent: true, symbolFontPx: Math.round(symbolFontPx), percentFontPx: Math.round(percentFontPx) };
    }

    const symbolFontPx = calculateFontSizeFromArea(area, FONT_SIZE_CONFIG.MAX_SYMBOL_SIZE - 6, FONT_SIZE_CONFIG.MAX_SYMBOL_SIZE);
    const percentFontPx = calculateFontSizeFromArea(area, FONT_SIZE_CONFIG.MAX_PERCENT_SIZE - 4, FONT_SIZE_CONFIG.MAX_PERCENT_SIZE);
    return { showSymbol: true, showPercent: true, symbolFontPx: Math.round(symbolFontPx), percentFontPx: Math.round(percentFontPx) };
}

// --- COMPONENT ---

interface CanvasHeatmapProps {
    leaves: TreemapLeaf[];
    width: number;
    height: number;
    scale: number;
    offset: { x: number; y: number };
    onTileClick?: (company: CompanyNode) => void;
    onHover?: (company: CompanyNode | null, x: number, y: number) => void;
    metric: 'percent' | 'mcap';
    timeframe: 'day' | 'week' | 'month';
}

export const CanvasHeatmap: React.FC<CanvasHeatmapProps> = ({
    leaves,
    width,
    height,
    scale,
    offset,
    onTileClick,
    onHover,
    metric,
    timeframe,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoveredLeaf, setHoveredLeaf] = useState<TreemapLeaf | null>(null);

    // Draw function
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false }); // Alpha false for performance
        if (!ctx) return;

        // Handle High DPI
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        // Clear
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const colorScale = createColorScale(timeframe);

        // Draw leaves
        leaves.forEach(leaf => {
            const { x0, y0, x1, y1 } = leaf;
            const company = leaf.data.meta.companyData;

            const tileX = x0 * scale + offset.x;
            const tileY = y0 * scale + offset.y;
            const tileW = (x1 - x0) * scale;
            const tileH = (y1 - y0) * scale;

            // Skip if out of bounds (though leaves should be filtered by parent if needed, but canvas clips anyway)
            if (tileX + tileW < 0 || tileX > width || tileY + tileH < 0 || tileY > height) return;

            // Fill
            ctx.fillStyle = colorScale(company.changePercent);
            ctx.fillRect(tileX, tileY, tileW, tileH);

            // Border
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(tileX, tileY, tileW, tileH);

            // Text
            const labelConfig = getTileLabelConfig(tileW, tileH);
            if (labelConfig.showSymbol || labelConfig.showPercent) {
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const centerX = tileX + tileW / 2;
                const centerY = tileY + tileH / 2;

                if (labelConfig.showSymbol && !labelConfig.showPercent) {
                    ctx.font = `bold ${labelConfig.symbolFontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    ctx.fillText(company.symbol, centerX, centerY);
                } else if (labelConfig.showSymbol && labelConfig.showPercent) {
                    // Draw Symbol
                    ctx.font = `bold ${labelConfig.symbolFontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    // Offset slightly up
                    ctx.fillText(company.symbol, centerX, centerY - (labelConfig.percentFontPx! / 2) - 2);

                    // Draw Percent
                    ctx.font = `500 ${labelConfig.percentFontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    const text = metric === 'mcap'
                        ? formatMarketCapDiff(company.marketCapDiff)
                        : formatPercent(company.changePercent);
                    // Offset slightly down
                    ctx.fillText(text, centerX, centerY + (labelConfig.symbolFontPx / 2) + 2);
                }
            }
        });

    }, [leaves, width, height, scale, offset, metric, timeframe]);

    // Interaction Handler
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        let found: TreemapLeaf | null = null;
        for (let i = leaves.length - 1; i >= 0; i--) {
            const leaf = leaves[i];
            if (!leaf) continue;

            const tileX = leaf.x0 * scale + offset.x;
            const tileY = leaf.y0 * scale + offset.y;
            const tileW = (leaf.x1 - leaf.x0) * scale;
            const tileH = (leaf.y1 - leaf.y0) * scale;

            if (x >= tileX && x <= tileX + tileW && y >= tileY && y <= tileY + tileH) {
                found = leaf;
                break;
            }
        }

        if (found !== hoveredLeaf) {
            setHoveredLeaf(found);
            if (onHover) {
                onHover(found ? found.data.meta.companyData! : null, x, y);
            }
        } else if (found && onHover) {
            onHover(found.data.meta.companyData!, x, y);
        } else if (!found && onHover) {
            onHover(null, x, y);
        }

    }, [leaves, scale, offset, hoveredLeaf, onHover]);

    const handleClick = useCallback(() => {
        if (hoveredLeaf && onTileClick) {
            onTileClick(hoveredLeaf.data.meta.companyData!);
        }
    }, [hoveredLeaf, onTileClick]);

    const handleMouseLeave = useCallback(() => {
        setHoveredLeaf(null);
        if (onHover) onHover(null, 0, 0);
    }, [onHover]);

    return (
        <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            className="block cursor-pointer"
            style={{ width, height }}
        />
    );
};
