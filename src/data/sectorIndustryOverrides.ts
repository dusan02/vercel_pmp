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
  
  // ADRs/Foreign Tickers missing metadata in Polygon v3
  ARM: {
    sector: 'Technology',
    industry: 'Semiconductors',
    name: 'Arm Holdings plc',
  },
  BABA: {
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    name: 'Alibaba Group Holding Limited',
  },
  BCS: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Barclays PLC',
  },
  ABEV: {
    sector: 'Consumer Defensive',
    industry: 'Beverages - Brewers',
    name: 'Ambev S.A.',
  },
  BHP: {
    sector: 'Basic Materials',
    industry: 'Other Industrial Metals & Mining',
    name: 'BHP Group Limited',
  },
  B: {
    sector: 'Basic Materials',
    industry: 'Gold',
    name: 'Barrick Gold Corporation',
  },
  
  // Sector/Industry corrections
  CCL: {
    sector: 'Consumer Cyclical',
    industry: 'Travel Services',
    name: 'Carnival Corporation & plc',
  },
  ALB: {
    sector: 'Basic Materials',
    industry: 'Specialty Chemicals',
    name: 'Albemarle Corporation',
  },
  AMCR: {
    sector: 'Consumer Cyclical',
    industry: 'Packaging & Containers',
    name: 'Amcor plc',
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
  
  // Consumer Staples companies
  PM: {
    sector: 'Consumer Staples',
    industry: 'Tobacco',
    name: 'Philip Morris International Inc.',
  },
  
  // Technology companies
  TSM: {
    sector: 'Technology',
    industry: 'Semiconductors',
    name: 'Taiwan Semiconductor Manufacturing Company Limited',
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
  'BRK.A': {
    sector: 'Financial Services',
    industry: 'Insurance',
    name: 'Berkshire Hathaway Inc. Class A',
  },
  'BRK.B': {
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

  // International companies with "International" sector - need proper sector mapping
  PUK: {
    sector: 'Consumer Defensive',
    industry: 'Beverages - Alcoholic',
    name: 'Prudential plc',
  },
  NTR: {
    sector: 'Basic Materials',
    industry: 'Other Industrial Metals & Mining',
    name: 'Nutrien Ltd.',
  },
  GFI: {
    sector: 'Basic Materials',
    industry: 'Gold',
    name: 'Gold Fields Limited',
  },
  JD: {
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    name: 'JD.com Inc.',
  },
  MT: {
    sector: 'Basic Materials',
    industry: 'Other Industrial Metals & Mining',
    name: 'ArcelorMittal S.A.',
  },
  TRI: {
    sector: 'Industrials',
    industry: 'Specialty Industrial Machinery',
    name: 'Thomson Reuters Corporation',
  },
  DEO: {
    sector: 'Consumer Defensive',
    industry: 'Beverages - Alcoholic',
    name: 'Diageo plc',
  },
  WCN: {
    sector: 'Industrials',
    industry: 'Waste Management',
    name: 'Waste Connections Inc.',
  },
  ESLT: {
    sector: 'Industrials',
    industry: 'Aerospace & Defense',
    name: 'Elbit Systems Ltd.',
  },
  ARGX: {
    sector: 'Healthcare',
    industry: 'Biotechnology',
    name: 'Argenx SE',
  },
  CCEP: {
    sector: 'Consumer Defensive',
    industry: 'Beverages - Non-Alcoholic',
    name: 'Coca-Cola Europacific Partners plc',
  },
  AU: {
    sector: 'Basic Materials',
    industry: 'Gold',
    name: 'AngloGold Ashanti Limited',
  },
  HLN: {
    sector: 'Healthcare',
    industry: 'Drug Manufacturers - General',
    name: 'Haleon plc',
  },
  NOK: {
    sector: 'Technology',
    industry: 'Communication Equipment',
    name: 'Nokia Corporation',
  },
  CCJ: {
    sector: 'Basic Materials',
    industry: 'Other Industrial Metals & Mining',
    name: 'Cameco Corporation',
  },
  WDS: {
    sector: 'Energy',
    industry: 'Oil & Gas Equipment & Services',
    name: 'Schlumberger Limited',
  },
  ASX: {
    sector: 'Basic Materials',
    industry: 'Other Industrial Metals & Mining',
    name: 'Aperam S.A.',
  },
  CVE: {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'Cenovus Energy Inc.',
  },
  INFY: {
    sector: 'Technology',
    industry: 'Information Technology Services',
    name: 'Infosys Limited',
  },
  WPM: {
    sector: 'Basic Materials',
    industry: 'Gold',
    name: 'Wheaton Precious Metals Corp.',
  },
  DB: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Deutsche Bank AG',
  },
  NWG: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'NatWest Group plc',
  },
  RACE: {
    sector: 'Consumer Cyclical',
    industry: 'Apparel Manufacturing',
    name: 'Ferrari N.V.',
  },
  RELX: {
    sector: 'Industrials',
    industry: 'Specialty Industrial Machinery',
    name: 'RELX PLC',
  },
  IMO: {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'Imperial Oil Limited',
  },
  BNS: {
    sector: 'Industrials',
    industry: 'Railroads',
    name: 'Canadian National Railway Company',
  },
  CP: {
    sector: 'Industrials',
    industry: 'Railroads',
    name: 'Canadian Pacific Railway Limited',
  },
  MFG: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Mizuho Financial Group Inc.',
  },
  ENB: {
    sector: 'Energy',
    industry: 'Oil & Gas Midstream',
    name: 'Enbridge Inc.',
  },
  BTI: {
    sector: 'Consumer Defensive',
    industry: 'Tobacco',
    name: 'British American Tobacco p.l.c.',
  },
  IBN: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'ICICI Bank Limited',
  },
  CRH: {
    sector: 'Basic Materials',
    industry: 'Construction Materials',
    name: 'CRH plc',
  },
  AEM: {
    sector: 'Basic Materials',
    industry: 'Gold',
    name: 'Agnico Eagle Mines Limited',
  },
  APD: {
    sector: 'Basic Materials',
    industry: 'Chemicals',
    name: 'Air Products and Chemicals Inc.',
  },
  KMI: {
    sector: 'Energy',
    industry: 'Oil & Gas Midstream',
    name: 'Kinder Morgan Inc.',
  },
  ELV: {
    sector: 'Healthcare',
    industry: 'Healthcare Plans',
    name: 'Elevance Health Inc.',
  },
  NSC: {
    sector: 'Industrials',
    industry: 'Railroads',
    name: 'Norfolk Southern Corporation',
  },
  GBTC: {
    sector: 'Financial Services',
    industry: 'Asset Management',
    name: 'Grayscale Bitcoin Trust',
  },
  HLT: {
    sector: 'Consumer Cyclical',
    industry: 'Travel Services',
    name: 'Hilton Worldwide Holdings Inc.',
  },
  ET: {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'Energy Transfer LP',
  },
  AEP: {
    sector: 'Utilities',
    industry: 'Utilities - Regulated Electric',
    name: 'American Electric Power Company Inc.',
  },
  SPG: {
    sector: 'Real Estate',
    industry: 'REIT - Retail',
    name: 'Simon Property Group Inc.',
  },
  REGN: {
    sector: 'Healthcare',
    industry: 'Biotechnology',
    name: 'Regeneron Pharmaceuticals Inc.',
  },
  ARES: {
    sector: 'Financial Services',
    industry: 'Asset Management',
    name: 'Ares Management Corporation',
  },
  DLR: {
    sector: 'Real Estate',
    industry: 'REIT - Industrial',
    name: 'Digital Realty Trust Inc.',
  },
  TEL: {
    sector: 'Industrials',
    industry: 'Electrical Equipment & Parts',
    name: 'TE Connectivity Ltd.',
  },
  FIG: {
    sector: 'Financial Services',
    industry: 'Investment Services',
    name: 'Figs Inc.',
  },
  WDAY: {
    sector: 'Technology',
    industry: 'Software—Application',
    name: 'Workday Inc.',
  },
  PWR: {
    sector: 'Industrials',
    industry: 'Construction Services',
    name: 'Quanta Services Inc.',
  },
  ROP: {
    sector: 'Industrials',
    industry: 'Specialty Industrial Machinery',
    name: 'Roper Technologies Inc.',
  },
  TRV: {
    sector: 'Financial Services',
    industry: 'Insurance',
    name: 'The Travelers Companies Inc.',
  },
  NU: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Nu Holdings Ltd.',
  },
  CNI: {
    sector: 'Industrials',
    industry: 'Railroads',
    name: 'Canadian National Railway Company',
  },
  AXON: {
    sector: 'Technology',
    industry: 'Software—Application',
    name: 'Axon Enterprise Inc.',
  },
  MNST: {
    sector: 'Consumer Cyclical',
    industry: 'Beverages - Non-Alcoholic',
    name: 'Monster Beverage Corporation',
  },
  CMG: {
    sector: 'Consumer Cyclical',
    industry: 'Restaurants',
    name: 'Chipotle Mexican Grill Inc.',
  },
  CARR: {
    sector: 'Industrials',
    industry: 'Aerospace & Defense',
    name: 'Carrier Global Corporation',
  },
  FCX: {
    sector: 'Basic Materials',
    industry: 'Other Industrial Metals & Mining',
    name: 'Freeport-McMoRan Inc.',
  },
  TCEHY: {
    sector: 'Technology',
    industry: 'Internet Content & Information',
    name: 'Tencent Holdings Limited',
  },
  EXPGF: {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'Exxon Mobil Corporation',
  },
  GLCNF: {
    sector: 'Basic Materials',
    industry: 'Other Industrial Metals & Mining',
    name: 'Glencore plc',
  },
  NPSNY: {
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    name: 'Nike Inc.',
  },
  GMBXF: {
    sector: 'Basic Materials',
    industry: 'Other Industrial Metals & Mining',
    name: 'Glencore plc',
  },
  NGG: {
    sector: 'Utilities',
    industry: 'Utilities - Regulated Electric',
    name: 'National Grid plc',
  },
  BMO: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Bank of Montreal',
  },
  RY: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Royal Bank of Canada',
  },
  HSBC: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'HSBC Holdings plc',
  },
  TM: {
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    name: 'Toyota Motor Corporation',
  },
  MUFG: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Mitsubishi UFJ Financial Group Inc.',
  },
  PDD: {
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    name: 'PDD Holdings Inc.',
  },
  SAP: {
    sector: 'Technology',
    industry: 'Software—Application',
    name: 'SAP SE',
  },
  JCI: {
    sector: 'Industrials',
    industry: 'Specialty Industrial Machinery',
    name: 'Johnson Controls International plc',
  },
  MELI: {
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    name: 'MercadoLibre Inc.',
  },
  BAM: {
    sector: 'Financial Services',
    industry: 'Asset Management',
    name: 'Brookfield Asset Management Ltd.',
  },
  SPOT: {
    sector: 'Technology',
    industry: 'Internet Content & Information',
    name: 'Spotify Technology S.A.',
  },
  NXP: {
    sector: 'Technology',
    industry: 'Semiconductors',
    name: 'NXP Semiconductors N.V.',
  },
  CM: {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'Canadian Imperial Bank of Commerce',
  },
  ALC: {
    sector: 'Healthcare',
    industry: 'Medical Devices',
    name: 'Alcon Inc.',
  },
  HMC: {
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    name: 'Honda Motor Co., Ltd.',
  },
  CRCL: {
    sector: 'Financial Services',
    industry: 'Asset Management',
    name: 'Circle Internet Group, Inc.',
  },
  FERG: {
    sector: 'Industrials',
    industry: 'Specialty Industrial Machinery',
    name: 'Ferguson Enterprises Inc.',
  },
  SONY: {
    sector: 'Technology',
    industry: 'Consumer Electronics',
    name: 'Sony Group Corporation',
  },
  TCOM: {
    sector: 'Consumer Cyclical',
    industry: 'Travel Services',
    name: 'Trip.com Group Limited',
  },
  };
