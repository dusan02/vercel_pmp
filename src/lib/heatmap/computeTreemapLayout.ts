/**
 * Pure functions for computing D3 treemap layouts.
 *
 * Desktop: single treemap with nested hierarchy (sector → industry → company).
 * Mobile:  per-sector treemaps stacked vertically for scrollable layout.
 *
 * Extracted from MarketHeatmap.tsx for readability and testability.
 */

import { hierarchy, treemap, treemapSquarify, type HierarchyNode } from 'd3-hierarchy';
import type { HierarchyData, SectorLabelVariant } from './types';
import { LAYOUT_CONFIG } from '@/lib/utils/heatmapConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreemapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  treemapWidth: number;
  treemapHeight: number;
}

export interface TreemapLayoutResult {
  /** D3 hierarchy root with x0/y0/x1/y1 coordinates assigned to every node. */
  root: HierarchyNode<HierarchyData>;
  bounds: TreemapBounds | null;
  /** Uniform scale factor (1 = no scaling). */
  scale: number;
  /** Translation offset so the treemap starts at (0,0) in the viewport. */
  offset: { x: number; y: number };
  /** Total pixel height of content (may exceed viewport on mobile). */
  contentHeight: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively sum leaf values of a HierarchyData subtree. */
function sumValues(node: HierarchyData): number {
  if (typeof node.value === 'number') return node.value;
  if (!node.children) return 0;
  return node.children.reduce((acc, c) => acc + sumValues(c), 0);
}

/** Compute the bounding box of all positioned nodes in a hierarchy. */
function computeBounds(root: HierarchyNode<HierarchyData>): TreemapBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  root.descendants().forEach((node: any) => {
    if (node.x0 != null) {
      minX = Math.min(minX, node.x0);
      minY = Math.min(minY, node.y0);
      maxX = Math.max(maxX, node.x1);
      maxY = Math.max(maxY, node.y1);
    }
  });

  const treemapWidth = maxX - minX;
  const treemapHeight = maxY - minY;
  if (treemapWidth <= 0 || treemapHeight <= 0) return null;
  return { minX, minY, maxX, maxY, treemapWidth, treemapHeight };
}

/** Derive scale + offset from bounds so the treemap fills the viewport. */
function computeScaleAndOffset(
  bounds: TreemapBounds | null,
  width: number,
  height: number,
  isMobile: boolean,
  hasMultipleSectors: boolean,
): { scale: number; offset: { x: number; y: number } } {
  if (!bounds) return { scale: 1, offset: { x: 0, y: 0 } };

  // Mobile with multiple sectors: scale by width only (vertical scroll).
  const scale =
    isMobile && hasMultipleSectors
      ? width / bounds.treemapWidth
      : Math.min(width / bounds.treemapWidth, height / bounds.treemapHeight);

  const offset = {
    x: -bounds.minX * scale,
    y: -bounds.minY * scale,
  };

  return { scale, offset };
}

/** Resolve the sector-label height used by the treemap padding. */
function sectorLabelHeight(variant: SectorLabelVariant, mobile: boolean): number {
  if (mobile) return variant === 'full' ? 18 : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT.HEIGHT;
  return variant === 'full'
    ? LAYOUT_CONFIG.SECTOR_LABEL_FULL.HEIGHT
    : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT.HEIGHT;
}

// ---------------------------------------------------------------------------
// Mobile layout (per-sector stacking)
// ---------------------------------------------------------------------------

function computeMobileLayout(
  d3Root: HierarchyNode<HierarchyData>,
  width: number,
  viewportHeight: number,
  sectorLabelVariant: SectorLabelVariant,
): void {
  const totalValue = d3Root.value || 1;
  const baseSectorHeight = viewportHeight * 0.8;
  const estimatedTotalHeight = baseSectorHeight * (d3Root.children?.length ?? 1);
  const minSectorHeight = viewportHeight * 0.6;
  const labelH = sectorLabelHeight(sectorLabelVariant, true);

  let currentY = 0;

  (d3Root.children || []).forEach((sectorNode: any) => {
    if (!sectorNode.data.children?.length) return;
    const sectorValue = sumValues(sectorNode.data);
    if (sectorValue <= 0) return;

    const proportional = (sectorValue / totalValue) * estimatedTotalHeight;
    const sectorH = Math.round(Math.max(proportional, minSectorHeight));

    // Build an independent treemap for this sector
    const sectorData: HierarchyData = {
      name: sectorNode.data.name,
      children: sectorNode.data.children,
      meta: sectorNode.data.meta,
    };

    const sectorHier = hierarchy(sectorData)
      .sum((d) => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    treemap<HierarchyData>()
      .size([width, sectorH])
      .padding((n) => (n.data.meta?.type === 'industry' ? 1 : 0))
      .paddingTop((n) => {
        if (n.depth === 0) return labelH;
        if (n.data.meta?.type === 'industry') return 14;
        return 0;
      })
      .paddingBottom((n) => (n.depth === 0 ? 2 : 0))
      .paddingLeft(0)
      .paddingRight(0)
      .tile(treemapSquarify)(sectorHier);

    // Set sector bounds on the original d3Root node
    sectorNode.x0 = 0;
    sectorNode.x1 = width;
    sectorNode.y0 = currentY;
    sectorNode.y1 = currentY + sectorH;

    // Map coordinates back via shared data-object references
    const dataToNode = new Map<any, any>();
    sectorNode.descendants().forEach((n: any) => dataToNode.set(n.data, n));

    sectorHier.descendants().forEach((hNode: any) => {
      if (hNode.x0 == null || hNode.depth === 0) return;
      const target = dataToNode.get(hNode.data);
      if (target) {
        target.x0 = hNode.x0;
        target.x1 = hNode.x1;
        target.y0 = hNode.y0 + currentY;
        target.y1 = hNode.y1 + currentY;
      }
    });

    currentY += sectorH;
  });

  // Update root bounds
  (d3Root as any).x0 = 0;
  (d3Root as any).x1 = width;
  (d3Root as any).y0 = 0;
  (d3Root as any).y1 = currentY;
}

// ---------------------------------------------------------------------------
// Desktop layout (single treemap)
// ---------------------------------------------------------------------------

function computeDesktopLayout(
  d3Root: HierarchyNode<HierarchyData>,
  width: number,
  height: number,
  sectorLabelVariant: SectorLabelVariant,
): void {
  const labelH = sectorLabelHeight(sectorLabelVariant, false);

  treemap<HierarchyData>()
    .size([width, height])
    .padding((n) => {
      if (n.data.meta?.type === 'sector') return LAYOUT_CONFIG.SECTOR_GAP;
      if (n.data.meta?.type === 'industry') return 1;
      return 0;
    })
    .paddingTop((n) => {
      if (n.data.meta?.type === 'sector') return labelH;
      if (n.data.meta?.type === 'industry') return 14;
      return 0;
    })
    .paddingBottom((n) => (n.data.meta?.type === 'sector' ? 2 : 0))
    .paddingLeft(0)
    .paddingRight(0)
    .round(true)
    .tile(treemapSquarify)(d3Root);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a full treemap layout from hierarchy data.
 *
 * Returns the positioned D3 root, bounds, scale, offset, and content height
 * so the component can render without additional memoised derivations.
 */
export function computeTreemapLayout(
  hierarchyRoot: HierarchyData,
  width: number,
  height: number,
  isMobile: boolean,
  sectorLabelVariant: SectorLabelVariant,
): TreemapLayoutResult | null {
  if (width === 0 || height === 0) return null;

  const d3Root = hierarchy(hierarchyRoot)
    .sum((d) => d.value || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  const hasMultipleSectors = (d3Root.children?.length ?? 0) > 1;

  // Choose layout strategy
  if (isMobile && hasMultipleSectors) {
    computeMobileLayout(d3Root, width, height, sectorLabelVariant);
  } else {
    computeDesktopLayout(d3Root, width, height, sectorLabelVariant);
  }

  const bounds = computeBounds(d3Root);
  const { scale, offset } = computeScaleAndOffset(bounds, width, height, isMobile, hasMultipleSectors);

  // Content height: on mobile with scrolling, use actual treemap height + padding
  let contentHeight = height;
  if (isMobile && bounds && hasMultipleSectors) {
    contentHeight = bounds.treemapHeight * scale + 50;
  }

  return { root: d3Root, bounds, scale, offset, contentHeight };
}
