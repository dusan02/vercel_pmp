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
  // Technology sector overrides (from Communication Services)
  GOOGL: {
    sector: 'Technology',
    industry: 'Internet Content & Information',
    name: 'Alphabet Inc. Class A',
  },
  GOOG: {
    sector: 'Technology',
    industry: 'Internet Content & Information',
    name: 'Alphabet Inc. Class C',
  },
  META: {
    sector: 'Technology',
    industry: 'Internet Content & Information',
    name: 'Meta Platforms Inc.',
  },
  
  // Unilever plc ADR
  UL: {
    sector: 'Consumer Defensive',
    industry: 'Household & Personal Products',
    name: 'Unilever PLC',
  },
  
  // Critical sector fixes for heatmap
  EQNR: {
    sector: 'Energy',
    industry: 'Oil & Gas E&P',
    name: 'Equinor ASA',
  },
  UBS: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'UBS Group AG',
  },
  BBVA: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Banco Bilbao Vizcaya Argentaria',
  },
};

