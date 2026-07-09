'use client';

import React from 'react';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import type { MobileTreemapSector } from '@/lib/heatmap/mobileTreemap';
import { getMobileTileLabel } from '@/lib/heatmap/mobileLabels';
import { pickCompanyWithHitSlop } from '@/lib/heatmap/mobileHitSlop';
import { MobileHeatmapTile } from './MobileHeatmapTile';

const LABEL_H = 12;
const CHROME_H = 16;

interface MobileHeatmapSectorProps {
  sector: MobileTreemapSector;
  metric: HeatmapMetric;
  getColor: (company: CompanyNode) => string;
  onTileSelect: (company: CompanyNode) => void;
  onTileClick?: ((company: CompanyNode) => void) | undefined;
}

/**
 * Renders one sector: positioned absolutely by D3 global treemap coordinates.
 * Tiles are positioned relative to the sector origin.
 */
export const MobileHeatmapSector: React.FC<MobileHeatmapSectorProps> = ({
  sector, metric, getColor, onTileSelect, onTileClick,
}) => {
  const secW = sector.x1 - sector.x0;
  const secH = sector.y1 - sector.y0;

  const handleTilesClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const tileEl = target?.closest?.('[data-heatmap-tile="1"]') as HTMLElement | null;
    if (tileEl) {
      const minDim = Number(tileEl.getAttribute('data-min-dim'));
      if (Number.isFinite(minDim) && minDim >= 22) return;
    }

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    // Tiles have global coordinates; add sector origin to convert relative click to global
    const px = e.clientX - rect.left + sector.x0;
    const py = e.clientY - rect.top + sector.y0;
    const picked = pickCompanyWithHitSlop(
      sector.tiles, px, py, { radiusPx: 20 }
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
        position: 'absolute',
        left: `${sector.x0}px`,
        top: `${sector.y0}px`,
        width: `${secW}px`,
        height: `${secH}px`,
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

      {/* Tiles area — tiles are positioned relative to sector origin */}
      <div
        onClickCapture={handleTilesClick}
        style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          overflow: 'hidden',
        }}
      >
        {sector.tiles.map((leaf, i) => {
          const company = leaf.company;
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;
          // Tile coordinates are global; subtract sector origin for relative positioning
          const relX = leaf.x0 - sector.x0;
          const relY = leaf.y0 - sector.y0;
          return (
            <MobileHeatmapTile
              key={`${company.symbol}-${i}`}
              company={company}
              x={relX}
              y={relY}
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
