'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TreemapLeaf, CompanyNode } from './MarketHeatmap';
import { formatMarketCapDiff, formatPercent } from '@/lib/utils/heatmapFormat';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import { TILE_SIZE_THRESHOLDS, FONT_SIZE_CONFIG } from '@/lib/utils/heatmapConfig';
import { getTileLabelConfig, calculateFontSizeFromArea, TileLabelConfig, clampNumber } from '@/lib/utils/heatmapLabelUtils';

// --- CONSTANTS & HELPERS ---
// Moved to shared utilities (@/lib/utils/heatmap*) to avoid duplication with MarketHeatmap.tsx

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

        const colorScale = createHeatmapColorScale(timeframe);

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
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Settings for outline
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.lineWidth = 2.5; // Creates effectively ~1.25px outline
                ctx.lineJoin = 'round';

                const centerX = tileX + tileW / 2;
                const centerY = tileY + tileH / 2;

                if (labelConfig.showSymbol && !labelConfig.showPercent) {
                    ctx.font = `bold ${labelConfig.symbolFontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    // Outline first
                    ctx.strokeText(company.symbol, centerX, centerY);
                    // Then fill
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(company.symbol, centerX, centerY);
                } else if (labelConfig.showSymbol && labelConfig.showPercent) {
                    // Draw Symbol
                    const symbolY = centerY - (labelConfig.percentFontPx! / 2) - 2;
                    ctx.font = `bold ${labelConfig.symbolFontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

                    // Outline
                    ctx.strokeText(company.symbol, centerX, symbolY);
                    // Fill
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(company.symbol, centerX, symbolY);

                    // Draw Percent/Value
                    const text = metric === 'mcap'
                        ? formatMarketCapDiff(company.marketCapDiff)
                        : formatPercent(company.changePercent);
                    const percentY = centerY + (labelConfig.symbolFontPx / 2) + 2;

                    ctx.font = `500 ${labelConfig.percentFontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

                    // Outline
                    ctx.strokeText(text, centerX, percentY);
                    // Fill
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                    ctx.fillText(text, centerX, percentY);
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
                // Pass global coordinates for fixed tooltip positioning
                onHover(found ? found.data.meta.companyData! : null, e.clientX, e.clientY);
            }
        } else if (found && onHover) {
            onHover(found.data.meta.companyData!, e.clientX, e.clientY);
        } else if (!found && onHover) {
            onHover(null, e.clientX, e.clientY);
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
