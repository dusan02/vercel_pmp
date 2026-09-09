/**
 * EARLYWINNERS DATA CONTRACT
 * Strict Point-in-Time Schema Definition
 */

// ==========================================
// 1. SECURITIES MASTER
// ==========================================

export interface TickerMapping {
  ticker: string;
  effectiveFrom: Date; // Inclusive
  effectiveTo: Date | null; // Exclusive. Null means currently active
}

/**
 * Ticker is NEVER the primary identity. CIK (Central Index Key) is the permanent identity.
 */
export interface SecurityIdentity {
  cik: string; 
  polygonId?: string; // Internal Polygon ID for fallback
  companyName: string;
  isDelisted: boolean;
  tickerHistory: TickerMapping[];
}

// ==========================================
// 2. PIT FUNDAMENTALS (SEC)
// ==========================================

export type SecFormType = '10-Q' | '10-Q/A' | '10-K' | '10-K/A' | '8-K';

export interface SecFilingMetadata {
  accessionNumber: string; // Globally unique identifier of the filing
  cik: string;
  formType: SecFormType;
  isAmended: boolean;
  economicPeriodEnd: Date; // e.g., Quarter End Date
  acceptanceDatetime: Date; // The EXACT moment it hit SEC EDGAR
}

export interface FinancialObservation {
  filing: SecFilingMetadata;
  metricName: 'EPS' | 'REVENUE';
  value: number;
  xbrlContextRef: string; // The specific ~90-day XBRL context used
}

// ==========================================
// 3. MARKET DATA (POLYGON)
// ==========================================

export type MarketGapClassification = 'EXCHANGE_CLOSED' | 'HALTED' | 'DATA_MISSING' | 'DELISTED';

export interface MarketBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose: number;
  isMissing: boolean;
  gapClassification?: MarketGapClassification; // Must be filled if isMissing is true
}

export interface CorporateAction {
  exDate: string;
  actionType: 'SPLIT' | 'DIVIDEND' | 'SPINOFF';
  ratioOrAmount: number;
}

// ==========================================
// 4. SIGNALS & EXECUTION
// ==========================================

export interface SignalObservation {
  cik: string;
  informationAvailableAt: Date; // From PIT Layer
  signalName: string;
  signalValue: number;
}

export interface ExecutionPolicy {
  resolveTradableAt(informationAvailableAt: Date): Date;
  execute(tradableAt: Date, signal: SignalObservation): void;
}
