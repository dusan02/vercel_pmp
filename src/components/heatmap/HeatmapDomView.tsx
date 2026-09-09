'use client';

import React from 'react';
import { HeatmapTile } from '../HeatmapTile';
import { SectorLabel } from './SectorLabel';
import type { CompanyNode, HeatmapMetric, SectorLabelVariant, HierarchyData, TreemapLeaf, TreemapNode } from '@/lib/heatmap/types';
import { getTileLabelConfig } from '@/lib/utils/heatmapLabelUtils';
import styles from '@/styles/heatmap.module.css';

interface HeatmapDomViewProps {
    filteredLeaves: TreemapLeaf[];
    filteredNodes: any[];
    scale: number;
    offset: { x: number; y: number };
    colorScale: (v: number) => string;
    metric: HeatmapMetric;
    hoveredSector: string | null;
    treemapBoundsNotNull: boolean;
    sectorLabelVariant: SectorLabelVariant;
    isMobile: boolean;
    zoomedSector: string | null;
    onTileClick?: ((company: CompanyNode) => void) | undefined;
    onTileHover: (company: CompanyNode | null) => void;
    onMobileTap?: ((company: CompanyNode, x: number, y: number) => void) | undefined;
    onSectorMouseEnter: (name: string) => void;
    onSectorMouseLeave: () => void;
    onSectorClick: (name: string) => void;
}

export function HeatmapDomView({
    filteredLeaves,
    filteredNodes,
    scale,
    offset,
    colorScale,
    metric,
    hoveredSector,
    treemapBoundsNotNull,
    sectorLabelVariant,
    isMobile,
    zoomedSector,
    onTileClick,
    onTileHover,
    onMobileTap,
    onSectorMouseEnter,
    onSectorMouseLeave,
    onSectorClick,
}: HeatmapDomViewProps) {
    return (
        <>
            {/* Company tiles */}
            {filteredLeaves.map((leaf) => {
                const { x0, y0, x1, y1 } = leaf;
                const company = leaf.data.meta.companyData;
                const v = metric === 'mcap' ? (company.marketCapDiff ?? 0) : company.changePercent;
                const tileColor = colorScale(v);
                const scaledWidth = (x1 - x0) * scale;
                const scaledHeight = (y1 - y0) * scale;
                const labelConfig = getTileLabelConfig(scaledWidth, scaledHeight);

                return (
                    <HeatmapTile
                        key={`${company.symbol}-${x0}-${y0}`}
                        leaf={leaf}
                        scale={scale}
                        offset={offset}
                        color={tileColor}
                        labelConfig={labelConfig}
                        metric={metric}
                        onMouseEnter={() => onTileHover(company)}
                        onMouseLeave={() => onTileHover(null)}
                        onClick={(e) => {
                            onTileClick?.(company);
                            if (isMobile) onMobileTap?.(company, e.clientX, e.clientY);
                        }}
                    />
                );
            })}

            {/* Sector borders */}
            {filteredNodes
                .filter((node) => node.depth === 1)
                .map((node) => {
                    const { x0, y0, x1, y1 } = node as TreemapNode;
                    const data = node.data as HierarchyData;
                    const isHovered = hoveredSector === data.name;
                    return (
                        <div
                            key={`sector-border-${data.name}-${x0}-${y0}`}
                            className="absolute cursor-pointer transition-all duration-200 ease-in-out"
                            style={{
                                left: x0 * scale + offset.x,
                                top: y0 * scale + offset.y,
                                width: (x1 - x0) * scale,
                                height: (y1 - y0) * scale,
                                pointerEvents: 'auto',
                                borderTop: isHovered ? '2px solid rgba(255,255,255,0.8)' : '1.5px solid #000000',
                                borderLeft: isHovered ? '2px solid rgba(255,255,255,0.8)' : '1.5px solid #000000',
                                borderRight: isHovered ? '2px solid rgba(255,255,255,0.8)' : '1.5px solid #000000',
                                borderBottom: isHovered ? '2px solid rgba(255,255,255,0.8)' : '1px solid rgba(0,0,0,0.4)',
                                boxShadow: isHovered ? 'inset 0 0 20px rgba(255,255,255,0.1)' : 'none',
                                boxSizing: 'border-box',
                                zIndex: isHovered ? 20 : 10,
                            }}
                            onMouseEnter={() => onSectorMouseEnter(data.name)}
                            onMouseLeave={onSectorMouseLeave}
                            onClick={() => onSectorClick(data.name)}
                        >
                            {isHovered && <div className={styles.heatmapSectorHover} />}
                        </div>
                    );
                })}

            {/* Sector labels */}
            {filteredNodes
                .filter((node) => node.depth === 1)
                .map((node) => (
                    <SectorLabel
                        key={`sector-label-${node.data.name}-${(node as TreemapNode).x0}-${(node as TreemapNode).y0}`}
                        node={node as TreemapNode}
                        scale={scale}
                        offset={offset}
                        sectorLabelVariant={sectorLabelVariant}
                        isMobile={isMobile}
                        metric={metric}
                        treemapBoundsNotNull={treemapBoundsNotNull}
                        zoomedSectorClass={!!zoomedSector}
                        onMouseEnter={() => onSectorMouseEnter(node.data.name)}
                        onMouseLeave={onSectorMouseLeave}
                        onClick={() => onSectorClick(node.data.name)}
                    />
                ))}
        </>
    );
}
