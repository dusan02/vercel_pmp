'use client';

import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import { getTileColor } from '@/lib/heatmap/metricValue';
import { computeMobileTreemapSectors, prepareMobileTreemapData, SECTOR_CHROME_PX } from '@/lib/heatmap/mobileTreemap';
import { MobileHeatmapHeader } from './mobile/MobileHeatmapHeader';
import { MobileHeatmapSheet } from './mobile/MobileHeatmapSheet';
import { MobileHeatmapSector } from './mobile/MobileHeatmapSector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MobileTreemapNewProps {
  data: CompanyNode[];
  timeframe?: 'day' | 'week' | 'month';
  metric?: HeatmapMetric;
  layoutMetric?: 'percent' | 'mcap';
  onMetricChange?: (metric: HeatmapMetric) => void;
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
  // -- Container measurement: width-only continuous + one-time height --------
  // Width-only tracking prevents layout thrashing: re-layout changes content
  // height → if ResizeObserver tracked height → re-layout → infinite loop.
  // Height is measured once (after flex settles) and from window.innerHeight.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const measureWidth = (el: HTMLElement) => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setContainerWidth(w);
    };

    measureWidth(containerRef.current);

    // One-time delayed height measure after flex layout settles
    const delayedMeasure = setTimeout(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const h = Math.round(rect.height);
      if (h > 0) {
        setContainerHeight(h);
      } else {
        // Fallback: use window.innerHeight minus approximate header
        setContainerHeight(Math.max(400, window.innerHeight - 120));
      }
    }, 150);

    // Track width only — height must stay frozen to prevent feedback loop
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width <= 0) continue;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          setContainerWidth(Math.round(width));
        });
      }
    });

    observer.observe(containerRef.current);

    // Also update height on window resize (orientation change)
    const onWindowResize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const h = Math.round(rect.height);
      if (h > 0) setContainerHeight(h);
    };
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', onWindowResize);

    return () => {
      clearTimeout(delayedMeasure);
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('orientationchange', onWindowResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const containerSize = { width: containerWidth, height: height ?? containerHeight };

  // -- Detail sheet / 1-tap navigation indicator ----------------------------
  const [selectedCompany, setSelectedCompany] = useState<CompanyNode | null>(null);
  const [navigatingSymbol, setNavigatingSymbol] = useState<string | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastNavRef = useRef<{ symbol: string; at: number } | null>(null);
  const closeSheet = useCallback(() => setSelectedCompany(null), []);

  // Auto-close sheet & clear navigation badge when the view changes (user switched tabs)
  useEffect(() => {
    closeSheet();
    setNavigatingSymbol(null);
    lastNavRef.current = null;
  }, [activeView, closeSheet]);

  useEffect(() => () => clearTimeout(navTimerRef.current), []);

  const handleTileSelect = useCallback((company: CompanyNode) => {
    setSelectedCompany(company);
  }, []);

  const handleDirectTileClick = useCallback((company: CompanyNode) => {
    if (!onTileClick) return;
    const sym = company.symbol.toUpperCase();
    const now = Date.now();
    if (lastNavRef.current && lastNavRef.current.symbol === sym && now - lastNavRef.current.at < 4000) {
      return;
    }
    lastNavRef.current = { symbol: sym, at: now };
    setNavigatingSymbol(sym);
    clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => setNavigatingSymbol(null), 6000);
    onTileClick(company);
  }, [onTileClick]);

  // -- Data prep & layout -----------------------------------------------------
  const sortedData = useMemo(() => prepareMobileTreemapData(data), [data]);

  const colorScale = useMemo(
    () =>
      createHeatmapColorScale(
        timeframe,
        metric,
        metric === 'mcap' ? sortedData.map((d) => d.marketCapDiff ?? 0) : undefined,
      ),
    [timeframe, metric, sortedData],
  );

  const getColor = useCallback(
    (company: CompanyNode): string => {
      if (!company) return '#1a1a1a';
      return getTileColor(company, metric, colorScale);
    },
    [metric, colorScale],
  );

  const treemapResult = useMemo(() => {
    if (containerSize.width <= 0 || containerSize.height <= 0) return null;
    return computeMobileTreemapSectors(sortedData, containerSize, layoutMetric || metric, {
      sectorChromeHeightPx: SECTOR_CHROME_PX,
    });
  }, [sortedData, metric, layoutMetric, containerSize]);

  const sectors = treemapResult?.sectors ?? [];
  const layoutHeight = treemapResult?.height ?? 0;

  // -- Render -----------------------------------------------------------------
  return (
    <div
      className="flex flex-col w-full overflow-hidden"
      style={{ position: 'relative', height: '100%', minHeight: '100%', zIndex: 1, background: '#0a0a0a' }}
    >
      {height === undefined && (
        <MobileHeatmapHeader metric={metric} onMetricChange={onMetricChange} />
      )}

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
            // Clear the fixed BottomNavigation on full-screen heatmap only.
            paddingBottom: height !== undefined ? 0 : 'calc(var(--tabbar-real-h, var(--tabbar-h, 72px)) + env(safe-area-inset-bottom, 0px) + 8px)',
          }}
        >
          {sectors.length > 0 && containerWidth > 0 ? (
            sectors.map((sector) => (
              <MobileHeatmapSector
                key={sector.name}
                sector={sector}
                metric={metric}
                getColor={getColor}
                onTileSelect={handleTileSelect}
                onTileClick={onTileClick ? handleDirectTileClick : undefined}
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

      {/* Instant 1-tap navigation feedback pill */}
      {navigatingSymbol && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-[10001] flex items-center gap-2 rounded-full bg-blue-600/95 px-4 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm pointer-events-none"
        >
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <span>Opening {navigatingSymbol}…</span>
        </div>
      )}

      {/* Detail bottom sheet (when no direct navigation handler is wired) */}
      <AnimatePresence>
        {selectedCompany && (
          <MobileHeatmapSheet
            company={selectedCompany}
            metric={metric}
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
