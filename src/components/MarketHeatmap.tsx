'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  hierarchy,
  treemap,
  treemapSquarify,
} from 'd3-hierarchy';
import { scaleLinear } from 'd3-scale';

import { HeatmapTooltip } from './HeatmapTooltip';
import type { CompanyNode, HeatmapMetric, SectorLabelVariant, HierarchyData, TreemapLeaf, TreemapNode } from '@/lib/heatmap/types';
import { buildHeatmapHierarchy } from '@/lib/utils/heatmapLayout';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import { LAYOUT_CONFIG } from '@/lib/utils/heatmapConfig';
import { usePanZoom } from '@/hooks/usePanZoom';
import styles from '@/styles/heatmap.module.css';
import { HeatmapLegend } from './HeatmapLegend';
import { HeatmapCanvasView } from './heatmap/HeatmapCanvasView';
import { HeatmapDomView } from './heatmap/HeatmapDomView';

// --- CONSTANTS ---
// Constants moved to @/lib/utils/heatmapConfig.ts

// --- HELPER FUNCTIONS ---

// Sector label helpers moved to `@/lib/heatmap/sectorLabels`.

// --- TYPES ---
// Keep types in `src/lib` so hooks/utils don't depend on this large component file.
export type { CompanyNode, HeatmapMetric, SectorLabelVariant, HierarchyData, TreemapLeaf, TreemapNode } from '@/lib/heatmap/types';

export type MarketHeatmapProps = {
  data: CompanyNode[];
  onTileClick?: (company: CompanyNode) => void;
  /** Šírka komponentu v pixeloch. */
  width: number;
  /** Výška komponentu v pixeloch. */
  height: number;
  /** Aktuálny timeframe pre zobrazenie dát */
  timeframe?: 'day' | 'week' | 'month';
  /** Callback pre zmenu timeframe */
  onTimeframeChange?: (timeframe: 'day' | 'week' | 'month') => void;
  /** Metrika pre výpočet veľkosti dlaždice */
  metric?: HeatmapMetric;
  /**
   * Optional: decouple treemap sizing from coloring/labels.
   * - `metric` continues to drive color scale + label formatting.
   * - `layoutMetric` drives which CompanyNode field is used to compute tile area (via buildHeatmapHierarchy).
   */
  layoutMetric?: HeatmapMetric;
  /** Variant sector labels: 'compact' for homepage, 'full' for heatmap page */
  sectorLabelVariant?: SectorLabelVariant;
  /** Controlled zoomed sector (optional) */
  zoomedSector?: string | null;
  /** Callback for zoom change */
  onZoomChange?: (sector: string | null) => void;
};

/**
 * Interná štruktúra pre budovanie hierarchie, ktorú D3 očakáva.
 */
// --- POMOCNÉ FUNKCIE ---

// buildHierarchy moved to @/lib/utils/heatmapLayout.ts
// Imported as buildHeatmapHierarchy

// createColorScale moved to @/lib/utils/heatmapColors.ts
// Imported as createHeatmapColorScale

// Formatting functions moved to @/lib/utils/heatmapFormat.ts
// Imported as: formatPercent, formatMarketCapDiff, formatPrice, formatMarketCap

// --- HELPER FUNCTIONS ---
// Helper functions (calculateFontSizeFromArea, getTileLabelConfig) moved to @/lib/utils/heatmapLabelUtils.ts

// --- POD-KOMPONENTY ---

/**
 * Komponent pre Tooltip.
 */


export { HeatmapLegend };

// --- HLAVNÝ KOMPONENT ---

/**
 * Interaktívna Heatmapa akciového trhu.
 */
export const MarketHeatmap: React.FC<MarketHeatmapProps> = ({
  data,
  width,
  height,
  onTileClick,
  timeframe = 'day',
  onTimeframeChange,
  metric = 'percent',
  layoutMetric,
  sectorLabelVariant = 'compact',
  zoomedSector: controlledZoomedSector,
  onZoomChange,
}: MarketHeatmapProps) => {
  const [internalZoomedSector, setInternalZoomedSector] = useState<string | null>(null);
  const zoomedSectorRef = useRef<string | null>(null); // Track zoomed sector to prevent accidental changes

  // Use controlled state if provided, otherwise internal
  const isControlled = controlledZoomedSector !== undefined;
  const zoomedSector = isControlled ? controlledZoomedSector : internalZoomedSector;

  // Update ref when zoomedSector changes
  useEffect(() => {
    zoomedSectorRef.current = zoomedSector;
  }, [zoomedSector]);

  const handleZoomChange = useCallback((sector: string | null) => {
    // Prevent accidental zoom changes - only allow explicit user actions
    // Check if this is actually a change (not a redundant update)
    if (zoomedSectorRef.current === sector) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('🔍 Zoom change ignored (no change):', { sector, current: zoomedSectorRef.current });
      }
      return; // No change needed
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 Zoom change requested:', { sector, current: zoomedSectorRef.current });
    }
    if (!isControlled) {
      setInternalZoomedSector(sector);
    }
    if (onZoomChange) {
      onZoomChange(sector);
    }
  }, [isControlled, onZoomChange]);

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

  // 1. Transformácia dát
  const hierarchyRoot = useMemo(
    () => buildHeatmapHierarchy(data, layoutMetric ?? metric),
    [data, layoutMetric, metric]
  );

  // Detect mobile for vertical layout
  // CRITICAL: Initialize with proper value and STABILIZE during initial load
  // Don't allow changes during initial render phase to prevent multiple layout recalculations
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });

  // Track if initial load is complete - prevent isMobile changes during initial render
  const isInitialLoadCompleteRef = useRef(false);

  useEffect(() => {
    // Mark initial load as complete after first render
    // This prevents isMobile from changing during initial layout calculation
    const timer = setTimeout(() => {
      isInitialLoadCompleteRef.current = true;
    }, 100); // Small delay to ensure initial render is complete

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let resizeTimer: NodeJS.Timeout;
    const checkMobile = () => {
      // Debounce resize events to prevent excessive re-renders
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const mobile = window.innerWidth <= 768;
        // Only update if actually changed AND initial load is complete
        // This prevents layout recalculation during initial render
        if (!isInitialLoadCompleteRef.current) {
          // During initial load, only update if there's a significant mismatch
          // (e.g., SSR hydration issue)
          return;
        }

        setIsMobile(prev => {
          if (prev !== mobile) {
            if (process.env.NODE_ENV !== 'production') {
              console.log('📱 Mobile detection changed:', { width: window.innerWidth, isMobile: mobile });
            }
            return mobile;
          }
          return prev;
        });
      }, 150); // Debounce resize events
    };

    window.addEventListener('resize', checkMobile);
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', checkMobile);
    };
  }, []); // Remove isMobile from dependencies to prevent re-initialization

  // Helper function to sum values in a node (for mobile vertical layout)
  const sumValues = useCallback((node: HierarchyData): number => {
    if (typeof node.value === 'number') return node.value;
    if (!node.children) return 0;
    return (node.children as HierarchyData[]).reduce((acc: number, c: HierarchyData) => acc + sumValues(c), 0);
  }, []);

  // 2. Výpočet D3 Treemap layoutu
  // OPTIMIZATION: Stabilize layout calculation during initial load
  // Round width/height to nearest 10px to prevent recalculation on tiny resizes
  // Mobile: Vertical layout (sectors stacked vertically, no gaps)
  // Desktop: Horizontal layout (original behavior)
  const treemapLayout = useMemo(() => {
    if (width === 0 || height === 0) return null;

    // During initial load, if we don't have valid dimensions yet, return null
    // This prevents layout calculation with invalid dimensions
    if (!isInitialLoadCompleteRef.current && (width < 100 || height < 100)) {
      return null;
    }

    // Vytvoríme D3 hierarchiu
    const d3Root = hierarchy(hierarchyRoot)
      .sum((d) => d.value || 0) // Sčítame 'value' (marketCap)
      .sort((a, b) => (b.value || 0) - (a.value || 0)); // Zoradíme

    // Mobile: Vertical layout - process each sector separately and stack vertically
    // Desktop: Horizontal layout - original behavior
    const SECTOR_GAP = isMobile ? 0 : LAYOUT_CONFIG.SECTOR_GAP; // No gap on mobile

    // CRITICAL FIX: Only use vertical stacked layout if there is MORE than one sector.
    // This allows single-sector treemaps (like the Portfolio heatmap) to use the full width and height
    // provided by the parent without being squashed/leaving a black bar.
    if (isMobile && d3Root.children && d3Root.children.length > 1) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('📱 Mobile vertical layout:', {
          sectors: d3Root.children.length,
          width,
          height,
          totalValue: d3Root.value
        });
      }

      // Mobile: Vertical layout - process each sector separately and stack vertically
      let currentY = 0;
      const totalValue = d3Root.value || 1;
      // Use more precise height calculation - base on actual sector values, not arbitrary multipliers
      // Calculate total height based on proportional sector sizes, with reasonable minimums
      const baseSectorHeight = height * 0.8; // Base height per sector (80% of viewport)
      const estimatedTotalHeight = baseSectorHeight * d3Root.children.length; // No extra padding multiplier

      d3Root.children.forEach((sectorNode: any) => {
        if (!sectorNode.data.children || sectorNode.data.children.length === 0) return;

        const sectorValue = sumValues(sectorNode.data);
        if (sectorValue <= 0) return;

        // Mobile: reserve space for the sector label so it doesn't overlap the top row of tiles.
        // Desktop reserves this via D3 paddingTop in the main treemap generator; mobile vertical layout
        // uses per-sector treemaps so we must do it here too.
        const baseSectorLabelConfig = sectorLabelVariant === 'full'
          ? LAYOUT_CONFIG.SECTOR_LABEL_FULL
          : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT;
        // Slightly smaller header on mobile to reduce visual intrusion while keeping readability.
        const reservedSectorLabelHeight = sectorLabelVariant === 'full' ? 18 : baseSectorLabelConfig.HEIGHT;

        // Calculate proportional height for this sector
        const sectorHeight = (sectorValue / totalValue) * estimatedTotalHeight;
        // Minimum height should be reasonable - 60% of viewport to prevent too much empty space
        const minSectorHeight = height * 0.6; // Minimum height = 60% of viewport

        // Use Math.round to ensure integer pixel values and prevent subpixel overlaps
        const finalSectorHeight = Math.round(Math.max(sectorHeight, minSectorHeight));

        // Create separate treemap for this sector
        const sectorData: HierarchyData = {
          name: sectorNode.data.name,
          children: sectorNode.data.children,
          meta: sectorNode.data.meta
        };

        const sectorHierarchy = hierarchy(sectorData)
          .sum((d) => d.value || 0)
          .sort((a, b) => (b.value || 0) - (a.value || 0));

        const sectorTreemap = treemap<HierarchyData>()
          .size([width, finalSectorHeight])
          .padding(function (node) {
            if (node.data.meta?.type === 'industry') {
              return 1;
            }
            return 0;
          })
          .paddingTop(function (node) {
            if (node.depth === 0) {
              // Koreň tohto pod-treemapu je priamo sektor
              return reservedSectorLabelHeight;
            }
            if (node.data.meta?.type === 'industry') {
              return 14;
            }
            return 0;
          })
          .paddingLeft(0)
          .paddingRight(0)
          .paddingBottom(0)
          .tile(treemapSquarify);

        sectorTreemap(sectorHierarchy);

        // Update sector node bounds
        sectorNode.x0 = 0;
        sectorNode.x1 = width;
        sectorNode.y0 = currentY;
        sectorNode.y1 = currentY + finalSectorHeight;

        // Map sectorHierarchy leaves to sectorNode.children
        const sectorLeaves = sectorHierarchy.leaves() as any[];
        const sectorChildren = sectorNode.children || [];

        sectorLeaves.forEach((hLeaf: any, idx: number) => {
          if (idx < sectorChildren.length) {
            const companyNode = sectorChildren[idx] as any;
            if (companyNode && hLeaf.x0 !== undefined) {
              companyNode.x0 = hLeaf.x0;
              companyNode.x1 = hLeaf.x1;
              companyNode.y0 = hLeaf.y0 + currentY;
              companyNode.y1 = hLeaf.y1 + currentY;
            }
          }
        });

        currentY += finalSectorHeight;
      });

      // Update root bounds
      (d3Root as any).x0 = 0;
      (d3Root as any).x1 = width;
      (d3Root as any).y0 = 0;
      (d3Root as any).y1 = currentY;

      if (process.env.NODE_ENV !== 'production') {
        const rootBounds = d3Root as any;
        console.log('📱 Mobile layout complete:', {
          totalHeight: currentY,
          sectors: d3Root.children.length,
          viewportHeight: height,
          rootWidth: rootBounds.x1 - rootBounds.x0,
          rootHeight: rootBounds.y1 - rootBounds.y0,
        });
      }

      return d3Root;
    }

    // Desktop: Original behavior
    // Add padding-top for sectors to make space for labels
    const treemapGenerator = treemap<HierarchyData>()
      .size([width, height])
      .padding(function (node) {
        if (node.data.meta?.type === 'sector') {
          // Sektor → medzera + priestor pre label
          return SECTOR_GAP;
        }
        if (node.data.meta?.type === 'industry') {
          // Industry box → jemná oddeľovacia hranica
          return 1;
        }
        // Firmy → 0px (žiadne medzery)
        return 0;
      })
      .paddingTop(function (node) {
        if (node.data.meta?.type === 'sector') {
          // Sektor → pridaj priestor pre label (podľa variantu)
          const labelConfig = sectorLabelVariant === 'full'
            ? LAYOUT_CONFIG.SECTOR_LABEL_FULL
            : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT;
          return labelConfig.HEIGHT;
        }
        if (node.data.meta?.type === 'industry') {
          // Pridaj 14px pre industry nadpis nad firmami v rovnakom odvetví
          return 14;
        }
        return 0;
      })
      .paddingLeft(0) // Žiadna rezerva vľavo - roztiahnuť doľava
      .paddingRight(0) // Žiadna rezerva vpravo - roztiahnuť doprava
      .paddingBottom(0) // Žiadna rezerva dole - roztiahnuť dole
      .tile(treemapSquarify); // Algoritmus pre "štvorcovejší" layout

    // Spustíme výpočet layoutu
    treemapGenerator(d3Root);
    return d3Root;
  }, [
    hierarchyRoot,
    Math.floor(width / 10) * 10,  // Round to nearest 10px to prevent recalc on tiny resizes
    Math.floor(height / 10) * 10, // This improves performance during window resize
    isMobile,
    sumValues
  ]);


  // Farebná škála pre aktuálny timeframe
  const colorScale = useMemo(() => createHeatmapColorScale(timeframe, metric === 'mcap' ? 'mcap' : 'percent'), [timeframe, metric]);

  // Handler pre pohyb myši (pre pozíciu tooltipu - globálne súradnice pre fixed tooltip)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setMousePosition({
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  // Handler pre kliknutie na sektor (zoom)
  const handleSectorClick = useCallback((sectorName: string) => {
    const newSector = zoomedSector === sectorName ? null : sectorName;
    handleZoomChange(newSector);
  }, [zoomedSector, handleZoomChange]);

  // Helper funkcia pre kontrolu, či uzol patrí do zoomovaného sektora
  const belongsToSector = useCallback((node: any, sectorName: string): boolean => {
    if (node.depth === 1) {
      return node.data.name === sectorName;
    }
    if (node.depth > 1) {
      let parent = node.parent;
      while (parent) {
        if (parent.depth === 1 && parent.data.name === sectorName) {
          return true;
        }
        parent = parent.parent;
      }
    }
    return false;
  }, []);

  // Získame všetky uzly (sektory, industry) a listy (firmy) - memoizované
  const allNodes = useMemo(() => {
    return treemapLayout ? treemapLayout.descendants() : [];
  }, [treemapLayout]);

  // Tile virtualization - filter out tiny tiles that are barely visible
  // This significantly reduces DOM nodes and improves rendering performance
  const MIN_VISIBLE_AREA = 0; // px² - render ALL tiles to prevent black holes

  const allLeaves = useMemo(() => {
    const leaves = treemapLayout ? (treemapLayout.leaves() as TreemapLeaf[]) : [];

    // Filter out tiny tiles that are barely visible
    // These tiles are too small to show text anyway and just add rendering overhead
    const visibleLeaves = leaves.filter(leaf => {
      const isCompany = leaf.data.meta?.type === 'company' && !!leaf.data.meta.companyData;
      if (!isCompany) return false;
      const area = (leaf.x1 - leaf.x0) * (leaf.y1 - leaf.y0);
      return area >= MIN_VISIBLE_AREA;
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`📊 MarketHeatmap: Rendering ${visibleLeaves.length}/${leaves.length} companies (filtered ${leaves.length - visibleLeaves.length} tiny tiles < ${MIN_VISIBLE_AREA}px²)`);
    }
    return visibleLeaves;
  }, [treemapLayout, data.length]);


  // Filtrovanie pre zoom na sektor
  const filteredNodes = useMemo(() => {
    return zoomedSector
      ? allNodes.filter((node) => belongsToSector(node, zoomedSector))
      : allNodes;
  }, [allNodes, zoomedSector, belongsToSector]);

  const filteredLeaves = useMemo(() => {
    return zoomedSector
      ? allLeaves.filter((leaf) => belongsToSector(leaf, zoomedSector))
      : allLeaves;
  }, [allLeaves, zoomedSector, belongsToSector]);

  // Vypočítame rozsah treemapy (spoločný výpočet pre scale a offset)
  const treemapBounds = useMemo(() => {
    if (!treemapLayout || width === 0 || height === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    treemapLayout.descendants().forEach((node: any) => {
      if (node.x0 !== undefined) {
        minX = Math.min(minX, node.x0);
        minY = Math.min(minY, node.y0);
        maxX = Math.max(maxX, node.x1);
        maxY = Math.max(maxY, node.y1);
      }
    });

    const treemapWidth = maxX - minX;
    const treemapHeight = maxY - minY;

    if (treemapWidth === 0 || treemapHeight === 0) return null;

    return { minX, minY, maxX, maxY, treemapWidth, treemapHeight };
  }, [treemapLayout, width, height]);

  // Vypočítame skálovanie pre zobrazenie celej mapy
  const scale = useMemo(() => {
    if (!treemapBounds) return 1;

    const hasMultipleSectors = (hierarchyRoot.children?.length ?? 0) > 1;

    if (isMobile && hasMultipleSectors) {
      // Mobile with multiple sectors: Scale only by width to allow vertical scrolling
      // Sectors will stack vertically, width fills screen
      return width / treemapBounds.treemapWidth;
    }

    // Desktop or mobile single-sector: Original behavior - fit to both dimensions
    const scaleX = width / treemapBounds.treemapWidth;
    const scaleY = height / treemapBounds.treemapHeight;
    return Math.min(scaleX, scaleY); // Použijeme menšiu škálu, aby sa mapa zmestila
  }, [treemapBounds, width, height, isMobile, hierarchyRoot.children?.length]);

  // Offset pre roztiahnutie na celú plochu (bez centrovania)
  const offset = useMemo(() => {
    if (!treemapBounds || scale === 0) return { x: 0, y: 0 };

    const hasMultipleSectors = (hierarchyRoot.children?.length ?? 0) > 1;

    if (isMobile && hasMultipleSectors) {
      // Mobile with multiple sectors: Align to left, start from top (y: 0)
      // Allow vertical scrolling - no vertical scaling/centering
      return {
        x: -treemapBounds.minX * scale,
        y: -treemapBounds.minY * scale, // Start from top
      };
    }

    // Desktop or mobile single-sector: Original behavior
    return {
      x: -treemapBounds.minX * scale,
      y: -treemapBounds.minY * scale,
    };
  }, [treemapBounds, scale, isMobile, hierarchyRoot.children?.length]);

  // On mobile, use DOM mode; on desktop, Canvas for performance
  const [renderMode] = useState<'dom' | 'canvas'>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768 ? 'dom' : 'canvas';
    }
    return 'canvas';
  });

  // Handler pre hover z Canvasu
  const handleCanvasHover = useCallback((company: CompanyNode | null, x: number, y: number) => {
    setHoveredNode(company);
    if (company) {
      setMousePosition({ x, y });
    }
  }, []);

  // Calculate actual content height for mobile (for proper vertical scrolling)
  const contentHeight = useMemo(() => {
    if (!isMobile || !treemapBounds) return height;
    // Mobile: Use actual treemap height (sectors stacked vertically)
    // Use precise height calculation - no arbitrary multipliers
    const calculatedHeight = treemapBounds.treemapHeight * scale;
    // Add small padding (50px) to ensure last sector is fully visible if we have multiple sectors
    // If we have only 1 sector and aren't using vertical layout, just use the viewport height.
    const hasMultipleSectors = (hierarchyRoot.children?.length ?? 0) > 1;
    const finalHeight = hasMultipleSectors ? (calculatedHeight + 50) : height;
    if (process.env.NODE_ENV !== 'production') {
      console.log('📱 Content height calculation:', {
        treemapHeight: treemapBounds.treemapHeight,
        scale,
        viewportHeight: height,
        calculatedHeight,
        finalHeight,
      });
    }
    return finalHeight;
  }, [isMobile, treemapBounds, scale, height]);

  // Pan & Zoom hook - only enable when zoomed to sector
  // Mobile uses natural scrolling initially, pan & zoom only when user zooms to sector
  const panZoom = usePanZoom({
    minZoom: 1,
    maxZoom: 5,
    initialZoom: 1,
    mobileOnly: !zoomedSector, // Disable on desktop when not zoomed, enable when zoomed
    enableDoubleTapReset: true,
  });

  // Content wrapper ref for pan & zoom
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  // Use ref instead of state to avoid re-render loop (gestureBindProps creates new object)
  const gestureBindPropsRef = useRef<Record<string, any>>({});
  const panZoomRef = useRef(panZoom);
  useEffect(() => {
    panZoomRef.current = panZoom;
  }, [panZoom]);

  // Reset pan & zoom when zoomed sector changes
  const prevZoomedSectorRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevZoomedSectorRef.current !== zoomedSector) {
      if (zoomedSector) panZoomRef.current.reset();
      prevZoomedSectorRef.current = zoomedSector;
    }
  }, [zoomedSector]); // panZoom stored in ref

  // Bind gesture handlers when zoomed
  useEffect(() => {
    const element = contentWrapperRef.current;
    if (element && zoomedSector) {
      try {
        const bindProps = panZoomRef.current.bind(element);
        const filtered = Object.fromEntries(
          Object.entries(bindProps || {}).filter(([_, v]) => typeof v === 'function')
        );
        gestureBindPropsRef.current = filtered;
      } catch (error) {
        console.warn('Failed to bind pan & zoom gestures:', error);
        gestureBindPropsRef.current = {};
      }
    } else {
      gestureBindPropsRef.current = {};
    }
  }, [zoomedSector]); // panZoom stored in ref, gestureBindProps using ref to avoid re-render

  const contentWrapperCallbackRef = useCallback((element: HTMLDivElement | null) => {
    contentWrapperRef.current = element;
  }, []);

  // Double-tap handler
  const handleDoubleTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (e.type === 'touchend') {
      const touchEvent = e as React.TouchEvent;
      const now = Date.now();
      const lastTap = (handleDoubleTap as any).lastTap || 0;
      if (now - lastTap < 300) {
        panZoomRef.current.reset();
        e.preventDefault();
      }
      (handleDoubleTap as any).lastTap = now;
    } else if (e.type === 'dblclick') {
      panZoomRef.current.reset();
    }
  }, []); // panZoom stored in ref

  // Show pan & zoom controls only when zoomed or on mobile
  // Only show pan & zoom controls when zoomed to sector
  const showPanZoomControls = zoomedSector && (panZoom.zoom > 1 || panZoom.panX !== 0 || panZoom.panY !== 0);

  return (
    <div
      ref={containerRef}
      className={styles.heatmapContainer}
      style={{
        // CRITICAL: On mobile, this container handles ALL scrolling
        // Set overflow to auto to enable scrolling, but only on mobile
        // On desktop, use hidden as before
        overflowX: 'hidden', // Never allow horizontal scrolling
        overflowY: isMobile ? 'auto' : 'hidden', // Vertical scrolling only on mobile
        height: isMobile ? contentHeight : '100%',
        minHeight: isMobile ? contentHeight : undefined,
        position: 'relative',
        // Enable smooth scrolling on mobile
        WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
      }}
      onMouseMove={renderMode === 'dom' ? handleMouseMove : undefined}
    >
      {(width === 0 || height === 0) && (
        <div className={styles.heatmapLoading}>
          Loading layout...
        </div>
      )}

      {/* Controls - Render mode toggle removed per design request */}
      {/* <div className={styles.heatmapControls}>
        <button
          onClick={() => setRenderMode(prev => prev === 'dom' ? 'canvas' : 'dom')}
          className={styles.heatmapControlButton}
        >
          Mode: {renderMode === 'dom' ? 'DOM (Slow)' : 'Canvas (Fast)'}
        </button>
      </div> */}

      {/* Zoom back button - fixed so it stays visible while scrolling */}
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
          <span className="text-white text-xs font-medium">
            {panZoom.zoom.toFixed(1)}x
          </span>
          {(panZoom.zoom > 1 || panZoom.panX !== 0 || panZoom.panY !== 0) && (
            <button
              onClick={() => panZoomRef.current.reset()}
              className="text-white hover:text-gray-300 transition-colors text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              title="Reset zoom (double-tap)"
            >
              ↻ Reset
            </button>
          )}
        </div>
      )}

      {/* Pan & Zoom Content Wrapper - only when zoomed to sector */}
      {/* Mobile uses natural scrolling, pan & zoom only when zoomed to sector */}
      <div
        ref={contentWrapperCallbackRef}
        {...(zoomedSector ? Object.fromEntries(
          Object.entries(gestureBindPropsRef.current).filter(([_, value]) => typeof value === 'function')
        ) : {})}
        style={{
          // Semantic Zoom Implementation:
          // We do NOT apply CSS transform scale here.
          // Instead, we pass the zoom level to the Canvas rendering logic.
          // This ensures the canvas draws at high resolution with proper LOD.
          // However, we MUST apply translation for PAN if we are not handling pan in canvas?
          // Actually, we will handle BOTH zoom and pan in the canvas offset/scale props.
          // So no CSS transform at all.

          transform: 'none',
          transformOrigin: '0 0',
          willChange: 'auto', // CSS transform disabled, we rely on canvas redraw
          touchAction: zoomedSector ? 'none' : 'auto', // Allow natural scrolling on mobile when not zoomed
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
      {/* End of Pan & Zoom Content Wrapper */}

      {/* Legenda je teraz v page.tsx headeri */}

      {/* Tooltip - hover on desktop, tap (2s) on mobile */}
      {(isMobile ? mobileTappedNode : hoveredNode) && (
        <HeatmapTooltip
          company={(isMobile ? mobileTappedNode : hoveredNode)!}
          position={mousePosition}
          timeframe={timeframe}
          metric={metric}
        />
      )}
    </div >
  );
};

// Re-export from shared hook (keeps backwards compatibility for old imports).
export { useElementResize } from '@/hooks/useElementResize';

