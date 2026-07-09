'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CompanyNode } from '@/lib/heatmap/types';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import { computeMobileTreemapSectors, prepareMobileTreemapData, SECTOR_CHROME_PX } from '@/lib/heatmap/mobileTreemap';
import { useElementResize } from '@/hooks/useElementResize';
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
  activeView,
  height,
}) => {
  // -- Container measurement via useElementResize (width + height) ---------
  const { ref: containerRef, size: containerSize } = useElementResize();

  // -- Detail sheet -----------------------------------------------------------
  const [selectedCompany, setSelectedCompany] = useState<CompanyNode | null>(null);
  const closeSheet = useCallback(() => setSelectedCompany(null), []);

  // Auto-close sheet when the view is deactivated (user switched tabs)
  useEffect(() => {
    closeSheet();
  }, [activeView, closeSheet]);

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
    const effectiveSize = height !== undefined
      ? { width: containerSize.width, height }
      : containerSize;
    if (effectiveSize.width <= 0 || effectiveSize.height <= 0) return null;
    return computeMobileTreemapSectors(sortedData, effectiveSize, layoutMetric || metric, {
      sectorChromeHeightPx: SECTOR_CHROME_PX,
    });
  }, [sortedData, metric, layoutMetric, containerSize, height]);

  const sectors = treemapResult?.sectors ?? [];
  const layoutHeight = treemapResult?.height ?? 0;

  // -- Render -----------------------------------------------------------------
  return (
    <div
      className="flex flex-col w-full overflow-hidden"
      style={{ position: 'relative', height: '100%', minHeight: '100%', zIndex: 1, background: '#0a0a0a' }}
    >
      <MobileHeatmapHeader metric={metric} onMetricChange={onMetricChange} />

      {/* Treemap scroll container */}
      <div
        ref={containerRef}
        className="mobile-heatmap-scroll"
        style={{
          width: '100%',
          ...(height !== undefined
            ? { height: `${height}px`, overflowY: 'hidden' }
            : { flex: 1, overflowY: 'auto' }),
          overflowX: 'hidden',
          backgroundColor: '#0a0a0a',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Treemap canvas — single positioned container for all sectors */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: layoutHeight > 0 ? `${layoutHeight}px` : '100%',
            // Clear the fixed BottomNavigation so the last row isn't hidden behind it.
            paddingBottom: 'calc(var(--tabbar-real-h, var(--tabbar-h, 72px)) + env(safe-area-inset-bottom, 0px) + 8px)',
          }}
        >
          {sectors.length > 0 && containerSize.width > 0 ? (
            sectors.map((sector) => (
              <MobileHeatmapSector
                key={sector.name}
                sector={sector}
                metric={metric}
                getColor={getColor}
                onTileSelect={handleTileSelect}
                onTileClick={onTileClick}
              />
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
      <AnimatePresence>
        {selectedCompany && (
          <MobileHeatmapSheet
            company={selectedCompany}
            onClose={closeSheet}
            onToggleFavorite={onToggleFavorite}
            isFavorite={isFavorite}
            onNavigateToAnalysis={onTileClick}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
