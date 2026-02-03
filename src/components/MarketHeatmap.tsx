'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  hierarchy,
  treemap,
  treemapSquarify,
  HierarchyNode,
} from 'd3-hierarchy';
import { scaleLinear } from 'd3-scale';

import { CanvasHeatmap } from './CanvasHeatmap';
import { HeatmapTile } from './HeatmapTile';
import { HeatmapTooltip } from './HeatmapTooltip';
import { buildHeatmapHierarchy } from '@/lib/utils/heatmapLayout';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import { formatPercent, formatMarketCapDiff, formatPrice, formatMarketCap } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { LAYOUT_CONFIG } from '@/lib/utils/heatmapConfig';
import { getTileLabelConfig } from '@/lib/utils/heatmapLabelUtils';
import { usePanZoom } from '@/hooks/usePanZoom';
import styles from '@/styles/heatmap.module.css';

// --- CONSTANTS ---
// Constants moved to @/lib/utils/heatmapConfig.ts

// --- HELPER FUNCTIONS ---

/**
 * Calculate sector summary (weighted avg % change or total mcap delta)
 * Now uses pre-calculated weighted average from sector meta
 */
function calculateSectorSummary(
  sectorNode: TreemapNode,
  metric: HeatmapMetric
): string | null {
  const sectorMeta = sectorNode.data.meta;

  if (metric === 'percent') {
    // Use pre-calculated weighted average from sector meta
    if (sectorMeta?.weightedAvgPercent !== undefined && !isNaN(sectorMeta.weightedAvgPercent)) {
      return formatPercent(sectorMeta.weightedAvgPercent);
    }
    return null;
  } else {
    // Calculate total market cap delta for sector
    // Get all companies in this sector
    const sectorCompanies = sectorNode.leaves()
      .map((leaf: any) => leaf.data.meta?.companyData)
      .filter((c): c is CompanyNode => c !== undefined && c !== null);

    if (sectorCompanies.length === 0) return null;

    const totalDelta = sectorCompanies.reduce((sum, c) => {
      // Defensive check: ensure c exists and has marketCapDiff
      if (!c || typeof c.marketCapDiff !== 'number') return sum;
      return sum + c.marketCapDiff;
    }, 0);

    if (Math.abs(totalDelta) < 0.01) return null; // Too small to display

    return formatMarketCapDiff(totalDelta);
  }
}

/**
 * Truncate long sector names for display
 * First formats the sector name to short version, then truncates if still too long
 */
function truncateSectorName(name: string, maxLength: number = 20): string {
  // First format to short version
  const formatted = formatSectorName(name);
  if (formatted.length <= maxLength) return formatted;
  // Try to truncate at word boundary
  const truncated = formatted.substring(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) {
    return truncated.substring(0, lastSpace) + '...';
  }
  return truncated + '...';
}

/**
 * Calculate maximum characters that fit in available width
 */
function calculateMaxCharsForWidth(
  sectorWidth: number,
  fontSize: number,
  padding: number = 12
): number {
  // Estimate: uppercase letters are ~0.6em wide, add some margin
  const availableWidth = sectorWidth - padding;
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor(availableWidth / charWidth);
  return Math.max(4, maxChars); // Minimum 4 chars
}

// --- TYPY ---

/**
 * Typ pre vstupné dáta jednej spoločnosti.
 */
export type CompanyNode = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  changePercent: number;
  marketCapDiff?: number; // Denný rozdiel v market cap (nominálna hodnota v $)
  marketCapDiffAbs?: number; // Absolútna hodnota marketCapDiff pre veľkosť dlaždice
  currentPrice?: number; // Aktuálna cena akcie
  /** Whether the price used to compute change is stale (session-aware). */
  isStale?: boolean;
  /** ISO timestamp for the price used to compute change (best-effort). */
  lastUpdated?: string;
  /** Custom formatted value to display (overrides default formatting) */
  displayValue?: string;
};

/**
 * Typ pre metriku heatmapy - podľa čoho sa počíta veľkosť dlaždice
 */
export type HeatmapMetric = 'percent' | 'mcap';

/**
 * Props pre hlavný komponent heatmapy.
 */
export type SectorLabelVariant = 'compact' | 'full';

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
export interface HierarchyData {
  name: string;
  children?: HierarchyData[];
  value?: number; // MarketCap pre listy
  meta?: {
    type: 'root' | 'sector' | 'industry' | 'company';
    companyData?: CompanyNode; // Plné dáta pre listy
    // Agregované hodnoty pre sektory/priemysly
    totalMarketCap?: number;
    weightedPercentSum?: number;
    weightedAvgPercent?: number;
    companyCount?: number;
  };
}

/**
 * Typ pre list (firmu) po spracovaní D3 layoutom.
 */
export type TreemapLeaf = HierarchyNode<HierarchyData> & {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  data: HierarchyData & {
    meta: {
      type: 'company';
      companyData: CompanyNode;
    };
  };
};

/**
 * Typ pre uzol (sektor/industry) po spracovaní D3 layoutom.
 */
export type TreemapNode = HierarchyNode<HierarchyData> & {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

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


/**
 * Komponent pre Legendu.
 * Exportovaný, aby sa mohol použiť aj v page komponente.
 */
export const HeatmapLegend: React.FC<{ timeframe: 'day' | 'week' | 'month'; metric?: HeatmapMetric }> = ({ timeframe, metric = 'percent' }) => {
  const colorScale = createHeatmapColorScale(timeframe, metric === 'mcap' ? 'mcap' : 'percent');
  const scales = {
    day: [-5, -3, -1, 0, 1, 3, 5],
    week: [-10, -6, -3, 0, 3, 6, 10],
    month: [-20, -12, -6, 0, 6, 12, 20],
  };
  const scalesB = {
    day: [-100, -30, -10, 0, 10, 30, 100],
    week: [-30, -10, -3, 0, 3, 10, 30],
    month: [-60, -20, -6, 0, 6, 20, 60],
  };
  const points = metric === 'mcap' ? scalesB[timeframe] : scales[timeframe];
  const unit = metric === 'mcap' ? 'B$' : '%';
  const formatTick = (v: number) => `${v}${unit}`;
  // Reduce label density for readability (keep swatches full-res).
  const labelIndices = points.length >= 7 ? [0, 2, 3, 4, 6] : points.map((_, i) => i);

  return (
    <div className="bg-gray-900 bg-opacity-70 px-2.5 py-1.5 rounded-lg">
      {/* Swatches (always full resolution) */}
      <div className="flex items-stretch">
        {points.map((p, idx) => (
          <div
            key={p}
            className="h-3 w-5 border-y border-gray-700"
            style={{
              backgroundColor: colorScale(p),
              borderLeft: idx === 0 ? '1px solid #4b5563' : 'none',
              borderRight: idx === points.length - 1 ? '1px solid #4b5563' : 'none',
            }}
          />
        ))}
      </div>

      {/* Labels (sparser + readable) */}
      <div className="mt-1 flex items-center justify-between text-white text-[10px] leading-none font-mono tabular-nums">
        {labelIndices.map((i) => (
          <span key={`${points[i]}-${i}`} className="opacity-90">
            {formatTick(points[i] ?? 0)}
          </span>
        ))}
      </div>
    </div>
  );
};

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
  const [colorTransition, setColorTransition] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Animácia farieb pri zmene timeframe
  useEffect(() => {
    setColorTransition(true);
    const timer = setTimeout(() => setColorTransition(false), 500);
    return () => clearTimeout(timer);
  }, [timeframe]);

  // 1. Transformácia dát
  const hierarchyRoot = useMemo(() => buildHeatmapHierarchy(data, metric), [data, metric]);

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
    return node.children.reduce((acc, c) => acc + sumValues(c), 0);
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

    // Mobile: Vertical layout - sectors stacked vertically, no gaps
    // Desktop: Horizontal layout - original behavior
    const SECTOR_GAP = isMobile ? 0 : LAYOUT_CONFIG.SECTOR_GAP; // No gap on mobile

    if (isMobile && d3Root.children && d3Root.children.length > 0) {
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

        // Calculate proportional height for this sector
        const sectorHeight = (sectorValue / totalValue) * estimatedTotalHeight;
        // Minimum height should be reasonable - 60% of viewport to prevent too much empty space
        const minSectorHeight = height * 0.6; // Minimum height = 60% of viewport
        const finalSectorHeight = Math.max(sectorHeight, minSectorHeight);

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
          .padding(0)
          .paddingTop(0)
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
        if (node.depth === 1) {
          // Sektor → medzera + priestor pre label
          return SECTOR_GAP;
        }
        // Industry + Firmy → 0px (žiadne medzery)
        return 0;
      })
      .paddingTop(function (node) {
        if (node.depth === 1) {
          // Sektor → pridaj priestor pre label (podľa variantu)
          const labelConfig = sectorLabelVariant === 'full'
            ? LAYOUT_CONFIG.SECTOR_LABEL_FULL
            : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT;
          return labelConfig.HEIGHT;
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

    if (isMobile) {
      // Mobile: Scale only by width to allow vertical scrolling
      // Sectors will stack vertically, width fills screen
      return width / treemapBounds.treemapWidth;
    }

    // Desktop: Original behavior - fit to both dimensions
    const scaleX = width / treemapBounds.treemapWidth;
    const scaleY = height / treemapBounds.treemapHeight;
    return Math.min(scaleX, scaleY); // Použijeme menšiu škálu, aby sa mapa zmestila
  }, [treemapBounds, width, height, isMobile]);

  // Offset pre roztiahnutie na celú plochu (bez centrovania)
  const offset = useMemo(() => {
    if (!treemapBounds || scale === 0) return { x: 0, y: 0 };

    if (isMobile) {
      // Mobile: Align to left, start from top (y: 0)
      // Allow vertical scrolling - no vertical scaling/centering
      return {
        x: -treemapBounds.minX * scale,
        y: -treemapBounds.minY * scale, // Start from top
      };
    }

    // Desktop: Original behavior
    const treemapWidth = treemapBounds.treemapWidth * scale;
    const treemapHeight = treemapBounds.treemapHeight * scale;

    // Roztiahnuť na celú plochu - začať od (0,0) a roztiahnuť do (width, height)
    return {
      x: -treemapBounds.minX * scale,
      y: -treemapBounds.minY * scale,
    };
  }, [treemapBounds, scale, isMobile]);

  // Progressive loading state
  // On mobile, use DOM mode for better progressive loading and performance
  // On desktop, use Canvas for better performance with many tiles
  const [renderMode] = useState<'dom' | 'canvas'>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768 ? 'dom' : 'canvas';
    }
    return 'canvas';
  });

  // OPTIMIZATION: Render all items immediately to prevent progressive loading phases
  // This eliminates the "flickering" effect of items appearing gradually
  // On mobile (DOM mode), we can handle rendering all items at once
  // On desktop (Canvas), we render all at once anyway
  // Note: filteredLeaves is defined later, so we'll initialize with a large number
  // and update it immediately when filteredLeaves is available
  const [visibleCount, setVisibleCount] = useState(10000); // Large initial value to render all

  // Reset visible count when data changes or zoom changes - but render ALL immediately
  useEffect(() => {
    // Always render all items immediately to prevent progressive loading phases
    if (filteredLeaves.length > 0) {
      setVisibleCount(filteredLeaves.length);
    }
  }, [filteredLeaves.length]); // Only depend on length to prevent unnecessary updates

  // 2. Renderujeme Listy (Firmy) - Progressive Loading
  const visibleLeaves = filteredLeaves.slice(0, visibleCount);

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
    // Add small padding (50px) to ensure last sector is fully visible, but don't multiply by 2
    const finalHeight = calculatedHeight + 50;
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
  const gestureBindPropsRef = useRef<Record<string, any>>({});
  const [gestureBindProps, setGestureBindProps] = useState<Record<string, any>>({});

  // Reset pan & zoom when zoomed sector changes
  // Only reset if zoomedSector actually changed (not on every render)
  const prevZoomedSectorRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevZoomedSectorRef.current !== zoomedSector) {
      if (zoomedSector) {
        // User zoomed to a sector - reset pan & zoom
        panZoom.reset();
      }
      prevZoomedSectorRef.current = zoomedSector;
    }
  }, [zoomedSector, panZoom]);

  // Apply gesture bind when element is mounted or dependencies change
  // IMPORTANT: Only enable pan & zoom when zoomed to sector, NOT on mobile initially
  // Mobile should use natural scrolling, pan & zoom only when user explicitly zooms
  useEffect(() => {
    const element = contentWrapperRef.current;
    if (element && zoomedSector) {
      try {
        const bindProps = panZoom.bind(element);
        // Filter out any non-function values to prevent errors
        if (bindProps && typeof bindProps === 'object') {
          const filteredProps: Record<string, any> = {};
          Object.keys(bindProps).forEach((key) => {
            const value = (bindProps as any)[key];
            if (typeof value === 'function') {
              filteredProps[key] = value;
            }
          });
          // Only update if props actually changed
          const prevKeys = Object.keys(gestureBindPropsRef.current).sort().join(',');
          const newKeys = Object.keys(filteredProps).sort().join(',');
          if (prevKeys !== newKeys) {
            gestureBindPropsRef.current = filteredProps;
            setGestureBindProps(filteredProps);
          }
        } else {
          if (Object.keys(gestureBindPropsRef.current).length > 0) {
            gestureBindPropsRef.current = {};
            setGestureBindProps({});
          }
        }
      } catch (error) {
        console.warn('Failed to bind pan & zoom gestures:', error);
        if (Object.keys(gestureBindPropsRef.current).length > 0) {
          gestureBindPropsRef.current = {};
          setGestureBindProps({});
        }
      }
    } else {
      if (Object.keys(gestureBindPropsRef.current).length > 0) {
        gestureBindPropsRef.current = {};
        setGestureBindProps({});
      }
    }
  }, [panZoom, zoomedSector]);

  // Simple callback ref - just set the ref, don't trigger state updates
  const contentWrapperCallbackRef = useCallback((element: HTMLDivElement | null) => {
    contentWrapperRef.current = element;
  }, []);

  // Check if pan & zoom should be applied
  // Only apply transform if pan & zoom is active (zoom !== 1 or pan !== 0) AND (mobile or zoomed sector)
  // IMPORTANT: On mobile, don't apply transform initially - let natural scrolling work
  // Only apply transform when user actively zooms/pans
  const isPanZoomActive = panZoom.zoom !== 1 || panZoom.panX !== 0 || panZoom.panY !== 0;
  const shouldApplyTransform = zoomedSector ? isPanZoomActive : false; // Disable pan & zoom on mobile initially

  // Double-tap handler
  const handleDoubleTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (e.type === 'touchend') {
      const touchEvent = e as React.TouchEvent;
      const now = Date.now();
      const lastTap = (handleDoubleTap as any).lastTap || 0;
      if (now - lastTap < 300) {
        panZoom.reset();
        e.preventDefault();
      }
      (handleDoubleTap as any).lastTap = now;
    } else if (e.type === 'dblclick') {
      panZoom.reset();
    }
  }, [panZoom]);

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

      {/* Zoom back button */}
      {zoomedSector && (
        <button
          onClick={() => handleZoomChange(null)}
          className={styles.heatmapZoomButton}
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
              onClick={panZoom.reset}
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
          Object.entries(gestureBindProps).filter(([_, value]) => typeof value === 'function')
        ) : {})}
        style={{
          transform: shouldApplyTransform ? panZoom.transform : 'none',
          transformOrigin: shouldApplyTransform ? panZoom.transformOrigin : '0 0',
          willChange: shouldApplyTransform ? 'transform' : 'auto',
          touchAction: zoomedSector ? 'none' : 'auto', // Allow natural scrolling on mobile when not zoomed
        }}
        onDoubleClick={zoomedSector ? handleDoubleTap : undefined}
        onTouchEnd={zoomedSector ? handleDoubleTap : undefined}
      >
        {renderMode === 'canvas' ? (
          <>
            {/* Sector borders for canvas mode - rendered as overlay divs */}
            {filteredNodes
              .filter((node) => node.depth === 1) // Only Sectors
              .map((node) => {
                const { x0, y0, x1, y1 } = node as TreemapNode;
                const nodeWidth = x1 - x0;
                const nodeHeight = y1 - y0;

                return (
                  <div
                    key={`sector-border-${node.data.name}-${x0}-${y0}`}
                    className="absolute pointer-events-none"
                    style={{
                      left: x0 * scale + offset.x,
                      top: y0 * scale + offset.y,
                      width: nodeWidth * scale,
                      height: nodeHeight * scale,
                      // Thicker black border to separate sectors visually (1.5px solid black - half of original 3px)
                      // Using box-shadow inset to create border effect that renders above canvas
                      boxShadow: 'inset 0 0 0 1.5px #000000',
                      zIndex: 10, // Above canvas to ensure border is visible
                    }}
                  />
                );
              })}
            <CanvasHeatmap
              leaves={filteredLeaves}
              width={width}
              height={height}
              scale={scale}
              offset={offset}
              onTileClick={(company: CompanyNode) => onTileClick && onTileClick(company)}
              onHover={handleCanvasHover}
              metric={metric}
              timeframe={timeframe}
            />
            {/* Sector labels for canvas mode - rendered AFTER canvas to ensure they're on top */}
            {filteredNodes
              .filter((node) => node.depth === 1) // Only Sectors
              .map((node) => {
                const { x0, y0, x1, y1 } = node as TreemapNode;
                const data = node.data as HierarchyData;
                const nodeWidth = x1 - x0;
                const nodeHeight = y1 - y0;
                const scaledWidth = nodeWidth * scale;
                const scaledHeight = nodeHeight * scale;

                const labelConfig = sectorLabelVariant === 'full'
                  ? LAYOUT_CONFIG.SECTOR_LABEL_FULL
                  : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT;

                const labelHeight = labelConfig.HEIGHT;

                // Check if sector is large enough (both width and height)
                // Increased minimum size to prevent overlapping on small sectors
                const minSizeForLabel = 80; // Increased from 50 to prevent overlap
                const minHeightForLabel = labelHeight + 8;
                const showLabel = scaledWidth > minSizeForLabel
                  && scaledHeight > minHeightForLabel
                  && scale > 0
                  && treemapBounds !== null;

                if (!showLabel) return null;

                // Calculate responsive font size using clamp, adjusted for sector width
                const minFont = labelConfig.FONT_SIZE_MIN;
                const maxFont = labelConfig.FONT_SIZE_MAX;
                // Scale font size based on available width (max 90% of sector width)
                const maxLabelWidth = scaledWidth * 0.9;
                const widthBasedFont = Math.min(maxFont, Math.max(minFont, maxLabelWidth / 8));
                const responsiveFontSize = `clamp(${minFont}px, ${widthBasedFont}px, ${maxFont}px)`;
                const fontSizeValue = parseFloat(responsiveFontSize.match(/\d+\.?\d*/)?.[0] || String(minFont));

                // Calculate sector summary for full variant
                const sectorSummary = sectorLabelVariant === 'full' && LAYOUT_CONFIG.SECTOR_LABEL_FULL.SHOW_SUMMARY
                  ? calculateSectorSummary(node as TreemapNode, metric)
                  : null;

                // Dynamically truncate sector name based on available width
                const maxChars = calculateMaxCharsForWidth(scaledWidth, fontSizeValue, labelConfig.LEFT + 20);
                const defaultMaxLength = sectorLabelVariant === 'full' ? 25 : 20;
                const maxLength = Math.max(4, Math.min(maxChars, defaultMaxLength));
                const displayName = truncateSectorName(data.name, maxLength);

                return (
                  <div
                    key={`sector-label-${data.name}-${x0}-${y0}`}
                    className={`${styles.sectorLabelWrap} ${sectorLabelVariant === 'full'
                      ? styles.sectorLabelWrapFull
                      : styles.sectorLabelWrapCompact
                      }`}
                    style={{
                      left: x0 * scale + offset.x,
                      top: y0 * scale + offset.y,
                      width: nodeWidth * scale,
                      maxWidth: nodeWidth * scale, // Prevent overflow
                      height: labelHeight,
                      paddingLeft: labelConfig.LEFT,
                      overflow: 'hidden', // Ensure text doesn't overflow
                    }}
                  >
                    {sectorLabelVariant === 'full' ? (
                      <div className={styles.sectorLabelStripFull} style={{ fontSize: responsiveFontSize }}>
                        <span>{displayName}</span>
                        {sectorSummary && (
                          <span className={styles.sectorLabelSummary}>{sectorSummary}</span>
                        )}
                      </div>
                    ) : (
                      <div className={styles.sectorLabelPillCompact} style={{ fontSize: responsiveFontSize }}>
                        {displayName}
                      </div>
                    )}
                  </div>
                );
              })}
          </>
        ) : (
          <>
            {/* 2. Renderujeme Listy (Firmy) - Using memoized HeatmapTile component */}
            {visibleLeaves.map((leaf) => {
              const { x0, y0, x1, y1 } = leaf;
              const tileWidth = x1 - x0;
              const tileHeight = y1 - y0;
              const company = leaf.data.meta.companyData;
              // marketCapDiff is represented in B$ in our data model
              const v = metric === 'mcap' ? (company.marketCapDiff ?? 0) : company.changePercent;
              const tileColor = colorScale(v);

              // Skutočné rozmery dlaždice v pixeloch
              const scaledWidth = tileWidth * scale;
              const scaledHeight = tileHeight * scale;

              // Konfigurácia textu podľa veľkosti dlaždice
              const labelConfig = getTileLabelConfig(scaledWidth, scaledHeight);

              return (
                <HeatmapTile
                  key={`${company.symbol}-${x0}-${y0}`}
                  leaf={leaf}
                  scale={scale}
                  offset={offset}
                  color={tileColor}
                  labelConfig={labelConfig}
                  metric={metric}
                  colorTransition={colorTransition}
                  onMouseEnter={() => setHoveredNode(company)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => onTileClick && onTileClick(company)}
                />
              );
            })}

            {/* Sektorové border divy - renderované PO dlaždiciach, aby boli viditeľné */}
            {filteredNodes
              .filter((node) => node.depth === 1) // Iba Sektory
              .map((node) => {
                const { x0, y0, x1, y1 } = node as TreemapNode;
                const data = node.data as HierarchyData;
                const nodeWidth = x1 - x0;
                const nodeHeight = y1 - y0;
                const isHovered = hoveredSector === data.name;

                return (
                  <div
                    key={`sector-border-${data.name}-${x0}-${y0}`}
                    className="absolute cursor-pointer transition-all duration-200 ease-in-out"
                    style={{
                      left: x0 * scale + offset.x,
                      top: y0 * scale + offset.y,
                      width: nodeWidth * scale,
                      height: nodeHeight * scale,
                      pointerEvents: 'auto',
                      // Reactive border based on hover state
                      border: isHovered ? '2px solid rgba(255, 255, 255, 0.8)' : '1.5px solid #000000',
                      boxShadow: isHovered ? 'inset 0 0 20px rgba(255, 255, 255, 0.1)' : 'none',
                      boxSizing: 'border-box',
                      zIndex: isHovered ? 20 : 10, // Bring forward on hover
                    }}
                    onMouseEnter={() => setHoveredSector(data.name)}
                    onMouseLeave={() => setHoveredSector(null)}
                    onClick={() => handleSectorClick(data.name)}
                  >
                    {/* Hover overlay pre sektor */}
                    {isHovered && (
                      <div className={styles.heatmapSectorHover} />
                    )}
                  </div>
                );
              })}

            {/* Sector labels for DOM mode - rendered AFTER sectors to ensure they're on top */}
            {filteredNodes
              .filter((node) => node.depth === 1) // Iba Sektory
              .map((node) => {
                const { x0, y0, x1, y1 } = node as TreemapNode;
                const data = node.data as HierarchyData;
                const nodeWidth = x1 - x0;
                const nodeHeight = y1 - y0;
                const scaledWidth = nodeWidth * scale;
                const scaledHeight = nodeHeight * scale;

                const labelConfig = sectorLabelVariant === 'full'
                  ? LAYOUT_CONFIG.SECTOR_LABEL_FULL
                  : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT;

                const labelHeight = labelConfig.HEIGHT;

                // Check if sector is large enough (both width and height)
                const minSizeForLabel = 80;
                const minHeightForLabel = labelHeight + 8;
                const showLabel = scaledWidth > minSizeForLabel
                  && scaledHeight > minHeightForLabel
                  && scale > 0
                  && treemapBounds !== null;

                if (!showLabel) return null;

                // Calculate responsive font size using clamp, adjusted for sector width
                const minFont = labelConfig.FONT_SIZE_MIN;
                const maxFont = labelConfig.FONT_SIZE_MAX;
                // Scale font size based on available width (max 90% of sector width)
                const maxLabelWidth = scaledWidth * 0.9;
                const widthBasedFont = Math.min(maxFont, Math.max(minFont, maxLabelWidth / 8));
                const responsiveFontSize = `clamp(${minFont}px, ${widthBasedFont}px, ${maxFont}px)`;
                const fontSizeValue = parseFloat(responsiveFontSize.match(/\d+\.?\d*/)?.[0] || String(minFont));

                // Calculate sector summary for full variant
                const sectorSummary = sectorLabelVariant === 'full' && LAYOUT_CONFIG.SECTOR_LABEL_FULL.SHOW_SUMMARY
                  ? calculateSectorSummary(node as TreemapNode, metric)
                  : null;

                // Dynamically truncate sector name based on available width
                const maxChars = calculateMaxCharsForWidth(scaledWidth, fontSizeValue, labelConfig.LEFT + 20);
                const defaultMaxLength = sectorLabelVariant === 'full' ? 25 : 20;
                const maxLength = Math.max(4, Math.min(maxChars, defaultMaxLength));
                const displayName = truncateSectorName(data.name, maxLength);

                return (
                  <div
                    key={`sector-label-${data.name}-${x0}-${y0}`}
                    className={`${styles.sectorLabelWrap} ${sectorLabelVariant === 'full'
                      ? styles.sectorLabelWrapFull
                      : styles.sectorLabelWrapCompact
                      } ${zoomedSector ? styles.heatmapZoomEnter : ''}`} /* Add zoom entry animation */
                    style={{
                      left: x0 * scale + offset.x,
                      top: y0 * scale + offset.y,
                      width: nodeWidth * scale,
                      maxWidth: nodeWidth * scale, // Prevent overflow
                      height: labelHeight,
                      paddingLeft: labelConfig.LEFT,
                      overflow: 'hidden', // Ensure text doesn't overflow
                      pointerEvents: 'auto' // Ensure hover events work
                    }}
                    onMouseEnter={() => setHoveredSector(data.name)}
                    onMouseLeave={() => setHoveredSector(null)}
                    onClick={() => handleSectorClick(data.name)}
                  >
                    {sectorLabelVariant === 'full' ? (
                      <div className={styles.sectorLabelStripFull} style={{ fontSize: responsiveFontSize }}>
                        <span>{displayName}</span>
                        {sectorSummary && (
                          <span className={styles.sectorLabelSummary}>{sectorSummary}</span>
                        )}
                      </div>
                    ) : (
                      <div className={styles.sectorLabelPillCompact} style={{ fontSize: responsiveFontSize }}>
                        {displayName}
                      </div>
                    )}
                  </div>
                );
              })}
          </>
        )}
      </div>
      {/* End of Pan & Zoom Content Wrapper */}

      {/* Legenda je teraz v page.tsx headeri */}

      {/* 4. Tooltip (renderuje sa mimo) - skrytý na mobile */}
      {hoveredNode && !isMobile && (
        <HeatmapTooltip
          company={hoveredNode}
          position={mousePosition}
          timeframe={timeframe}
          metric={metric}
        />
      )}
    </div>
  );
};

// --- Hook na sledovanie veľkosti rodičovského elementu ---

/**
 * Custom hook, ktorý používa ResizeObserver na sledovanie veľkosti elementu.
 * @returns Ref, ktorý sa má pripojiť na element, a jeho aktuálna veľkosť.
 */
export function useElementResize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Initial measurement - get dimensions immediately
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };

    // Measure immediately
    measure();

    // Also use ResizeObserver for dynamic changes
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ width, height });
      }
    });

    resizeObserver.observe(element);

    // Fallback: measure again after a short delay (in case parent container isn't ready)
    const timeoutId = setTimeout(measure, 100);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  return { ref, size };
}

