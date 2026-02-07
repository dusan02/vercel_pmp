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

export type MobileTreemapSectorBlock = {
  name: string;
  /** Total block height (including chrome reserved for the sector label/footer). */
  height: number;
  /** Height used for the tile layout area (excludes chrome). */
  tilesHeight: number;
  children: MobileTreemapLeaf[];
};

export type MobileTreemapResult = {
  sectors: MobileTreemapSectorBlock[];
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
};

const DEFAULT_COMPUTE_OPTIONS: Required<Omit<ComputeMobileTreemapOptions, 'sectorChromeHeightPx'>> = {
  contentHeightMultiplier: 1.2,
  minTotalContentHeightPx: 900,
  minTilesHeightPx: 56,
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
  if (sortedData.length === 0 || width <= 0 || height <= 0) return { sectors: [] };

  const {
    sectorChromeHeightPx,
    contentHeightMultiplier,
    minTotalContentHeightPx,
    minTilesHeightPx,
  } = {
    ...DEFAULT_COMPUTE_OPTIONS,
    ...options,
  };

  // Compute treemap areas based on selected metric:
  // - % view: size by market cap (classic S&P 500 heatmap)
  // - $ view: size by absolute market cap change (mcap diff)
  const layoutMetric: HeatmapMetric = metric === 'mcap' ? 'mcap' : 'percent';
  const sectorHierarchy = buildHeatmapHierarchy(sortedData, layoutMetric);
  const sectors = sectorHierarchy.children ?? [];
  if (sectors.length === 0) return { sectors: [] };

  // IMPORTANT: sector children are often not direct company nodes in some hierarchies.
  // Sum recursively to avoid collapsing sector sizes to ~0.
  const sumNode = (node: any): number => {
    if (!node) return 0;
    if (typeof node.value === 'number' && !Number.isNaN(node.value)) return node.value;
    const children = node.children ?? [];
    if (!Array.isArray(children) || children.length === 0) return 0;
    return children.reduce((sum: number, c: any) => sum + sumNode(c), 0);
  };

  const sectorSums = sectors.map((s: any) => sumNode(s));
  const totalSum = sectorSums.reduce((a: number, b: number) => a + b, 0) || 1;

  // 1) Calculate sector heights based on total available scroll area
  const totalContentHeight = Math.max(height * contentHeightMultiplier, minTotalContentHeightPx);
  const baseHeight = totalContentHeight;
  const minSectorHeight = sectorChromeHeightPx + minTilesHeightPx;

  const sectorHeights: number[] = [];
  let allocatedHeight = 0;
  for (let i = 0; i < sectors.length; i++) {
    if (i === sectors.length - 1) {
      const h = Math.max(minSectorHeight, baseHeight - allocatedHeight);
      sectorHeights.push(Math.round(h));
    } else {
      const raw = Math.round(baseHeight * ((sectorSums[i] || 0) / totalSum));
      const finalH = Math.round(Math.max(minSectorHeight, raw));
      sectorHeights.push(finalH);
      allocatedHeight += finalH;
    }
  }

  // 2) Build sector blocks with their own independent treemaps
  const sectorBlocks: MobileTreemapSectorBlock[] = sectors
    .map((sector: any, sectorIdx: number) => {
      if (!sector.children || sector.children.length === 0) return null;

      const sectorHeight = sectorHeights[sectorIdx] ?? 0;
      if (sectorHeight <= 0) return null;

      // Reserve space for sector chrome so it never overlaps/clips tiles.
      const tilesHeight = Math.max(1, sectorHeight - sectorChromeHeightPx);

      const sectorHierarchyNode = hierarchy(sector)
        .sum((d: any) => d.value || 0)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

      const sectorTreemap = treemap()
        .size([width, tilesHeight])
        .padding(0)
        .paddingInner(0)
        .round(true)
        .tile(treemapSquarify);

      sectorTreemap(sectorHierarchyNode);

      const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
      const sectorLeaves: MobileTreemapLeaf[] = sectorHierarchyNode
        .leaves()
        .map((leaf: any) => {
          const x0 = clamp(leaf.x0 ?? 0, 0, width);
          const y0 = clamp(leaf.y0 ?? 0, 0, tilesHeight);
          const x1 = clamp(leaf.x1 ?? 0, 0, width);
          const y1 = clamp(leaf.y1 ?? 0, 0, tilesHeight);
          return {
            x0,
            y0,
            x1,
            y1,
            company: leaf.data.meta?.companyData || leaf.data,
          };
        })
        .filter((leaf: any) => {
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;
          return w > 0 && h > 0;
        });

      return {
        name: sector.name,
        height: sectorHeight,
        tilesHeight,
        children: sectorLeaves,
      } satisfies MobileTreemapSectorBlock;
    })
    .filter((x): x is MobileTreemapSectorBlock => Boolean(x));

  return { sectors: sectorBlocks };
}

