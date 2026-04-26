'use client';

import React, { useMemo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CompanyNode } from '@/lib/heatmap/types';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import { computeMobileTreemapSectors, prepareMobileTreemapData, SECTOR_CHROME_PX, COLUMN_GAP_PX } from '@/lib/heatmap/mobileTreemap';
import { MobileHeatmapHeader } from './mobile/MobileHeatmapHeader';
import { MobileHeatmapSheet } from './mobile/MobileHeatmapSheet';
import { MobileHeatmapSector } from './mobile/MobileHeatmapSector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MobileTreemapNewProps {
  data: CompanyNode[];
  timeframe?: 'day' | 'week' | 'month';
  metric?: 'percent' | 'mcap';
  layoutMetric?: 'percent' | 'mcap';
  onMetricChange?: (metric: 'percent' | 'mcap') => void;
  onTileClick?: (company: CompanyNode) => void;
  onToggleFavorite?: (ticker: string) => void;
  isFavorite?: (ticker: string) => boolean;
  activeView?: string | undefined;
  height?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MobileTreemapNew: React.FC<MobileTreemapNewProps> = ({
  data,
  timeframe = 'day',
  metric = 'percent',
  layoutMetric,
  onMetricChange,
  onTileClick,
  onToggleFavorite,
  isFavorite,
  height,
}) => {
  // -- Container measurement --------------------------------------------------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // Capture initial height once (before D3 grows the container).
    const initialH = containerRef.current.getBoundingClientRect().height;
    setContainerSize((prev) =>
      prev.height > 0 ? prev : { width: prev.width, height: initialH },
    );

    // Track width only — height must stay frozen to prevent infinite layout thrashing.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setContainerSize((prev) => (prev.width !== width ? { width, height: prev.height } : prev));
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // -- Detail sheet -----------------------------------------------------------
  const [selectedCompany, setSelectedCompany] = useState<CompanyNode | null>(null);
  const closeSheet = useCallback(() => setSelectedCompany(null), []);

  const handleTileSelect = useCallback((company: CompanyNode) => {
    setSelectedCompany(company);
  }, []);

  // -- Data prep & layout -----------------------------------------------------
  const sortedData = useMemo(() => prepareMobileTreemapData(data), [data]);

  const colorScale = useMemo(
    () => createHeatmapColorScale(timeframe, metric === 'mcap' ? 'mcap' : 'percent'),
    [timeframe, metric],
  );

  const getColor = useCallback(
    (company: CompanyNode): string => {
      if (!company) return '#1a1a1a';
      const value = metric === 'percent' ? (company.changePercent ?? 0) : (company.marketCapDiff ?? 0);
      return colorScale(value);
    },
    [metric, colorScale],
  );

  const treemapResult = useMemo(() => {
    const heightConfig =
      height !== undefined
        ? { contentHeightMultiplier: 1, minTotalContentHeightPx: height - 16 }
        : {};

    return computeMobileTreemapSectors(sortedData, containerSize, layoutMetric || metric, {
      sectorChromeHeightPx: SECTOR_CHROME_PX,
      columnGapPx: COLUMN_GAP_PX,
      ...heightConfig,
    });
  }, [sortedData, metric, layoutMetric, containerSize, height]);

  const { rows } = treemapResult;

  // -- Render -----------------------------------------------------------------
  return (
    <div
      className="flex flex-col w-full overflow-hidden"
      style={{ position: 'relative', height: '100%', minHeight: '100%', zIndex: 1, background: '#0a0a0a' }}
    >
      <MobileHeatmapHeader metric={metric} onMetricChange={onMetricChange} />

      {/* Treemap scroll container — full-bleed, no padding waste */}
      <div
        ref={containerRef}
        className="mobile-heatmap-scroll"
        style={{
          width: '100%',
          overflowX: 'hidden',
          backgroundColor: '#0a0a0a',
          ...(height !== undefined
            ? { height: `${height}px`, overflowY: 'hidden' }
            : { flex: 1, overflowY: 'auto' }),
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          {rows && rows.length > 0 && containerSize.width > 0 ? (
            rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  width: '100%',
                  height: `${row.height}px`,
                  flexShrink: 0,
                  gap: `${COLUMN_GAP_PX}px`,
                }}
              >
                {row.sectors.map((sector) => (
                  <MobileHeatmapSector
                    key={sector.name}
                    sector={sector}
                    metric={metric}
                    getColor={getColor}
                    onTileSelect={handleTileSelect}
                    onTileClick={onTileClick}
                  />
                ))}
              </div>
            ))
          ) : (
            <div
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '12px', height: '100%', minHeight: '300px',
              }}
            >
              <div
                className="animate-spin rounded-full border-b-2 border-[var(--clr-text)]"
                style={{ width: '32px', height: '32px' }}
              />
              <span style={{ color: 'var(--clr-text-secondary)', fontSize: '14px' }}>Loading heatmap...</span>
            </div>
          )}
        </div>
      </div>

      {/* Detail bottom sheet */}
      {selectedCompany && (
        <MobileHeatmapSheet
          company={selectedCompany}
          onClose={closeSheet}
          onToggleFavorite={onToggleFavorite}
          isFavorite={isFavorite}
        />
      )}
    </div>
  );
};
