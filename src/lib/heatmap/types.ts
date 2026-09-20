import type { HierarchyNode } from 'd3-hierarchy';

export type HeatmapTimeframe = 'day' | 'week' | 'month';
export type HeatmapMetric =
  // Performance
  | 'percent'        // day change % vs prevClose
  | 'mcap'           // market cap change ($B)
  | 'week'           // 1-week change % (price vs close 5 sessions back)
  | 'month'          // 1-month change % (DailyValuationHistory close ~30d back)
  | 'ytd'            // year-to-date change %
  | 'year'           // 1-year change %
  // Scores (own computations, AnalysisCache)
  | 'health'         // AnalysisCache.healthScore (0-100)
  | 'valuation'      // AnalysisCache.valuationScore (0-100)
  | 'growth'         // AnalysisCache.growthScore (0-100)
  | 'profitability'  // AnalysisCache.profitabilityScore (0-100)
  | 'quality'        // AnalysisCache.qualityScore (0-100)
  | 'piotroski'      // AnalysisCache.piotroskiScore (0-9)
  | 'altman'         // AnalysisCache.altmanZ (higher = safer)
  | 'beneish'        // AnalysisCache.beneishScore (lower = better, inverted)
  // Valuation ratios (FinnhubMetrics — lower = cheaper = green)
  | 'pe'             // P/E TTM
  | 'fpe'            // forward P/E
  | 'ps'             // P/S TTM
  | 'pb'             // P/B
  | 'peg'            // PEG TTM
  | 'evebitda'       // EV/EBITDA TTM
  // Fundamentals (FinnhubMetrics / AnalysisCache — higher = better)
  | 'roe'            // ROE TTM %
  | 'netmargin'      // net margin %
  | 'revgrowth'      // revenue growth %
  | 'epsgrowth'      // EPS growth %
  | 'divyield'       // dividend yield %
  | 'fcfmargin'      // FCF margin %
  // Activity / risk
  | 'rvol'           // relative volume
  | 'beta'           // beta (lower = safer, inverted)
  | 'zscore';        // Ticker.latestMoversZScore
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
  /** 1-week % change (current price vs close ~5 sessions back) */
  weekChange?: number | undefined;
  healthScore?: number | undefined;
  valuationScore?: number | undefined;
  growthScore?: number | undefined;
  profitabilityScore?: number | undefined;
  qualityScore?: number | undefined;
  piotroskiScore?: number | undefined;
  zScore?: number | undefined;
  /** 1-month / YTD / 1-year % change (DailyValuationHistory closes) */
  monthChange?: number | undefined;
  ytdChange?: number | undefined;
  yearChange?: number | undefined;
  altmanZ?: number | undefined;
  beneishScore?: number | undefined;
  fcfMargin?: number | undefined;
  rvol?: number | undefined;
  // FinnhubMetrics
  peRatio?: number | undefined;
  forwardPe?: number | undefined;
  psRatio?: number | undefined;
  pbRatio?: number | undefined;
  pegRatio?: number | undefined;
  evEbitda?: number | undefined;
  roe?: number | undefined;
  netMargin?: number | undefined;
  revenueGrowth?: number | undefined;
  earningsGrowth?: number | undefined;
  dividendYield?: number | undefined;
  beta?: number | undefined;
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

