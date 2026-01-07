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

    // Hover/tooltip throttling to avoid excessive state updates on continuous mouse events
    const leavesRef = useRef<TreemapLeaf[]>(leaves);
    const transformRef = useRef({ scale, offset });
    const onHoverRef = useRef<typeof onHover>(onHover);
    const lastHoverKeyRef = useRef<string | null>(null);
    const rafRef = useRef<number | null>(null);
    const pendingPointRef = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);

    useEffect(() => {
        leavesRef.current = leaves;
    }, [leaves]);

    useEffect(() => {
        transformRef.current = { scale, offset };
    }, [scale, offset]);

    useEffect(() => {
        onHoverRef.current = onHover;
    }, [onHover]);

    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, []);

    const fontFamily = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const MIN_TICKER_FONT_PX = 6; // below this, ticker isn't realistically readable
    const MIN_VALUE_FONT_PX = 6;

    const fitFontPxToBox = (
        ctx: CanvasRenderingContext2D,
        text: string,
        desiredFontPx: number,
        boxW: number,
        boxH: number,
        weight: string,
        minFontPx: number
    ): number | null => {
        const padding = 3; // keep small inset from borders
        const maxW = Math.max(0, boxW - padding * 2);
        const maxH = Math.max(0, boxH - padding * 2);
        if (maxW <= 0 || maxH <= 0) return null;

        // Font size can't exceed available height (roughly).
        let fontPx = Math.min(desiredFontPx, Math.floor(maxH));
        if (fontPx < minFontPx) return null;

        while (fontPx >= minFontPx) {
            ctx.font = `${weight} ${fontPx}px ${fontFamily}`;
            const w = ctx.measureText(text).width;
            if (w <= maxW) return fontPx;
            fontPx -= 1;
        }
        return null;
    };

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

            // Border - thinner border between companies within sectors
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = 1;
            ctx.strokeRect(tileX, tileY, tileW, tileH);

            // Text
            const labelConfig = getTileLabelConfig(tileW, tileH);
            if (labelConfig.showSymbol || labelConfig.showPercent) {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Settings for outline
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                // Smaller outline for tiny fonts; larger for big fonts.
                const outline = clampNumber(labelConfig.symbolFontPx / 6, 1, 2.5);
                ctx.lineWidth = outline;
                ctx.lineJoin = 'round';

                const centerX = tileX + tileW / 2;
                const centerY = tileY + tileH / 2;

                if (labelConfig.showSymbol && !labelConfig.showPercent) {
                    const fitted = fitFontPxToBox(
                        ctx,
                        company.symbol,
                        labelConfig.symbolFontPx,
                        tileW,
                        tileH,
                        'bold',
                        MIN_TICKER_FONT_PX
                    );
                    if (!fitted) return;

                    ctx.font = `bold ${fitted}px ${fontFamily}`;
                    // Outline first
                    ctx.strokeText(company.symbol, centerX, centerY);
                    // Then fill
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(company.symbol, centerX, centerY);
                } else if (labelConfig.showSymbol && labelConfig.showPercent) {
                    // Draw Symbol
                    // Try to fit both lines; if value doesn't fit, degrade to ticker-only.
                    const desiredSymbol = labelConfig.symbolFontPx;
                    const desiredValue = labelConfig.percentFontPx ?? FONT_SIZE_CONFIG.MIN_PERCENT_SIZE;

                    const fittedSymbol = fitFontPxToBox(
                        ctx,
                        company.symbol,
                        desiredSymbol,
                        tileW,
                        tileH * 0.55,
                        'bold',
                        MIN_TICKER_FONT_PX
                    );
                    if (!fittedSymbol) return;

                    const text = metric === 'mcap'
                        ? formatMarketCapDiff(company.marketCapDiff)
                        : formatPercent(company.changePercent);

                    const fittedValue = fitFontPxToBox(
                        ctx,
                        text,
                        desiredValue,
                        tileW,
                        tileH * 0.45,
                        '500',
                        MIN_VALUE_FONT_PX
                    );

                    if (!fittedValue) {
                        // Not enough space for two lines -> show just ticker in center.
                        ctx.font = `bold ${fittedSymbol}px ${fontFamily}`;
                        ctx.strokeText(company.symbol, centerX, centerY);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(company.symbol, centerX, centerY);
                        return;
                    }

                    const symbolY = centerY - (fittedValue / 2) - 2;
                    ctx.font = `bold ${fittedSymbol}px ${fontFamily}`;

                    // Outline
                    ctx.strokeText(company.symbol, centerX, symbolY);
                    // Fill
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(company.symbol, centerX, symbolY);

                    // Draw Percent/Value
                    const percentY = centerY + (fittedSymbol / 2) + 2;

                    ctx.font = `500 ${fittedValue}px ${fontFamily}`;

                    // Outline
                    ctx.strokeText(text, centerX, percentY);
                    // Fill
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                    ctx.fillText(text, centerX, percentY);
                }
            }
        });

    }, [leaves, width, height, scale, offset, metric, timeframe]);

    // Interaction Handler (throttled via rAF; updates hover state only when tile changes)
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        pendingPointRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            clientX: e.clientX,
            clientY: e.clientY,
        };

        if (rafRef.current !== null) return;

        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;

            const p = pendingPointRef.current;
            if (!p) return;

            const currentLeaves = leavesRef.current;
            const { scale: currentScale, offset: currentOffset } = transformRef.current;

            let found: TreemapLeaf | null = null;
            for (let i = currentLeaves.length - 1; i >= 0; i--) {
                const leaf = currentLeaves[i];
                if (!leaf) continue;

                const tileX = leaf.x0 * currentScale + currentOffset.x;
                const tileY = leaf.y0 * currentScale + currentOffset.y;
                const tileW = (leaf.x1 - leaf.x0) * currentScale;
                const tileH = (leaf.y1 - leaf.y0) * currentScale;

                if (p.x >= tileX && p.x <= tileX + tileW && p.y >= tileY && p.y <= tileY + tileH) {
                    found = leaf;
                    break;
                }
            }

            const company = found?.data?.meta?.companyData ?? null;
            const key = company?.symbol ?? null;

            // Only trigger React state update when hovered tile changes (prevents update-depth loops)
            if (key !== lastHoverKeyRef.current) {
                lastHoverKeyRef.current = key;
                setHoveredLeaf(found);
            }

            const cb = onHoverRef.current;
            if (cb) cb(company, p.clientX, p.clientY);
        });
    }, []);

    const handleClick = useCallback(() => {
        if (hoveredLeaf && onTileClick) {
            onTileClick(hoveredLeaf.data.meta.companyData!);
        }
    }, [hoveredLeaf, onTileClick]);

    const handleMouseLeave = useCallback(() => {
        pendingPointRef.current = null;
        lastHoverKeyRef.current = null;
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        setHoveredLeaf(null);
        const cb = onHoverRef.current;
        if (cb) cb(null, 0, 0);
    }, []);

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
