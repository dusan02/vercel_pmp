/**
 * Mobile Heatmap Layout Engine — V4 (complete rewrite)
 *
 * Single global D3 treemap — one call, one coordinate space, zero overlap.
 * - 2-level hierarchy: root → sector → company (no industry sub-level)
 * - paddingTop(16) on sector nodes for labels, paddingInner(2) for gaps
 * - round(true) for integer coordinates
 * - Pre-hoc tile limiting: excess companies aggregated into "Other" tile
 */

import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import type { CompanyNode, HeatmapMetric, HierarchyData } from '@/lib/heatmap/types';

// ─── Types ──────────────────────────────────────────────────────────

export type MobileTreemapLeaf = {
  x0: number; y0: number; x1: number; y1: number;
  company: CompanyNode;
};

export type MobileTreemapSector = {
  name: string;
  x0: number; y0: number; x1: number; y1: number;
  tiles: MobileTreemapLeaf[];
};

export type MobileTreemapResult = {
  width: number;
  height: number;
  sectors: MobileTreemapSector[];
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
  sectorChromeHeightPx?: number;
  paddingInner?: number;
  minTilePx?: number;
  minContentHeightPx?: number;
};

const DEFAULTS = {
  sectorChromeHeightPx: SECTOR_CHROME_PX,
  paddingInner: 2,
  minTilePx: 4,
  minContentHeightPx: 600,
};

// ─── Helpers ────────────────────────────────────────────────────────

function getTileValue(company: CompanyNode, metric: HeatmapMetric): number {
  if (metric === 'mcap') {
    return company.marketCapDiffAbs || Math.abs(company.marketCapDiff || 0);
  }
  return company.marketCap || 0;
}

function buildMobileHierarchy(
  data: CompanyNode[],
  metric: HeatmapMetric,
  minTilePx: number,
  totalArea: number,
): HierarchyData {
  const root: HierarchyData = { name: 'Market', children: [], meta: { type: 'root' } };
  const sectorMap = new Map<string, HierarchyData>();
  const seenTickers = new Set<string>();

  for (const company of data) {
    const symbol = company.symbol?.toUpperCase();
    if (!symbol || seenTickers.has(symbol)) continue;
    seenTickers.add(symbol);

    const tileValue = getTileValue(company, metric);
    if (tileValue <= 0) continue;

    let sectorNode = sectorMap.get(company.sector);
    if (!sectorNode) {
      sectorNode = {
        name: company.sector,
        children: [],
        meta: { type: 'sector', totalMarketCap: 0, weightedPercentSum: 0, companyCount: 0 },
      };
      sectorMap.set(company.sector, sectorNode);
      root.children!.push(sectorNode);
    }

    sectorNode.children!.push({
      name: company.symbol,
      value: tileValue,
      meta: { type: 'company', companyData: company },
    });

    if (sectorNode.meta && company.marketCap) {
      sectorNode.meta.totalMarketCap! += company.marketCap;
      sectorNode.meta.weightedPercentSum! += (company.changePercent ?? 0) * company.marketCap;
      sectorNode.meta.companyCount!++;
    }
  }

  // Sort sectors by total value descending, Technology first, Other last
  const sumValues = (node: HierarchyData): number => {
    if (typeof node.value === 'number') return node.value;
    if (!node.children) return 0;
    return node.children.reduce((acc, c) => acc + sumValues(c), 0);
  };

  for (const sector of root.children!) {
    if (sector.children) {
      sector.children.sort((a, b) => sumValues(b) - sumValues(a));
    }
    if (sector.meta?.totalMarketCap && sector.meta.totalMarketCap > 0) {
      sector.meta.weightedAvgPercent = sector.meta.weightedPercentSum! / sector.meta.totalMarketCap;
    }
  }

  root.children!.sort((a, b) => {
    if (a.name === 'Technology' && b.name !== 'Technology') return -1;
    if (a.name !== 'Technology' && b.name === 'Technology') return 1;
    if (a.name === 'Other' && b.name !== 'Other') return 1;
    if (a.name !== 'Other' && b.name === 'Other') return -1;
    return sumValues(b) - sumValues(a);
  });

  // Limit tiles per sector: aggregate excess into "Other" tile
  // We don't know exact sector area yet, so use proportional estimate
  const totalValue = sumValues(root);
  for (const sector of root.children!) {
    if (!sector.children || sector.children.length === 0) continue;
    const sectorFraction = sumValues(sector) / totalValue;
    const sectorArea = totalArea * sectorFraction;
    const maxTiles = Math.max(3, Math.floor(sectorArea / (minTilePx * minTilePx * 3)));

    if (sector.children.length > maxTiles) {
      const kept = sector.children.slice(0, maxTiles - 1);
      const dropped = sector.children.slice(maxTiles - 1);
      const otherValue = dropped.reduce((s, c) => s + (c.value || 0), 0);
      kept.push({
        name: `+${dropped.length}`,
        value: otherValue,
        meta: {
          type: 'company',
          companyData: dropped[0]?.meta?.companyData || {
            symbol: '…', name: 'Other', sector: sector.name,
            industry: '', marketCap: 0, changePercent: 0,
          },
        },
      });
      sector.children = kept;
    }
  }

  return root;
}

// ─── Core Layout ────────────────────────────────────────────────────

export function computeMobileTreemapSectors(
  sortedData: CompanyNode[],
  container: { width: number; height: number },
  metric: HeatmapMetric,
  options?: ComputeMobileTreemapOptions
): MobileTreemapResult {
  const { width, height } = container;
  if (sortedData.length === 0 || width <= 0 || height <= 0) {
    return { width: 0, height: 0, sectors: [] };
  }

  const chromeH = options?.sectorChromeHeightPx ?? DEFAULTS.sectorChromeHeightPx;
  const padInner = options?.paddingInner ?? DEFAULTS.paddingInner;
  const minTilePx = options?.minTilePx ?? DEFAULTS.minTilePx;
  const minContentH = options?.minContentHeightPx ?? DEFAULTS.minContentHeightPx;

  const layoutH = Math.max(height * 1.8, minContentH);
  const totalArea = width * layoutH;

  // Build 2-level hierarchy with tile limiting
  const rootData = buildMobileHierarchy(sortedData, metric, minTilePx, totalArea);

  // Single D3 treemap call — one coordinate space, zero overlap guaranteed
  const h = hierarchy(rootData)
    .sum((d: any) => d.value || 0)
    .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

  treemap<HierarchyData>()
    .size([width, layoutH])
    .paddingTop((d: any) => d.depth === 1 ? chromeH : 0)
    .paddingInner(padInner)
    .round(true)
    .tile(treemapSquarify)(h as any);

  // Extract sectors (depth 1) and their leaf tiles (depth 2)
  const sectors: MobileTreemapSector[] = h.children?.map((secNode: any) => {
    const tiles: MobileTreemapLeaf[] = (secNode.children ?? [])
      .map((l: any) => ({
        x0: Math.round(l.x0),
        y0: Math.round(l.y0),
        x1: Math.round(l.x1),
        y1: Math.round(l.y1),
        company: l.data.meta?.companyData || l.data,
      }))
      .filter((l: MobileTreemapLeaf) => (l.x1 - l.x0) >= 2 && (l.y1 - l.y0) >= 2);

    return {
      name: secNode.data.name,
      x0: Math.round(secNode.x0),
      y0: Math.round(secNode.y0),
      x1: Math.round(secNode.x1),
      y1: Math.round(secNode.y1),
      tiles,
    };
  }) ?? [];

  return { width, height: layoutH, sectors };
}
