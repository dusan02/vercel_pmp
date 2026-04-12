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
 * Single tile in the mobile heatmap.
 * Absolutely positioned within its sector's tile zone.
 */
export const MobileHeatmapTile = React.memo<MobileHeatmapTileProps>(({
  company,
  x, y, width, height,
  color, label, onClick,
}) => {
  if (width <= 0 || height <= 0) return null;

  const labelHeight = (label.symbolFontPx || 0) + (label.showValue ? (label.valueFontPx || 0) : 0);
  const useOpticalOffset = height > 60 && labelHeight > 20;
  const opticalOffsetPx = useOpticalOffset ? getMobileTileOpticalOffsetPx(label) : 0;

  const borderRadius = width > 40 && height > 40 ? '4px'
    : width > 20 && height > 20 ? '2px' : '1px';

  return (
    <div
      role="button"
      tabIndex={0}
      data-heatmap-tile="1"
      data-min-dim={Math.min(width, height)}
      onClick={(e) => { e.stopPropagation(); onClick(company); }}
      style={{
        position: 'absolute',
        left: `${x + 1}px`,
        top: `${y + 1}px`,
        width: `${Math.max(0, width - 2)}px`,
        height: `${Math.max(0, height - 2)}px`,
        background: color,
        boxShadow: [
          'inset 0 0 0 1px rgba(255,255,255,0.18)',
          'inset 0 1px 0 rgba(255,255,255,0.28)',
          '0 0 0 1px rgba(0,0,0,0.35)',
        ].join(', '),
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: 'pointer',
        zIndex: 1,
        touchAction: 'pan-y',
        borderRadius,
        transition: 'filter 0.15s ease',
      }}
    >
      {/* Dot indicator for tiny tiles */}
      {!(label.showSymbol || label.showValue) && width >= 10 && height >= 10 && (
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
            lineHeight: '1',
            gap: label.showValue ? 2 : 0,
            transform: opticalOffsetPx > 0 ? `translateY(-${opticalOffsetPx}px)` : 'none',
          }}
        >
          {label.showSymbol && (
            <div style={{
              fontSize: `${label.symbolFontPx}px`,
              fontWeight: 800,
              color: '#ffffff',
              textShadow: '0 1px 2px rgba(0,0,0,0.55)',
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
              color: 'rgba(255, 255, 255, 0.92)',
              textShadow: '0 1px 2px rgba(0,0,0,0.45)',
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
