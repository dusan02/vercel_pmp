/**
 * Mobile Heatmap Layout Engine — V2
 *
 * Key improvements over V1:
 * - round(false) → sub-pixel precise coordinates, no edge gaps or tile overlap
 * - paddingInner(1) → clean 1px gap between tiles, built into D3 layout
 * - Reduced sector chrome (16px vs 21px) → more tile space
 * - Full-bleed rendering → no wasted padding
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
};

const DEFAULTS = {
  contentHeightMultiplier: 1.0,
  minTotalContentHeightPx: 800,
  minTilesHeightPx: 100,
  smallSectorThreshold: 0.03,
  maxColumns: 2,
  columnGapPx: COLUMN_GAP_PX,
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
      const flat = { ...item.node, children: flattenLeaves(item.node) };

      // D3 treemap — round(false) for sub-pixel precision (no edge gaps)
      // paddingInner(1.5) for clean gap between tiles, visually ~1-2px
      const h = hierarchy(flat)
        .sum((d: any) => d.value || 0)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

      treemap()
        .size([secW, tilesH])
        .paddingInner(1.5)
        .round(false)
        .tile(treemapSquarify)(h);

      const leaves: MobileTreemapLeaf[] = h.leaves()
        .map((l: any) => ({
          x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1,
          company: l.data.meta?.companyData || l.data,
        }))
        .filter(l => (l.x1 - l.x0) >= 2 && (l.y1 - l.y0) >= 2);

      return { name: item.node.name, width: secW, height: rowH, tilesHeight: tilesH, children: leaves };
    });

    return { id: `r-${idx}`, height: rowH, sectors: sectorBlocks };
  });

  return { rows };
}
