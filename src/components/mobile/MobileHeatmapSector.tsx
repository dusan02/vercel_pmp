'use client';

import React from 'react';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import type { MobileTreemapSectorBlock } from '@/lib/heatmap/mobileTreemap';
import { getMobileTileLabel } from '@/lib/heatmap/mobileLabels';
import { pickCompanyWithHitSlop } from '@/lib/heatmap/mobileHitSlop';
import { MobileHeatmapTile } from './MobileHeatmapTile';

// Sector chrome: 16px = 12px label + 1px divider + 3px spacing
// Must match SECTOR_CHROME_PX in mobileTreemap.ts
const LABEL_H = 12;
const CHROME_H = 16;

interface MobileHeatmapSectorProps {
  sector: MobileTreemapSectorBlock;
  metric: HeatmapMetric;
  getColor: (company: CompanyNode) => string;
  onTileSelect: (company: CompanyNode) => void;
  onTileClick?: ((company: CompanyNode) => void) | undefined;
}

/**
 * Renders one sector block: compact label (top) + tile area (below).
 * Absolute positioning guarantees zero overlap between label and tiles.
 */
export const MobileHeatmapSector: React.FC<MobileHeatmapSectorProps> = ({
  sector, metric, getColor, onTileSelect, onTileClick,
}) => {
  const handleTilesClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const tileEl = target?.closest?.('[data-heatmap-tile="1"]') as HTMLElement | null;
    if (tileEl) {
      const minDim = Number(tileEl.getAttribute('data-min-dim'));
      if (Number.isFinite(minDim) && minDim >= 22) return;
    }

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const picked = pickCompanyWithHitSlop(
      sector.children, e.clientX - rect.left, e.clientY - rect.top, { radiusPx: 20 }
    );
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
      }}
    >
      {/* Sector label */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%',
          height: `${CHROME_H}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          zIndex: 2,
          background: '#0a0a0a',
        }}
      >
        <div
          style={{
            padding: '0 4px',
            height: `${LABEL_H}px`,
            display: 'flex',
            alignItems: 'center',
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.55)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sector.name}
        </div>
        <div
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.04) 100%)',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Tiles area */}
      <div
        onClickCapture={handleTilesClick}
        style={{
          position: 'absolute',
          top: `${CHROME_H}px`,
          left: 0, width: '100%',
          height: `${sector.tilesHeight}px`,
          overflow: 'hidden',
        }}
      >
        {sector.children.map((leaf, i) => {
          const company = leaf.company;
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;
          return (
            <MobileHeatmapTile
              key={`${company.symbol}-${i}`}
              company={company}
              x={leaf.x0}
              y={leaf.y0}
              width={w}
              height={h}
              color={getColor(company)}
              label={getMobileTileLabel(company, w, h, metric)}
              index={i}
              onClick={handleTileClick}
            />
          );
        })}
      </div>
    </div>
  );
};
