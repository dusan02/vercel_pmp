/**
 * Pure functions for computing D3 treemap layouts (desktop only).
 *
 * Desktop: single treemap with nested hierarchy (sector → industry → company).
 * Mobile uses a separate pipeline in mobileTreemap.ts.
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
): { scale: number; offset: { x: number; y: number } } {
  if (!bounds) return { scale: 1, offset: { x: 0, y: 0 } };

  const scale = Math.min(width / bounds.treemapWidth, height / bounds.treemapHeight);
  const offset = {
    x: -bounds.minX * scale,
    y: -bounds.minY * scale,
  };

  return { scale, offset };
}

/** Resolve the sector-label height used by the treemap padding. */
function sectorLabelHeight(variant: SectorLabelVariant): number {
  return variant === 'full'
    ? LAYOUT_CONFIG.SECTOR_LABEL_FULL.HEIGHT
    : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT.HEIGHT;
}

// ---------------------------------------------------------------------------
// Desktop layout
// ---------------------------------------------------------------------------

function computeDesktopLayout(
  d3Root: HierarchyNode<HierarchyData>,
  width: number,
  height: number,
  sectorLabelVariant: SectorLabelVariant,
): void {
  const labelH = sectorLabelHeight(sectorLabelVariant);

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
  _isMobile: boolean,
  sectorLabelVariant: SectorLabelVariant,
): TreemapLayoutResult | null {
  if (width === 0 || height === 0) return null;

  const d3Root = hierarchy(hierarchyRoot)
    .sum((d) => d.value || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  computeDesktopLayout(d3Root, width, height, sectorLabelVariant);

  const bounds = computeBounds(d3Root);
  const { scale, offset } = computeScaleAndOffset(bounds, width, height);

  return { root: d3Root, bounds, scale, offset, contentHeight: height };
}
