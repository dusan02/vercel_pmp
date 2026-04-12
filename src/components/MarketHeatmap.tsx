'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';

import { HeatmapTooltip } from './HeatmapTooltip';
import type { CompanyNode, HeatmapMetric, SectorLabelVariant, HierarchyData, TreemapLeaf, TreemapNode } from '@/lib/heatmap/types';
import { buildHeatmapHierarchy } from '@/lib/utils/heatmapLayout';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import { computeTreemapLayout } from '@/lib/heatmap/computeTreemapLayout';
import { usePanZoom } from '@/hooks/usePanZoom';
import styles from '@/styles/heatmap.module.css';
import { HeatmapLegend } from './HeatmapLegend';
import { HeatmapCanvasView } from './heatmap/HeatmapCanvasView';
import { HeatmapDomView } from './heatmap/HeatmapDomView';

// Re-export types for backwards compatibility
export type { CompanyNode, HeatmapMetric, SectorLabelVariant, HierarchyData, TreemapLeaf, TreemapNode } from '@/lib/heatmap/types';

export type MarketHeatmapProps = {
  data: CompanyNode[];
  onTileClick?: (company: CompanyNode) => void;
  width: number;
  height: number;
  timeframe?: 'day' | 'week' | 'month';
  onTimeframeChange?: (timeframe: 'day' | 'week' | 'month') => void;
  metric?: HeatmapMetric;
  /** Optional: decouple treemap sizing from coloring/labels. */
  layoutMetric?: HeatmapMetric;
  sectorLabelVariant?: SectorLabelVariant;
  /** Controlled zoomed sector (optional) */
  zoomedSector?: string | null;
  onZoomChange?: (sector: string | null) => void;
};

export { HeatmapLegend };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MarketHeatmap: React.FC<MarketHeatmapProps> = ({
  data,
  width,
  height,
  onTileClick,
  timeframe = 'day',
  metric = 'percent',
  layoutMetric,
  sectorLabelVariant = 'compact',
  zoomedSector: controlledZoomedSector,
  onZoomChange,
}) => {
  // -- Zoom state (controlled or internal) ----------------------------------
  const [internalZoomedSector, setInternalZoomedSector] = useState<string | null>(null);
  const zoomedSectorRef = useRef<string | null>(null);
  const isControlled = controlledZoomedSector !== undefined;
  const zoomedSector = isControlled ? controlledZoomedSector : internalZoomedSector;

  useEffect(() => { zoomedSectorRef.current = zoomedSector; }, [zoomedSector]);

  const handleZoomChange = useCallback((sector: string | null) => {
    if (zoomedSectorRef.current === sector) return;
    if (!isControlled) setInternalZoomedSector(sector);
    onZoomChange?.(sector);
  }, [isControlled, onZoomChange]);

  // -- Interaction state ----------------------------------------------------
  const [hoveredNode, setHoveredNode] = useState<CompanyNode | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [mobileTappedNode, setMobileTappedNode] = useState<CompanyNode | null>(null);
  const mobileTapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMobileTap = useCallback((company: CompanyNode, x: number, y: number) => {
    clearTimeout(mobileTapTimerRef.current);
    setMobileTappedNode(company);
    setMousePosition({ x, y });
    mobileTapTimerRef.current = setTimeout(() => setMobileTappedNode(null), 2000);
  }, []);

  // -- Mobile detection (debounced) -----------------------------------------
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsMobile((prev) => {
          const next = window.innerWidth <= 768;
          return prev !== next ? next : prev;
        });
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(timer); window.removeEventListener('resize', onResize); };
  }, []);

  // -- Data → hierarchy -----------------------------------------------------
  const hierarchyRoot = useMemo(
    () => buildHeatmapHierarchy(data, layoutMetric ?? metric),
    [data, layoutMetric, metric],
  );

  // -- Treemap layout (delegated to pure function) --------------------------
  const layout = useMemo(
    () => computeTreemapLayout(
      hierarchyRoot,
      Math.floor(width / 10) * 10,
      Math.floor(height / 10) * 10,
      isMobile,
      sectorLabelVariant,
    ),
    [hierarchyRoot, Math.floor(width / 10) * 10, Math.floor(height / 10) * 10, isMobile, sectorLabelVariant],
  );

  const treemapLayout = layout?.root ?? null;
  const treemapBounds = layout?.bounds ?? null;
  const scale = layout?.scale ?? 1;
  const offset = layout?.offset ?? { x: 0, y: 0 };
  const contentHeight = layout?.contentHeight ?? height;

  // -- Derived node lists ---------------------------------------------------
  const allNodes = useMemo(() => treemapLayout?.descendants() ?? [], [treemapLayout]);

  const allLeaves = useMemo(() => {
    if (!treemapLayout) return [];
    return (treemapLayout.leaves() as TreemapLeaf[]).filter(
      (leaf) => leaf.data.meta?.type === 'company' && !!leaf.data.meta.companyData,
    );
  }, [treemapLayout]);

  // -- Sector zoom filtering ------------------------------------------------
  const belongsToSector = useCallback((node: any, sectorName: string): boolean => {
    let current = node;
    while (current) {
      if (current.depth === 1 && current.data.name === sectorName) return true;
      current = current.parent;
    }
    return false;
  }, []);

  const filteredNodes = useMemo(
    () => zoomedSector ? allNodes.filter((n) => belongsToSector(n, zoomedSector)) : allNodes,
    [allNodes, zoomedSector, belongsToSector],
  );

  const filteredLeaves = useMemo(
    () => zoomedSector ? allLeaves.filter((l) => belongsToSector(l, zoomedSector)) : allLeaves,
    [allLeaves, zoomedSector, belongsToSector],
  );

  // -- Color scale ----------------------------------------------------------
  const colorScale = useMemo(
    () => createHeatmapColorScale(timeframe, metric === 'mcap' ? 'mcap' : 'percent'),
    [timeframe, metric],
  );

  // -- Render mode (DOM on mobile, Canvas on desktop) -----------------------
  const [renderMode] = useState<'dom' | 'canvas'>(() =>
    typeof window !== 'undefined' && window.innerWidth <= 768 ? 'dom' : 'canvas',
  );

  // -- Interaction handlers -------------------------------------------------
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleSectorClick = useCallback((sectorName: string) => {
    handleZoomChange(zoomedSector === sectorName ? null : sectorName);
  }, [zoomedSector, handleZoomChange]);

  const handleCanvasHover = useCallback((company: CompanyNode | null, x: number, y: number) => {
    setHoveredNode(company);
    if (company) setMousePosition({ x, y });
  }, []);

  // -- Pan & Zoom -----------------------------------------------------------
  const panZoom = usePanZoom({
    minZoom: 1,
    maxZoom: 5,
    initialZoom: 1,
    mobileOnly: !zoomedSector,
    enableDoubleTapReset: true,
  });

  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const gestureBindPropsRef = useRef<Record<string, any>>({});
  const panZoomRef = useRef(panZoom);
  useEffect(() => { panZoomRef.current = panZoom; }, [panZoom]);

  const prevZoomedSectorRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevZoomedSectorRef.current !== zoomedSector) {
      if (zoomedSector) panZoomRef.current.reset();
      prevZoomedSectorRef.current = zoomedSector;
    }
  }, [zoomedSector]);

  useEffect(() => {
    const el = contentWrapperRef.current;
    if (el && zoomedSector) {
      try {
        const props = panZoomRef.current.bind(el);
        gestureBindPropsRef.current = Object.fromEntries(
          Object.entries(props || {}).filter(([_, v]) => typeof v === 'function'),
        );
      } catch {
        gestureBindPropsRef.current = {};
      }
    } else {
      gestureBindPropsRef.current = {};
    }
  }, [zoomedSector]);

  const contentWrapperCallbackRef = useCallback((el: HTMLDivElement | null) => {
    contentWrapperRef.current = el;
  }, []);

  const handleDoubleTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (e.type === 'touchend') {
      const now = Date.now();
      const lastTap = (handleDoubleTap as any)._lastTap || 0;
      if (now - lastTap < 300) { panZoomRef.current.reset(); e.preventDefault(); }
      (handleDoubleTap as any)._lastTap = now;
    } else if (e.type === 'dblclick') {
      panZoomRef.current.reset();
    }
  }, []);

  const showPanZoomControls = zoomedSector && (panZoom.zoom > 1 || panZoom.panX !== 0 || panZoom.panY !== 0);

  // -- Render ---------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className={styles.heatmapContainer}
      style={{
        overflowX: 'hidden',
        overflowY: isMobile ? 'auto' : 'hidden',
        height: isMobile ? contentHeight : '100%',
        minHeight: isMobile ? contentHeight : undefined,
        position: 'relative',
        WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
      }}
      onMouseMove={renderMode === 'dom' ? handleMouseMove : undefined}
    >
      {(width === 0 || height === 0) && (
        <div className={styles.heatmapLoading}>Loading layout...</div>
      )}

      {/* Zoom back button */}
      {zoomedSector && (
        <button
          onClick={() => handleZoomChange(null)}
          className={styles.heatmapZoomButton}
          style={{
            position: 'fixed',
            top: isMobile ? '68px' : '12px',
            left: '12px',
            zIndex: 200,
            minHeight: '44px',
            minWidth: '44px',
            padding: '10px 18px',
            touchAction: 'manipulation',
          }}
        >
          ← Back to All Sectors
        </button>
      )}

      {/* Pan & Zoom Controls */}
      {showPanZoomControls && (
        <div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2"
          style={{ pointerEvents: 'auto' }}
        >
          <span className="text-white text-xs font-medium">{panZoom.zoom.toFixed(1)}x</span>
          <button
            onClick={() => panZoomRef.current.reset()}
            className="text-white hover:text-gray-300 transition-colors text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
            title="Reset zoom (double-tap)"
          >
            ↻ Reset
          </button>
        </div>
      )}

      {/* Content wrapper (pan & zoom when sector-zoomed) */}
      <div
        ref={contentWrapperCallbackRef}
        {...(zoomedSector
          ? Object.fromEntries(Object.entries(gestureBindPropsRef.current).filter(([_, v]) => typeof v === 'function'))
          : {})}
        style={{
          transform: 'none',
          transformOrigin: '0 0',
          willChange: 'auto',
          touchAction: zoomedSector ? 'none' : 'auto',
        }}
        onDoubleClick={zoomedSector ? handleDoubleTap : undefined}
        onTouchEnd={zoomedSector ? handleDoubleTap : undefined}
      >
        {renderMode === 'canvas' ? (
          <HeatmapCanvasView
            filteredNodes={filteredNodes}
            filteredLeaves={filteredLeaves}
            width={width}
            height={height}
            scale={scale}
            offset={offset}
            panZoom={panZoom}
            treemapBoundsNotNull={treemapBounds !== null}
            sectorLabelVariant={sectorLabelVariant}
            isMobile={isMobile}
            metric={metric}
            timeframe={timeframe}
            onTileClick={onTileClick}
            onHover={handleCanvasHover}
          />
        ) : (
          <HeatmapDomView
            filteredLeaves={filteredLeaves}
            filteredNodes={filteredNodes}
            scale={scale}
            offset={offset}
            colorScale={colorScale}
            metric={metric}
            hoveredSector={hoveredSector}
            treemapBoundsNotNull={treemapBounds !== null}
            sectorLabelVariant={sectorLabelVariant}
            isMobile={isMobile}
            zoomedSector={zoomedSector}
            onTileClick={onTileClick}
            onTileHover={setHoveredNode}
            onMobileTap={handleMobileTap}
            onSectorMouseEnter={setHoveredSector}
            onSectorMouseLeave={() => setHoveredSector(null)}
            onSectorClick={handleSectorClick}
          />
        )}
      </div>

      {/* Tooltip - hover on desktop, tap (2s) on mobile */}
      {(isMobile ? mobileTappedNode : hoveredNode) && (
        <HeatmapTooltip
          company={(isMobile ? mobileTappedNode : hoveredNode)!}
          position={mousePosition}
          timeframe={timeframe}
          metric={metric}
        />
      )}
    </div>
  );
};

// Re-export for backwards compatibility
export { useElementResize } from '@/hooks/useElementResize';
