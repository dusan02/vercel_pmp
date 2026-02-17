import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import { buildHeatmapHierarchy } from '@/lib/utils/heatmapLayout';

export type MobileTreemapLeaf = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  company: CompanyNode;
};

// A sector block now exists within a row.
// It has a specific pixel width and height.
export type MobileTreemapSectorBlock = {
  name: string;
  width: number;
  height: number;
  /** Height used for the tile layout area (excludes chrome). */
  tilesHeight: number;
  children: MobileTreemapLeaf[];
};

export type MobileTreemapRow = {
  id: string;
  height: number;
  sectors: MobileTreemapSectorBlock[];
};

export type MobileTreemapResult = {
  rows: MobileTreemapRow[];
};

export type PrepareMobileTreemapDataOptions = {
  maxTiles?: number;
  /** Minimum positive value to prevent D3 from dropping tiles. */
  minTileValueB?: number;
};

export const DEFAULT_MOBILE_TREEMAP_OPTIONS: Required<PrepareMobileTreemapDataOptions> = {
  maxTiles: 500,
  minTileValueB: 1e-6,
};

/**
 * Mobile UX: keep a stable ticker set (top N by market cap), and ensure `marketCapDiffAbs`
 * exists so $ sizing can work even if API doesn't include it.
 */
export function prepareMobileTreemapData(
  data: CompanyNode[],
  options: PrepareMobileTreemapDataOptions = {}
): CompanyNode[] {
  const { maxTiles, minTileValueB } = { ...DEFAULT_MOBILE_TREEMAP_OPTIONS, ...options };
  if (!data || data.length === 0) return [];

  const seen = new Set<string>();
  const uniqueData = data.filter((c) => {
    const symbol = c.symbol?.toUpperCase();
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });

  const top = uniqueData
    .filter((c) => (c.marketCap ?? 0) > 0)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, maxTiles);

  return top.map((c) => ({
    ...c,
    marketCapDiffAbs: c.marketCapDiffAbs ?? Math.max(minTileValueB, Math.abs(c.marketCapDiff ?? 0)),
  }));
}

export type ComputeMobileTreemapOptions = {
  /** Sector chrome reserved height (px) (e.g. footer label + divider). */
  sectorChromeHeightPx: number;
  /** Height multiplier to make the mobile heatmap scrollable/readable. */
  contentHeightMultiplier?: number;
  /** Minimum total content height (px). */
  minTotalContentHeightPx?: number;
  /** Minimum usable tile area inside a small sector block (px). */
  minTilesHeightPx?: number;
  /** Threshold (0-1) of total weight below which a sector is considered "small" and candidate for grouping. */
  smallSectorThreshold?: number;
  /** Maximum number of columns for small sectors. */
  maxColumns?: number;
};

const DEFAULT_COMPUTE_OPTIONS: Required<Omit<ComputeMobileTreemapOptions, 'sectorChromeHeightPx'>> = {
  contentHeightMultiplier: 1.2,
  minTotalContentHeightPx: 900,
  minTilesHeightPx: 56,
  smallSectorThreshold: 0.15, // 15%
  maxColumns: 2,
};

/**
 * Compute mobile sector blocks (sectors stacked vertically, each with its own independent treemap).
 * Pure function (no React), kept here so `MobileTreemapNew` stays mostly rendering code.
 */
export function computeMobileTreemapSectors(
  sortedData: CompanyNode[],
  container: { width: number; height: number },
  metric: HeatmapMetric,
  options: ComputeMobileTreemapOptions
): MobileTreemapResult {
  const { width, height } = container;
  if (sortedData.length === 0 || width <= 0 || height <= 0) return { rows: [] };

  const {
    sectorChromeHeightPx,
    contentHeightMultiplier,
    minTotalContentHeightPx,
    minTilesHeightPx,
    smallSectorThreshold,
    maxColumns,
  } = {
    ...DEFAULT_COMPUTE_OPTIONS,
    ...options,
  };

  // Compute treemap areas based on selected metric:
  const layoutMetric: HeatmapMetric = metric === 'mcap' ? 'mcap' : 'percent';
  const sectorHierarchy = buildHeatmapHierarchy(sortedData, layoutMetric);
  const rawSectors = sectorHierarchy.children ?? [];
  if (rawSectors.length === 0) return { rows: [] };

  // Helper to sum node values
  const sumNode = (node: any): number => {
    if (!node) return 0;
    if (typeof node.value === 'number' && !Number.isNaN(node.value)) return node.value;
    const children = node.children ?? [];
    if (!Array.isArray(children) || children.length === 0) return 0;
    return children.reduce((sum: number, c: any) => sum + sumNode(c), 0);
  };

  const sectorsWithWeight = rawSectors.map((s: any) => ({
    node: s,
    weight: sumNode(s),
  }));

  const totalSum = sectorsWithWeight.reduce((a, b) => a + b.weight, 0) || 1;

  // 1) Group sectors into rows
  type RowDef = {
    sectors: typeof sectorsWithWeight;
    rowWeight: number;
    isGrouped: boolean;
  };

  const rows: RowDef[] = [];
  let buffer: typeof sectorsWithWeight = [];
  let bufferWeight = 0;

  sectorsWithWeight.forEach((sectorItem, idx) => {
    const ratio = sectorItem.weight / totalSum;
    const isSmall = ratio < smallSectorThreshold;

    // Logic:
    // If it's big, it takes a full row.
    // If it's small, we try to add it to buffer.
    // If buffer is full (maxColumns), we push row.
    // NOTE: Keep top 3 always full width for emphasis? Maybe just rely on threshold.
    // User asked specifically for "bottom small sectors". Sorted by size implies bottom ones are small.

    if (!isSmall) {
      // Flush buffer if exists
      if (buffer.length > 0) {
        rows.push({ sectors: buffer, rowWeight: bufferWeight, isGrouped: true });
        buffer = [];
        bufferWeight = 0;
      }
      // Add big sector as single row
      rows.push({ sectors: [sectorItem], rowWeight: sectorItem.weight, isGrouped: false });
    } else {
      // Add to buffer
      buffer.push(sectorItem);
      bufferWeight += sectorItem.weight;

      if (buffer.length >= maxColumns) {
        rows.push({ sectors: buffer, rowWeight: bufferWeight, isGrouped: true });
        buffer = [];
        bufferWeight = 0;
      }
    }
  });

  // Flush remaining buffer
  if (buffer.length > 0) {
    rows.push({ sectors: buffer, rowWeight: bufferWeight, isGrouped: true });
  }

  // 2) Calculate row and sector dimensions
  const totalContentHeight = Math.max(height * contentHeightMultiplier, minTotalContentHeightPx);
  const minSectorBlocksHeight = sectorChromeHeightPx + minTilesHeightPx; // Minimum height for any sector block

  // We distribute `totalContentHeight` proportional to `rowWeight`.
  // However, we must ensure every row has at least enough height for its minimal sector requirements.

  const rowResults: MobileTreemapRow[] = rows.map((row, rowIdx) => {
    // Raw height share
    const rawH = Math.round(totalContentHeight * (row.rowWeight / totalSum));
    // Enforce minimum height
    const finalH = Math.max(minSectorBlocksHeight, rawH);

    // Now calculate sectors within this row
    const rowSectors: MobileTreemapSectorBlock[] = row.sectors.map(sectorItem => {
      // Width share inside the row
      const widthShare = sectorItem.weight / row.rowWeight;
      const sectorWidth = Math.floor(width * widthShare);

      // Height is same as row height
      const sectorHeight = finalH;

      // Tiles height
      const tilesHeight = Math.max(1, sectorHeight - sectorChromeHeightPx);

      // Generate D3 treemap
      const hierarchyNode = hierarchy(sectorItem.node)
        .sum((d: any) => d.value || 0)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

      // Note: D3 treemap squarify works best with aspect ratios close to 1.
      // Narrow columns might produce thin tiles. d3.treemapResquarify or others might be better, 
      // but default squarify is standard.
      const treeLayout = treemap()
        .size([sectorWidth, tilesHeight])
        .padding(0)
        .paddingInner(0)
        .round(true)
        .tile(treemapSquarify);

      treeLayout(hierarchyNode);

      const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
      const leaves = hierarchyNode.leaves()
        .map((leaf: any) => {
          const x0 = clamp(leaf.x0, 0, sectorWidth);
          const y0 = clamp(leaf.y0, 0, tilesHeight);
          const x1 = clamp(leaf.x1, 0, sectorWidth);
          const y1 = clamp(leaf.y1, 0, tilesHeight);
          return {
            x0, y0, x1, y1,
            company: leaf.data.meta?.companyData || leaf.data
          };
        })
        .filter(l => (l.x1 - l.x0) > 0 && (l.y1 - l.y0) > 0);

      return {
        name: sectorItem.node.name,
        width: sectorWidth,
        height: sectorHeight,
        tilesHeight,
        children: leaves
      } satisfies MobileTreemapSectorBlock;
    });

    // Fix slight pixel rounding errors in width?
    // For now, floor is safe, might leave 1px gap on right. Flex justify-between can handle or just ignore.

    return {
      id: `row-${rowIdx}`,
      height: finalH,
      sectors: rowSectors
    };
  });

  return { rows: rowResults };
}


