/**
 * HeatmapTile Component
 * Memoized component for rendering individual heatmap tiles
 */

'use client';

import React from 'react';
import type { CompanyNode, TreemapLeaf } from './MarketHeatmap';
import { formatPercent, formatMarketCapDiff } from '@/lib/utils/heatmapFormat';
import styles from '@/styles/heatmap.module.css';

interface HeatmapTileProps {
  leaf: TreemapLeaf;
  scale: number;
  offset: { x: number; y: number };
  color: string;
  labelConfig: {
    showSymbol: boolean;
    showPercent: boolean;
    symbolFontPx: number;
    percentFontPx?: number;
    align: 'center' | 'top-left';
  };
  metric: 'percent' | 'mcap';
  colorTransition: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

/**
 * Memoized tile component for better performance
 */
export const HeatmapTile = React.memo<HeatmapTileProps>(({
  leaf,
  scale,
  offset,
  color,
  labelConfig,
  metric,
  colorTransition,
  onMouseEnter,
  onMouseLeave,
  onClick,
}) => {
  const { x0, y0, x1, y1 } = leaf;
  const tileWidth = x1 - x0;
  const tileHeight = y1 - y0;
  const company = leaf.data.meta.companyData;

  const scaledWidth = tileWidth * scale;
  const scaledHeight = tileHeight * scale;

  return (
    <div
      key={`${company.symbol}-${x0}-${y0}`}
      className={`${styles.heatmapTile} group`}
      style={{
        left: x0 * scale + offset.x,
        top: y0 * scale + offset.y,
        width: tileWidth * scale,
        height: tileHeight * scale,
        backgroundColor: color,
        transitionProperty: colorTransition ? 'background-color' : 'all',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {(labelConfig.showSymbol || labelConfig.showPercent) && (
        <div className={styles.heatmapTileContent}>
          {labelConfig.showSymbol && (
            <div
              className={styles.heatmapTileSymbol}
              style={{ fontSize: `${labelConfig.symbolFontPx}px` }}
            >
              {company.symbol}
            </div>
          )}
          {labelConfig.showPercent && labelConfig.percentFontPx && (
            <div
              className={styles.heatmapTilePercent}
              style={{ fontSize: `${labelConfig.percentFontPx}px` }}
            >
              {metric === 'mcap'
                ? formatMarketCapDiff(company.marketCapDiff)
                : formatPercent(company.changePercent)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if these props change
  return (
    prevProps.leaf === nextProps.leaf &&
    prevProps.scale === nextProps.scale &&
    prevProps.offset.x === nextProps.offset.x &&
    prevProps.offset.y === nextProps.offset.y &&
    prevProps.color === nextProps.color &&
    prevProps.metric === nextProps.metric &&
    prevProps.colorTransition === nextProps.colorTransition &&
    prevProps.labelConfig.showSymbol === nextProps.labelConfig.showSymbol &&
    prevProps.labelConfig.showPercent === nextProps.labelConfig.showPercent &&
    prevProps.labelConfig.symbolFontPx === nextProps.labelConfig.symbolFontPx
  );
});

HeatmapTile.displayName = 'HeatmapTile';

