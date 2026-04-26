'use client';

import React from 'react';
import type { CompanyNode } from '@/lib/heatmap/types';
import type { MobileTileLabel } from '@/lib/heatmap/mobileLabels';
import { getMobileTileOpticalOffsetPx } from '@/lib/heatmap/mobileLabels';

interface MobileHeatmapTileProps {
  company: CompanyNode;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: MobileTileLabel;
  index: number;
  onClick: (company: CompanyNode) => void;
}

/**
 * Single tile — positioned at exact D3 coordinates (sub-pixel precise).
 * Gap between tiles is baked into D3 layout via paddingInner(1).
 * No manual inset needed.
 */
export const MobileHeatmapTile = React.memo<MobileHeatmapTileProps>(({
  company,
  x, y, width, height,
  color, label, onClick,
}) => {
  if (width < 1 || height < 1) return null;

  const labelH = (label.symbolFontPx || 0) + (label.showValue ? (label.valueFontPx || 0) : 0);
  const opticalOffset = height > 60 && labelH > 20 ? getMobileTileOpticalOffsetPx(label) : 0;
  const r = width > 40 && height > 40 ? 3 : width > 20 && height > 20 ? 2 : 1;

  return (
    <div
      role="button"
      tabIndex={0}
      data-heatmap-tile="1"
      data-min-dim={Math.min(width, height)}
      onClick={(e) => { e.stopPropagation(); onClick(company); }}
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
        background: color,
        borderRadius: `${r}px`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.2)',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: 'pointer',
        touchAction: 'pan-y',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Dot indicator for tiny tiles */}
      {!(label.showSymbol || label.showValue) && width >= 8 && height >= 8 && (
        <div style={{
          width: Math.min(4, width * 0.2),
          height: Math.min(4, height * 0.2),
          borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.3)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Text labels */}
      {(label.showSymbol || label.showValue) && (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            alignContent: 'center',
            height: '100%',
            width: '100%',
            pointerEvents: 'none',
            textAlign: 'center',
            lineHeight: 1,
            gap: label.showValue ? 2 : 0,
            transform: opticalOffset > 0 ? `translateY(-${opticalOffset}px)` : undefined,
          }}
        >
          {label.showSymbol && (
            <div style={{
              fontSize: `${label.symbolFontPx}px`,
              fontWeight: 800,
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}>
              {label.symbol}
            </div>
          )}
          {label.showValue && (
            <div style={{
              fontSize: `${label.valueFontPx}px`,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.92)',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}>
              {label.value}
            </div>
          )}
        </div>
      )}
    </div>
  );
}, (prev, next) => (
  prev.company.symbol === next.company.symbol &&
  prev.x === next.x && prev.y === next.y &&
  prev.width === next.width && prev.height === next.height &&
  prev.color === next.color &&
  prev.label.showSymbol === next.label.showSymbol &&
  prev.label.showValue === next.label.showValue &&
  prev.label.symbolFontPx === next.label.symbolFontPx
));

MobileHeatmapTile.displayName = 'MobileHeatmapTile';
