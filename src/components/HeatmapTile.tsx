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

  // Fit ticker text to the available tile box (DOM mode only).
  // Canvas mode does a more precise fit with ctx.measureText.
  const fittedSymbolFontPx = React.useMemo(() => {
    if (!labelConfig.showSymbol || !labelConfig.symbolFontPx) return 0;
    const padding = 4;
    const maxW = Math.max(0, scaledWidth - padding * 2);
    const maxH = Math.max(0, scaledHeight - padding * 2);
    if (maxW <= 0 || maxH <= 0) return 0;

    // Approximate character width in px (~0.6em for typical UI fonts).
    const approxCharW = 0.62;
    const byWidth = Math.floor(maxW / Math.max(1, company.symbol.length * approxCharW));
    const byHeight = Math.floor(maxH); // rough upper bound
    const fitted = Math.min(labelConfig.symbolFontPx, byWidth, byHeight);
    return fitted >= 6 ? fitted : 0;
  }, [labelConfig.showSymbol, labelConfig.symbolFontPx, scaledWidth, scaledHeight, company.symbol]);

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
        zIndex: 1, // Below sector borders (sectors have z-10)
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {(labelConfig.showSymbol || labelConfig.showPercent) && (
        <div className={styles.heatmapTileContent}>
          {labelConfig.showSymbol && fittedSymbolFontPx > 0 && (
            <div
              className={styles.heatmapTileSymbol}
              style={{ fontSize: `${fittedSymbolFontPx}px` }}
            >
              {company.symbol}
            </div>
          )}
          {labelConfig.showPercent && labelConfig.percentFontPx && (
            <div
              className={styles.heatmapTilePercent}
              style={{ fontSize: `${labelConfig.percentFontPx}px` }}
            >
              {company.displayValue || (metric === 'mcap'
                ? formatMarketCapDiff(company.marketCapDiff)
                : formatPercent(company.changePercent))}
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

