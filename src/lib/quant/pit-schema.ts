/**
 * EARLYWINNERS - POINT-IN-TIME (PIT) EVENT SCHEMA
 * 
 * Strictly follows the EarlyWinners PIT Constitution (3P.1).
 * Every data point ingested into the research engine must map to these types.
 */

export type EventSource = 'PMP_DB' | 'POLYGON' | 'FINNHUB' | 'MANUAL';

/**
 * The Constitutional Base for every event in the system.
 * Guarantees temporal integrity and strict revision lineage.
 */
export interface PITEventBase {
  eventId: string;                // Unique identifier for this specific data release
  securityId: string;             // Ticker or internal company ID (e.g., 'AAPL')
  
  // Temporal Pillars
  economicPeriod: string;           // MANDATORY: The strict economic context (e.g., "FY2023-Q3")
  effectiveAt: Date;              // When it economically occurred (e.g., Q3 end date)
  publishedAt: Date;              // Official release time (e.g., press release wire time)
  availableAt: Date;              // When it physically hit our ingest pipeline (NEVER artificially default to publishedAt)
  tradableAt: Date;               // The earliest market tick where a strategy could execute on this info
  
  // Structural Pillars
  source: EventSource;
  provenancePayloadId?: string;   // Link to raw JSON payload stored in blob/db for audit
  
  // Revision Lineage (Append-only restatements)
  replacedEventId?: string;       // If this is a correction, points to the original flawed event ID
  isCorrection: boolean;          // Explicit flag marking this as a restatement/amendment
}

// -----------------------------------------------------------------------------
// 1. FUNDAMENTAL ACTUALS (Earnings, Revenue)
// -----------------------------------------------------------------------------
export interface EarningsActualEvent extends PITEventBase {
  type: 'EARNINGS_ACTUAL';
  epsReported?: number;           // GAAP EPS
  epsAdjusted?: number;           // Non-GAAP / Core EPS
  revenueReported?: number;       
  revenueSurprise?: number;       // Difference from consensus AT THE TIME of publication
  epsSurprise?: number;
}

// -----------------------------------------------------------------------------
// 2. ANALYST ESTIMATES & REVISIONS
// -----------------------------------------------------------------------------
export interface EstimateEvent extends PITEventBase {
  type: 'ESTIMATE_REVISION' | 'CONSENSUS_UPDATE';
  targetPeriod: string;           // The future period being estimated (e.g. "FY2023-Q4")
  epsEstimateMean?: number;
  revenueEstimateMean?: number;
  analystCount?: number;
  // If this is an individual revision:
  analystFirm?: string;
  priorEpsEstimate?: number;
}

// -----------------------------------------------------------------------------
// 3. MANAGEMENT GUIDANCE
// -----------------------------------------------------------------------------
export interface GuidanceEvent extends PITEventBase {
  type: 'MANAGEMENT_GUIDANCE';
  targetPeriod: string;
  revenueGuidanceLow?: number;
  revenueGuidanceHigh?: number;
  epsGuidanceLow?: number;
  epsGuidanceHigh?: number;
}

// -----------------------------------------------------------------------------
// 4. ANALYST ACTIONS (Ratings, Price Targets)
// -----------------------------------------------------------------------------
export interface AnalystActionEvent extends PITEventBase {
  type: 'ANALYST_UPGRADE' | 'ANALYST_DOWNGRADE' | 'INITIATION' | 'PRICE_TARGET_CHANGE';
  firm: string;
  oldRating?: string;
  newRating?: string;
  oldPriceTarget?: number;
  newPriceTarget?: number;
}

// -----------------------------------------------------------------------------
// 5. CORPORATE ACTIONS (Splits, Dividends)
// -----------------------------------------------------------------------------
export interface CorporateActionEvent extends PITEventBase {
  type: 'SPLIT' | 'DIVIDEND_EX';
  // For Dividends
  dividendAmount?: number;
  dividendType?: 'REGULAR' | 'SPECIAL';
  // For Splits
  splitRatio?: number; // e.g. 2.0 for a 2:1 split
}

// -----------------------------------------------------------------------------
// 6. PRICE / VOLUME (Market Data)
// -----------------------------------------------------------------------------
export interface PriceVolumeEvent extends PITEventBase {
  type: 'PRICE_BAR';
  // For price, effectiveAt is the close of the bar. publishedAt/availableAt is exchange dissemination.
  resolution: '1D' | '1H' | '1M';
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

/**
 * Union type for the full Feature Store schema
 */
export type EarlyWinnersEvent = 
  | EarningsActualEvent 
  | EstimateEvent 
  | GuidanceEvent 
  | AnalystActionEvent 
  | CorporateActionEvent 
  | PriceVolumeEvent;
