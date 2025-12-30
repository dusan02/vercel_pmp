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
import { LAYOUT_CONFIG } from '@/lib/utils/heatmapConfig';
import { getTileLabelConfig } from '@/lib/utils/heatmapLabelUtils';
import styles from '@/styles/heatmap.module.css';

// --- CONSTANTS ---
// Constants moved to @/lib/utils/heatmapConfig.ts

// --- HELPER FUNCTIONS ---

/**
 * Calculate sector summary (avg % change or total mcap delta)
 */
function calculateSectorSummary(
  sectorName: string,
  allLeaves: TreemapLeaf[],
  metric: HeatmapMetric
): string | null {
  // Get all companies in this sector
  const sectorCompanies = allLeaves
    .filter(leaf => {
      const company = leaf.data.meta?.companyData;
      return company && company.sector === sectorName;
    })
    .map(leaf => leaf.data.meta?.companyData)
    .filter((c): c is CompanyNode => c !== undefined);

  if (sectorCompanies.length === 0) return null;

  if (metric === 'percent') {
    // Calculate median (better than average for outliers)
    const changes = sectorCompanies
      .map(c => c.changePercent)
      .filter(p => p !== null && p !== undefined && !isNaN(p))
      .sort((a, b) => a - b);

    if (changes.length === 0) return null;

    const midIndex = Math.floor(changes.length / 2);
    const median = changes.length % 2 === 0
      ? (changes[midIndex - 1]! + changes[midIndex]!) / 2
      : changes[midIndex]!;

    return formatPercent(median);
  } else {
    // Calculate total market cap delta for sector
    const totalDelta = sectorCompanies.reduce((sum, c) => {
      return sum + (c.marketCapDiff || 0);
    }, 0);

    if (Math.abs(totalDelta) < 0.01) return null; // Too small to display

    return formatMarketCapDiff(totalDelta);
  }
}

/**
 * Truncate long sector names for display
 */
function truncateSectorName(name: string, maxLength: number = 20): string {
  if (name.length <= maxLength) return name;
  // Try to truncate at word boundary
  const truncated = name.substring(0, maxLength - 3);
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
export const HeatmapLegend: React.FC<{ timeframe: 'day' | 'week' | 'month' }> = ({ timeframe }) => {
  const colorScale = createHeatmapColorScale(timeframe);
  const scales = {
    day: [-5, -3, -1, 0, 1, 3, 5],
    week: [-10, -6, -3, 0, 3, 6, 10],
    month: [-20, -12, -6, 0, 6, 12, 20],
  };
  const points = scales[timeframe];

  return (
    <div className="flex items-center bg-gray-900 bg-opacity-70 px-3 py-1.5 rounded-lg">
      <span className="text-white text-xs mr-2 font-medium">Decline</span>
      <div className="flex">
        {points.map((p) => (
          <div key={p} className="flex flex-col items-center">
            <div
              className="w-4 h-4 border-t border-b border-gray-700"
              style={{
                backgroundColor: colorScale(p),
                borderLeft: p === points[0] ? '1px solid #4b5563' : 'none',
                borderRight: p === points[points.length - 1] ? '1px solid #4b5563' : 'none',
              }}
            />
            <span className="text-white text-[10px] mt-0.5 leading-tight">{p}%</span>
          </div>
        ))}
      </div>
      <span className="text-white text-xs ml-2 font-medium">Growth</span>
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

  // Use controlled state if provided, otherwise internal
  const isControlled = controlledZoomedSector !== undefined;
  const zoomedSector = isControlled ? controlledZoomedSector : internalZoomedSector;

  const handleZoomChange = useCallback((sector: string | null) => {
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
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (process.env.NODE_ENV !== 'production') {
        console.log('📱 Mobile detection:', { width: window.innerWidth, isMobile: mobile });
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Helper function to sum values in a node (for mobile vertical layout)
  const sumValues = useCallback((node: HierarchyData): number => {
    if (typeof node.value === 'number') return node.value;
    if (!node.children) return 0;
    return node.children.reduce((acc, c) => acc + sumValues(c), 0);
  }, []);

  // 2. Výpočet D3 Treemap layoutu
  // Optimized: Round width/height to nearest 10px to prevent recalculation on tiny resizes
  // Mobile: Vertical layout (sectors stacked vertically, no gaps)
  // Desktop: Horizontal layout (original behavior)
  const treemapLayout = useMemo(() => {
    if (width === 0 || height === 0) return null;

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
      const estimatedTotalHeight = height * d3Root.children.length * 5;

      d3Root.children.forEach((sectorNode: any) => {
        if (!sectorNode.data.children || sectorNode.data.children.length === 0) return;

        const sectorValue = sumValues(sectorNode.data);
        if (sectorValue <= 0) return;

        // Calculate proportional height for this sector
        const sectorHeight = (sectorValue / totalValue) * estimatedTotalHeight;
        const minSectorHeight = height * 1.5; // Minimum height per sector
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
        console.log('📱 Mobile layout complete:', { totalHeight: currentY, sectors: d3Root.children.length });
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
  const colorScale = useMemo(() => createHeatmapColorScale(timeframe), [timeframe]);

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
  const [visibleCount, setVisibleCount] = useState(50); // Start with 50 items
  const [renderMode, setRenderMode] = useState<'dom' | 'canvas'>('canvas'); // Default to Canvas

  // Reset visible count when data changes or zoom changes
  useEffect(() => {
    setVisibleCount(50);
  }, [filteredLeaves]);

  // Progressive loading effect (only for DOM mode)
  useEffect(() => {
    if (renderMode === 'dom' && visibleCount < filteredLeaves.length) {
      const frame = requestAnimationFrame(() => {
        setVisibleCount(prev => Math.min(prev + 100, filteredLeaves.length));
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [visibleCount, filteredLeaves.length, renderMode]);

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
    // Add some padding to ensure all sectors are visible
    return Math.max(treemapBounds.treemapHeight * scale, height * 2);
  }, [isMobile, treemapBounds, scale, height]);

  return (
    <div
      ref={containerRef}
      className={styles.heatmapContainer}
      style={{
        overflow: isMobile ? 'visible' : 'hidden',
        height: isMobile ? contentHeight : '100%',
        minHeight: isMobile ? contentHeight : undefined
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
                ? calculateSectorSummary(data.name, allLeaves, metric)
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
            const tileColor = colorScale(company.changePercent);

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
                  className="absolute cursor-pointer"
                  style={{
                    left: x0 * scale + offset.x,
                    top: y0 * scale + offset.y,
                    width: nodeWidth * scale,
                    height: nodeHeight * scale,
                    pointerEvents: 'auto',
                    // Thicker black border to separate sectors visually (1.5px solid black - half of original 3px)
                    border: '1.5px solid #000000',
                    boxSizing: 'border-box',
                    zIndex: 10, // Above tiles to ensure border is visible
                  }}
                  onMouseEnter={() => setHoveredSector(data.name)}
                  onMouseLeave={() => setHoveredSector(null)}
                  onClick={() => handleSectorClick(data.name)}
                >
                  {/* Hover overlay pre sektor */}
                  {isHovered && (
                    <div className="absolute inset-0 bg-blue-500 opacity-10 pointer-events-none" />
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
                ? calculateSectorSummary(data.name, allLeaves, metric)
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
      )}

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

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return { ref, size };
}

