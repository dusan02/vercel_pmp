'use client';

import React from 'react';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import type { MobileTreemapSectorBlock } from '@/lib/heatmap/mobileTreemap';
import { getMobileTileLabel } from '@/lib/heatmap/mobileLabels';
import { pickCompanyWithHitSlop } from '@/lib/heatmap/mobileHitSlop';
import { MobileHeatmapTile } from './MobileHeatmapTile';

// Sector chrome sizing (must match computeMobileTreemapSectors config).
const SECTOR_LABEL_H = 16;
const SECTOR_LABEL_DIVIDER_H = 1;
const SECTOR_LABEL_TOP_GAP = 2;
const SECTOR_LABEL_BOTTOM_MARGIN = 2;
const SECTOR_CHROME_H = SECTOR_LABEL_H + SECTOR_LABEL_TOP_GAP + SECTOR_LABEL_DIVIDER_H + SECTOR_LABEL_BOTTOM_MARGIN;

interface MobileHeatmapSectorProps {
  sector: MobileTreemapSectorBlock;
  metric: HeatmapMetric;
  getColor: (company: CompanyNode) => string;
  onTileSelect: (company: CompanyNode) => void;
  onTileClick?: ((company: CompanyNode) => void) | undefined;
}

/**
 * Renders one sector block: label zone (top) + tiles zone (below).
 * Uses absolute positioning to guarantee zero overlap between zones.
 */
export const MobileHeatmapSector: React.FC<MobileHeatmapSectorProps> = ({
  sector,
  metric,
  getColor,
  onTileSelect,
  onTileClick,
}) => {
  const handleTilesClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const tileEl = target?.closest?.('[data-heatmap-tile="1"]') as HTMLElement | null;
    if (tileEl) {
      const minDim = Number(tileEl.getAttribute('data-min-dim'));
      if (Number.isFinite(minDim) && minDim >= 22) return; // tile click handled by tile itself
    }

    // Hit-slop fallback for small tiles
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const picked = pickCompanyWithHitSlop(sector.children, px, py, { radiusPx: 20 });
    if (!picked) return;

    e.preventDefault();
    e.stopPropagation();
    onTileSelect(picked);
    onTileClick?.(picked);
  };

  const handleTileClick = (company: CompanyNode) => {
    onTileSelect(company);
    onTileClick?.(company);
  };

  return (
    <div
      style={{
        position: 'relative',
        flexBasis: `${sector.width}px`,
        flexShrink: 0,
        flexGrow: 0,
        height: '100%',
        overflow: 'hidden',
        background: '#0a0a0a',
        zIndex: 0,
        transform: 'translateZ(0)',
      }}
    >
      {/* ZONE 1: Sector label */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%',
          height: `${SECTOR_CHROME_H}px`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          zIndex: 2,
          background: '#0a0a0a',
        }}
      >
        <div
          style={{
            padding: '0 6px',
            height: `${SECTOR_LABEL_H}px`,
            display: 'flex',
            alignItems: 'center',
            fontSize: '9.5px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            WebkitTextSizeAdjust: '100%',
          }}
        >
          {sector.name}
        </div>
        <div
          style={{
            height: `${SECTOR_LABEL_DIVIDER_H}px`,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 100%)',
            borderRadius: '1px',
            flexShrink: 0,
          }}
        />
      </div>

      {/* ZONE 2: Tiles */}
      <div
        onClickCapture={handleTilesClick}
        style={{
          position: 'absolute',
          top: `${SECTOR_CHROME_H}px`,
          left: 0, width: '100%',
          height: `${sector.tilesHeight}px`,
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        {sector.children.map((leaf, i) => {
          const company = leaf.company;
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;
          const label = getMobileTileLabel(company, w, h, metric);

          return (
            <MobileHeatmapTile
              key={`${company.symbol}-${i}`}
              company={company}
              x={leaf.x0}
              y={leaf.y0}
              width={w}
              height={h}
              color={getColor(company)}
              label={label}
              index={i}
              onClick={handleTileClick}
            />
          );
        })}
      </div>
    </div>
  );
};
