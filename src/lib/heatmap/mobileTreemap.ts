/**
 * Mobile Heatmap Layout Engine — V3
 *
 * Key fix over V2:
 * - round(true) → integer coordinates, guarantees ZERO tile overlap
 * - paddingInner(0) + 1px CSS inset → uniform 2px gap, max tile area
 * - Tile limiting: sectors with too many companies for their area
 *   aggregate excess into an "Other" tile (minTilePx = 4px)
 * - transform: translate3d for GPU-precise positioning
 */

import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import { buildHeatmapHierarchy } from '@/lib/utils/heatmapLayout';

// ─── Types ──────────────────────────────────────────────────────────

export type MobileTreemapLeaf = {
  x0: number; y0: number; x1: number; y1: number;
  company: CompanyNode;
};

export type MobileTreemapSectorBlock = {
  name: string;
  width: number;
  height: number;
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

// ─── Constants (exported for consumers) ─────────────────────────────

export const SECTOR_CHROME_PX = 16;
export const COLUMN_GAP_PX = 3;

// ─── Data Preparation ───────────────────────────────────────────────

export function prepareMobileTreemapData(
  data: CompanyNode[],
  maxTiles = 500
): CompanyNode[] {
  if (!data || data.length === 0) return [];

  const seen = new Set<string>();
  return data
    .filter(c => {
      const s = c.symbol?.toUpperCase();
      if (!s || seen.has(s) || (c.marketCap ?? 0) <= 0) return false;
      seen.add(s);
      return true;
    })
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, maxTiles)
    .map(c => ({
      ...c,
      marketCapDiffAbs: c.marketCapDiffAbs ?? Math.max(1e-6, Math.abs(c.marketCapDiff ?? 0)),
    }));
}

// ─── Layout Options ─────────────────────────────────────────────────

export type ComputeMobileTreemapOptions = {
  sectorChromeHeightPx: number;
  contentHeightMultiplier?: number;
  minTotalContentHeightPx?: number;
  minTilesHeightPx?: number;
  smallSectorThreshold?: number;
  maxColumns?: number;
  columnGapPx?: number;
  minTilePx?: number;
};

const DEFAULTS = {
  contentHeightMultiplier: 1.0,
  minTotalContentHeightPx: 800,
  minTilesHeightPx: 100,
  smallSectorThreshold: 0.03,
  maxColumns: 2,
  columnGapPx: COLUMN_GAP_PX,
  minTilePx: 4,
};

// ─── Helpers ────────────────────────────────────────────────────────

function flattenLeaves(node: any): any[] {
  if (!node.children || node.children.length === 0) return [node];
  return node.children.flatMap(flattenLeaves);
}

function sumNode(node: any): number {
  if (!node) return 0;
  if (typeof node.value === 'number' && !Number.isNaN(node.value)) return node.value;
  return (node.children ?? []).reduce((s: number, c: any) => s + sumNode(c), 0);
}

// ─── Core Layout ────────────────────────────────────────────────────

export function computeMobileTreemapSectors(
  sortedData: CompanyNode[],
  container: { width: number; height: number },
  metric: HeatmapMetric,
  options: ComputeMobileTreemapOptions
): MobileTreemapResult {
  const { width, height } = container;
  if (sortedData.length === 0 || width <= 0 || height <= 0) return { rows: [] };

  const chromeH = options.sectorChromeHeightPx;
  const colGap = options.columnGapPx ?? DEFAULTS.columnGapPx;
  const contentMul = options.contentHeightMultiplier ?? DEFAULTS.contentHeightMultiplier;
  const minContentH = options.minTotalContentHeightPx ?? DEFAULTS.minTotalContentHeightPx;
  const minTilesH = options.minTilesHeightPx ?? DEFAULTS.minTilesHeightPx;
  const threshold = options.smallSectorThreshold ?? DEFAULTS.smallSectorThreshold;
  const maxCols = options.maxColumns ?? DEFAULTS.maxColumns;
  const minTilePx = options.minTilePx ?? DEFAULTS.minTilePx;

  const hier = buildHeatmapHierarchy(sortedData, metric);
  const rawSectors = hier.children ?? [];
  if (rawSectors.length === 0) return { rows: [] };

  const sectors = rawSectors.map((s: any) => ({ node: s, weight: sumNode(s) }));
  const totalWeight = sectors.reduce((a, b) => a + b.weight, 0) || 1;

  // ── Group sectors into rows ────────────────────────────────────
  type RowDef = { items: typeof sectors; weight: number };
  const rowDefs: RowDef[] = [];
  let buf: typeof sectors = [];
  let bufW = 0;

  for (const sec of sectors) {
    if (sec.weight / totalWeight >= threshold) {
      if (buf.length > 0) { rowDefs.push({ items: buf, weight: bufW }); buf = []; bufW = 0; }
      rowDefs.push({ items: [sec], weight: sec.weight });
    } else {
      buf.push(sec); bufW += sec.weight;
      if (buf.length >= maxCols) { rowDefs.push({ items: buf, weight: bufW }); buf = []; bufW = 0; }
    }
  }
  if (buf.length > 0) rowDefs.push({ items: buf, weight: bufW });

  // ── Compute dimensions ─────────────────────────────────────────
  const totalH = Math.max(height * contentMul, minContentH);
  const minRowH = chromeH + minTilesH;

  const rows: MobileTreemapRow[] = rowDefs.map((row, idx) => {
    const rowH = Math.max(minRowH, Math.round(totalH * (row.weight / totalWeight)));
    const gapTotal = Math.max(0, row.items.length - 1) * colGap;
    const availW = Math.max(0, width - gapTotal);
    let remW = availW;

    const sectorBlocks: MobileTreemapSectorBlock[] = row.items.map((item, sIdx) => {
      const isLast = sIdx === row.items.length - 1;
      const secW = isLast ? remW : Math.floor(availW * (item.weight / row.weight));
      remW -= secW;

      const tilesH = Math.max(1, rowH - chromeH);
      const allLeaves = flattenLeaves(item.node);

      // Limit the number of tiles per sector based on available area.
      // Each tile needs at least minTilePx × minTilePx pixels (plus 2px for inset gap).
      // Excess companies are aggregated into a single "Other" tile so the treemap
      // never tries to squeeze too many tiles into a small space.
      const tileCellPx = minTilePx + 2; // account for 1px inset on each side
      const maxTiles = Math.max(1, Math.floor(secW / tileCellPx) * Math.floor(tilesH / tileCellPx));

      let leavesForTreemap = allLeaves;
      if (allLeaves.length > maxTiles) {
        // Sort by value descending (already sorted by buildHeatmapHierarchy, but be safe)
        const sorted = [...allLeaves].sort((a: any, b: any) => (b.value || 0) - (a.value || 0));
        const kept = sorted.slice(0, maxTiles - 1);
        const dropped = sorted.slice(maxTiles - 1);
        const otherValue = dropped.reduce((s: number, c: any) => s + (c.value || 0), 0);
        kept.push({
          name: `Other (${dropped.length})`,
          value: otherValue,
          meta: { type: 'company', companyData: dropped[0]?.meta?.companyData || { symbol: '…', name: 'Other', sector: item.node.name, industry: '', marketCap: 0, changePercent: 0 } },
        });
        leavesForTreemap = kept;
      }

      const flat = { ...item.node, children: leavesForTreemap };

      // D3 treemap — round(true) for integer coordinates (ZERO overlap guarantee)
      // paddingInner(0): we create the visible gap ourselves with CSS margins so
      // tiny tiles get the maximum possible area and no D3 rounding artifacts.
      const h = hierarchy(flat)
        .sum((d: any) => d.value || 0)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

      treemap()
        .size([secW, tilesH])
        .paddingInner(0)
        .round(true)
        .tile(treemapSquarify)(h);

      const leaves: MobileTreemapLeaf[] = h.leaves()
        .map((l: any) => {
          const x0 = Math.round(l.x0);
          const y0 = Math.round(l.y0);
          const x1 = Math.round(l.x1);
          const y1 = Math.round(l.y1);
          // Uniform 1px inset on every side creates a clean 2px gap between
          // adjacent tiles when they are edge-to-edge in D3 coordinate space.
          // This prevents any browser sub-pixel compositor overlap and gives
          // tiny tiles more usable area than D3 paddingInner would.
          const insetX0 = Math.min(x1, x0 + 1);
          const insetY0 = Math.min(y1, y0 + 1);
          const insetX1 = Math.max(insetX0 + 1, x1 - 1);
          const insetY1 = Math.max(insetY0 + 1, y1 - 1);
          // Clamp to sector bounds so a tile never extends outside its container.
          return {
            x0: insetX0,
            y0: insetY0,
            x1: Math.min(secW, insetX1),
            y1: Math.min(tilesH, insetY1),
            company: l.data.meta?.companyData || l.data,
          };
        })
        .filter(l => (l.x1 - l.x0) >= 2 && (l.y1 - l.y0) >= 2);

      return { name: item.node.name, width: secW, height: rowH, tilesHeight: tilesH, children: leaves };
    });

    return { id: `r-${idx}`, height: rowH, sectors: sectorBlocks };
  });

  return { rows };
}
