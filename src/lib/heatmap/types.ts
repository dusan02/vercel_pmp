import type { HierarchyNode } from 'd3-hierarchy';

export type HeatmapTimeframe = 'day' | 'week' | 'month';
export type HeatmapMetric = 'percent' | 'mcap';
export type SectorLabelVariant = 'compact' | 'full';

/**
 * Input data for one company in the heatmap.
 * Kept in `src/lib` so utilities/hooks can depend on it without importing React components.
 */
export type CompanyNode = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  changePercent: number;
  marketCapDiff?: number;
  marketCapDiffAbs?: number;
  currentPrice?: number;
  /** Whether the price used to compute change is stale (session-aware). */
  isStale?: boolean;
  /** ISO timestamp for the price used to compute change (best-effort). */
  lastUpdated?: string;
  /** Custom formatted value to display (overrides default formatting) */
  displayValue?: string;
};

/**
 * Internal structure used for building D3 hierarchy.
 */
export interface HierarchyData {
  name: string;
  children?: HierarchyData[];
  value?: number;
  meta?: {
    type: 'root' | 'sector' | 'industry' | 'company';
    companyData?: CompanyNode;
    // Aggregates for sectors/industries
    totalMarketCap?: number;
    weightedPercentSum?: number;
    weightedAvgPercent?: number;
    companyCount?: number;
  };
}

/**
 * Leaf node (company) after D3 treemap layout.
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
 * Node (sector/industry) after D3 treemap layout.
 */
export type TreemapNode = HierarchyNode<HierarchyData> & {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

