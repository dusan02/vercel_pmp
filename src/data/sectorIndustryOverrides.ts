/**
 * Sector/Industry Overrides
 *
 * Some tickers (especially ADRs / international listings) occasionally end up in the DB with
 * missing or incorrect sector/industry (e.g. "Other", "Unrecognized").
 *
 * These overrides are applied at response time (stocks + heatmap) to keep UI correct
 * even if the underlying DB record isn't fixed yet.
 */

export type SectorIndustryOverride = {
  sector: string;
  industry: string;
  name?: string;
};

export const SECTOR_INDUSTRY_OVERRIDES: Record<string, SectorIndustryOverride> = {
  // Unilever plc ADR
  UL: {
    sector: 'Consumer Defensive',
    industry: 'Household & Personal Products',
    name: 'Unilever PLC',
  },
};

