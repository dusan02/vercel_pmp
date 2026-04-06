'use client';

import React from 'react';
import { CanvasHeatmap } from '../CanvasHeatmap';
import { SectorLabel } from './SectorLabel';
import type { CompanyNode, HeatmapMetric, SectorLabelVariant, HierarchyData, TreemapLeaf, TreemapNode } from '@/lib/heatmap/types';

interface PanZoomState {
    zoom: number;
    panX: number;
    panY: number;
}

interface HeatmapCanvasViewProps {
    filteredNodes: any[];
    filteredLeaves: TreemapLeaf[];
    width: number;
    height: number;
    scale: number;
    offset: { x: number; y: number };
    panZoom: PanZoomState;
    treemapBoundsNotNull: boolean;
    sectorLabelVariant: SectorLabelVariant;
    isMobile: boolean;
    metric: HeatmapMetric;
    timeframe: 'day' | 'week' | 'month';
    onTileClick?: ((company: CompanyNode) => void) | undefined;
    onHover: (company: CompanyNode | null, x: number, y: number) => void;
}

export function HeatmapCanvasView({
    filteredNodes,
    filteredLeaves,
    width,
    height,
    scale,
    offset,
    panZoom,
    treemapBoundsNotNull,
    sectorLabelVariant,
    isMobile,
    metric,
    timeframe,
    onTileClick,
    onHover,
}: HeatmapCanvasViewProps) {
    const effectiveScale = scale * panZoom.zoom;
    const effectiveOffset = {
        x: offset.x * panZoom.zoom + panZoom.panX,
        y: offset.y * panZoom.zoom + panZoom.panY,
    };

    return (
        <>
            {/* Sector borders */}
            {filteredNodes
                .filter((node) => node.depth === 1)
                .map((node) => {
                    const { x0, y0, x1, y1 } = node as TreemapNode;
                    return (
                        <div
                            key={`sector-border-${node.data.name}-${x0}-${y0}`}
                            className="absolute pointer-events-none"
                            style={{
                                left: x0 * effectiveScale + effectiveOffset.x,
                                top: y0 * effectiveScale + effectiveOffset.y,
                                width: (x1 - x0) * effectiveScale,
                                height: (y1 - y0) * effectiveScale,
                                boxShadow: 'inset 0 0 0 1.5px #000000',
                                zIndex: 10,
                            }}
                        />
                    );
                })}

            {/* Industry borders */}
            {filteredNodes
                .filter((node) => node.data.meta?.type === 'industry')
                .map((node) => {
                    const { x0, y0, x1, y1 } = node as TreemapNode;
                    const w = (x1 - x0) * effectiveScale;
                    const h = (y1 - y0) * effectiveScale;
                    if (w < 5 || h < 5) return null;
                    return (
                        <div
                            key={`industry-border-${node.data.name}-${x0}-${y0}`}
                            className="absolute pointer-events-none"
                            style={{
                                left: x0 * effectiveScale + effectiveOffset.x,
                                top: y0 * effectiveScale + effectiveOffset.y,
                                width: w,
                                height: h,
                                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.6)',
                                zIndex: 8,
                            }}
                        />
                    );
                })}

            <CanvasHeatmap
                leaves={filteredLeaves}
                width={width}
                height={height}
                scale={effectiveScale}
                offset={effectiveOffset}
                onTileClick={(company: CompanyNode) => onTileClick?.(company)}
                onHover={onHover}
                metric={metric}
                timeframe={timeframe}
            />

            {/* Sector labels */}
            {filteredNodes
                .filter((node) => node.depth === 1)
                .map((node) => (
                    <SectorLabel
                        key={`sector-label-${node.data.name}-${(node as TreemapNode).x0}-${(node as TreemapNode).y0}`}
                        node={node as TreemapNode}
                        scale={effectiveScale}
                        offset={effectiveOffset}
                        sectorLabelVariant={sectorLabelVariant}
                        isMobile={isMobile}
                        metric={metric}
                        treemapBoundsNotNull={treemapBoundsNotNull}
                    />
                ))}

            {/* Industry labels */}
            {filteredNodes
                .filter((node) => node.data.meta?.type === 'industry')
                .map((node) => {
                    const { x0, y0, x1, y1 } = node as TreemapNode;
                    const data = node.data as HierarchyData;
                    const scaledWidth = (x1 - x0) * effectiveScale;
                    const scaledHeight = (y1 - y0) * effectiveScale;
                    if (scaledWidth < 40 || scaledHeight < 20 || effectiveScale <= 0) return null;
                    const displayName = data.name.length > 15 && scaledWidth < 80
                        ? data.name.substring(0, 12) + '...'
                        : data.name;
                    return (
                        <div
                            key={`industry-label-${data.name}-${x0}-${y0}`}
                            className="absolute pointer-events-none flex items-center overflow-hidden"
                            style={{
                                left: x0 * effectiveScale + effectiveOffset.x,
                                top: y0 * effectiveScale + effectiveOffset.y,
                                width: scaledWidth,
                                height: 14,
                                paddingLeft: 4,
                                zIndex: 8,
                            }}
                        >
                            <span style={{
                                color: 'rgba(255,255,255,0.4)',
                                fontSize: '9px',
                                fontWeight: 600,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap',
                            }}>
                                {displayName}
                            </span>
                        </div>
                    );
                })}
        </>
    );
}
