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
  
  // Financial Services companies incorrectly in Technology
  JPM: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'JPMorgan Chase & Co.',
  },
  BAC: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Bank of America Corporation',
  },
  WFC: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Wells Fargo & Company',
  },
  GS: {
    sector: 'Financial Services',
    industry: 'Investment Services',
    name: 'The Goldman Sachs Group, Inc.',
  },
  MS: {
    sector: 'Financial Services',
    industry: 'Investment Services',
    name: 'Morgan Stanley',
  },
  C: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Citigroup Inc.',
  },
  AXP: {
    sector: 'Financial Services',
    industry: 'Credit Services',
    name: 'American Express Company',
  },
  COF: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Capital One Financial Corporation',
  },
  USB: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'U.S. Bancorp',
  },
  PNC: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'The PNC Financial Services Group, Inc.',
  },
  BRK_A: {
    sector: 'Financial Services',
    industry: 'Insurance',
    name: 'Berkshire Hathaway Inc. Class A',
  },
  BRK_B: {
    sector: 'Financial Services',
    industry: 'Insurance',
    name: 'Berkshire Hathaway Inc. Class B',
  },
  AIG: {
    sector: 'Financial Services',
    industry: 'Insurance',
    name: 'American International Group, Inc.',
  },
  MET: {
    sector: 'Financial Services',
    industry: 'Insurance',
    name: 'MetLife, Inc.',
  },
  PRU: {
    sector: 'Financial Services',
    industry: 'Insurance',
    name: 'Prudential Financial, Inc.',
  },
  
  // Energy companies incorrectly in Technology
  XOM: {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'Exxon Mobil Corporation',
  },
  CVX: {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'Chevron Corporation',
  },
  COP: {
    sector: 'Energy',
    industry: 'Oil & Gas E&P',
    name: 'ConocoPhillips',
  },
  SHEL: {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'Shell plc',
  },
  BP: {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'BP p.l.c.',
  },
  TTE: {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'TotalEnergies SE',
  },
  EOG: {
    sector: 'Energy',
    industry: 'Oil & Gas E&P',
    name: 'EOG Resources, Inc.',
  },
  SLB: {
    sector: 'Energy',
    industry: 'Oil & Gas Equipment & Services',
    name: 'Schlumberger Limited',
  },
  PSX: {
    sector: 'Energy',
    industry: 'Oil & Gas Refining & Marketing',
    name: 'Phillips 66',
  },
  VLO: {
    sector: 'Energy',
    industry: 'Oil & Gas Refining & Marketing',
    name: 'Valero Energy Corporation',
  },
  
  // Healthcare companies incorrectly in Technology
  JNJ: {
    sector: 'Healthcare',
    industry: 'Drug Manufacturers - General',
    name: 'Johnson & Johnson',
  },
  PFE: {
    sector: 'Healthcare',
    industry: 'Drug Manufacturers - General',
    name: 'Pfizer Inc.',
  },
  UNH: {
    sector: 'Healthcare',
    industry: 'Healthcare Plans',
    name: 'UnitedHealth Group Incorporated',
  },
  ABBV: {
    sector: 'Healthcare',
    industry: 'Drug Manufacturers - General',
    name: 'AbbVie Inc.',
  },
  LLY: {
    sector: 'Healthcare',
    industry: 'Drug Manufacturers - General',
    name: 'Eli Lilly and Company',
  },
  MRK: {
    sector: 'Healthcare',
    industry: 'Drug Manufacturers - General',
    name: 'Merck & Co., Inc.',
  },
  ABT: {
    sector: 'Healthcare',
    industry: 'Medical Devices',
    name: 'Abbott Laboratories',
  },
  DHR: {
    sector: 'Healthcare',
    industry: 'Medical Instruments & Supplies',
    name: 'Danaher Corporation',
  },
  MDT: {
    sector: 'Healthcare',
    industry: 'Medical Devices',
    name: 'Medtronic plc',
  },
  
  // Consumer companies incorrectly in Technology
  WMT: {
    sector: 'Consumer Defensive',
    industry: 'Discount Stores',
    name: 'Walmart Inc.',
  },
  COST: {
    sector: 'Consumer Defensive',
    industry: 'Discount Stores',
    name: 'Costco Wholesale Corporation',
  },
  HD: {
    sector: 'Consumer Cyclical',
    industry: 'Home Improvement Retail',
    name: 'The Home Depot, Inc.',
  },
  MCD: {
    sector: 'Consumer Cyclical',
    industry: 'Restaurants',
    name: 'McDonald\'s Corporation',
  },
  NKE: {
    sector: 'Consumer Cyclical',
    industry: 'Apparel Manufacturing',
    name: 'NIKE, Inc.',
  },
  LOW: {
    sector: 'Consumer Cyclical',
    industry: 'Home Improvement Retail',
    name: 'Lowe\'s Companies, Inc.',
  },
  TGT: {
    sector: 'Consumer Cyclical',
    industry: 'Discount Stores',
    name: 'Target Corporation',
  },
  KR: {
    sector: 'Consumer Defensive',
    industry: 'Grocery Stores',
    name: 'The Kroger Co.',
  },
  CL: {
    sector: 'Consumer Defensive',
    industry: 'Household & Personal Products',
    name: 'Colgate-Palmolive Company',
  },
  PG: {
    sector: 'Consumer Defensive',
    industry: 'Household & Personal Products',
    name: 'Procter & Gamble Company',
  },
  
  // Communication Services companies incorrectly in Technology
  T: {
    sector: 'Communication Services',
    industry: 'Telecom Services',
    name: 'AT&T Inc.',
  },
};

