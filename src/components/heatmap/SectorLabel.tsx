'use client';

import React, { useMemo } from 'react';
import type { HeatmapMetric, SectorLabelVariant, TreemapNode, HierarchyData } from '@/lib/heatmap/types';
import { LAYOUT_CONFIG } from '@/lib/utils/heatmapConfig';
import { calculateMaxCharsForWidth, calculateSectorSummary, truncateSectorName } from '@/lib/heatmap/sectorLabels';
import styles from '@/styles/heatmap.module.css';

interface SectorLabelProps {
    node: TreemapNode;
    scale: number;
    offset: { x: number; y: number };
    sectorLabelVariant: SectorLabelVariant;
    isMobile: boolean;
    metric: HeatmapMetric;
    treemapBoundsNotNull: boolean;
    zoomedSectorClass?: boolean;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onClick?: () => void;
}

export function SectorLabel({
    node,
    scale,
    offset,
    sectorLabelVariant,
    isMobile,
    metric,
    treemapBoundsNotNull,
    zoomedSectorClass,
    onMouseEnter,
    onMouseLeave,
    onClick,
}: SectorLabelProps) {
    const { x0, y0, x1, y1 } = node;
    const data = node.data as HierarchyData;
    const nodeWidth = x1 - x0;
    const nodeHeight = y1 - y0;
    const scaledWidth = nodeWidth * scale;
    const scaledHeight = nodeHeight * scale;

    const labelConfig = sectorLabelVariant === 'full'
        ? LAYOUT_CONFIG.SECTOR_LABEL_FULL
        : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT;

    const labelHeight = isMobile
        ? (sectorLabelVariant === 'full' ? 18 : labelConfig.HEIGHT)
        : labelConfig.HEIGHT;
    const labelLeft = isMobile ? Math.min(labelConfig.LEFT, 6) : labelConfig.LEFT;

    const minSizeForLabel = 80;
    const minHeightForLabel = labelHeight + 8;
    const showLabel = scaledWidth > minSizeForLabel
        && scaledHeight > minHeightForLabel
        && scale > 0
        && treemapBoundsNotNull;

    if (!showLabel) return null;

    const minFont = labelConfig.FONT_SIZE_MIN;
    const maxFont = labelConfig.FONT_SIZE_MAX;
    const maxLabelWidth = scaledWidth * 0.9;
    const widthBasedFont = Math.min(maxFont, Math.max(minFont, maxLabelWidth / 8));
    const responsiveFontSize = `clamp(${minFont}px, ${widthBasedFont}px, ${maxFont}px)`;
    const fontSizeValue = parseFloat(responsiveFontSize.match(/\d+\.?\d*/)?.[0] || String(minFont));

    const sectorSummary = !isMobile && sectorLabelVariant === 'full' && LAYOUT_CONFIG.SECTOR_LABEL_FULL.SHOW_SUMMARY
        ? calculateSectorSummary(node, metric)
        : null;

    const accentColor = useMemo(() => {
        const leaves = node.leaves?.() as Array<{ data: HierarchyData }> | undefined ?? [];
        let totalMcap = 0;
        let weightedChange = 0;
        for (const leaf of leaves) {
            const company = leaf.data?.meta?.companyData;
            if (!company) continue;
            const w = company.marketCap || 0;
            const v = metric === 'mcap' ? (company.marketCapDiff ?? 0) : (company.changePercent || 0);
            weightedChange += v * w;
            totalMcap += w;
        }
        const perf = totalMcap > 0 ? weightedChange / totalMcap : 0;
        return perf > 0 ? '#16a34a' : perf < 0 ? '#dc2626' : '#4b5563';
    }, [node, metric]);

    const maxChars = calculateMaxCharsForWidth(scaledWidth, fontSizeValue, labelConfig.LEFT + 20);
    const defaultMaxLength = sectorLabelVariant === 'full' ? 25 : 20;
    const maxLength = Math.max(4, Math.min(maxChars, defaultMaxLength));
    const displayName = truncateSectorName(data.name, maxLength);

    const isInteractive = !!(onMouseEnter || onClick);

    return (
        <div
            className={[
                styles.sectorLabelWrap,
                sectorLabelVariant === 'full' ? styles.sectorLabelWrapFull : styles.sectorLabelWrapCompact,
                zoomedSectorClass ? styles.heatmapZoomEnter : '',
            ].filter(Boolean).join(' ')}
            style={{
                left: x0 * scale + offset.x,
                top: y0 * scale + offset.y,
                width: nodeWidth * scale,
                maxWidth: nodeWidth * scale,
                height: labelHeight,
                paddingLeft: labelLeft,
                overflow: 'hidden',
                ...(isInteractive ? { pointerEvents: 'auto' as const } : {}),
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
        >
            {sectorLabelVariant === 'full' ? (
                <div
                    className={styles.sectorLabelStripFull}
                    style={{
                        fontSize: responsiveFontSize,
                        borderLeft: `3px solid ${accentColor}`,
                        paddingLeft: '6px',
                        ...(isMobile ? {
                            width: 'fit-content',
                            maxWidth: '100%',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            borderLeft: `3px solid ${accentColor}`,
                        } : {}),
                    }}
                >
                    <span>{displayName}</span>
                    {sectorSummary && (
                        <span className={styles.sectorLabelSummary}>{sectorSummary}</span>
                    )}
                </div>
            ) : (
                <div
                    className={styles.sectorLabelPillCompact}
                    style={{
                        fontSize: responsiveFontSize,
                        borderLeft: `3px solid ${accentColor}`,
                        paddingLeft: '5px',
                    }}
                >
                    {displayName}
                </div>
            )}
        </div>
    );
}
