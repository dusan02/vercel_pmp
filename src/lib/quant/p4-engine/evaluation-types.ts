import { Instant } from './temporal-types.js';

export interface PositionValuation {
    readonly cik: string;
    readonly ticker: string;
    readonly shares: number;
    readonly closePrice: number;
    readonly marketValue: number;
}

export interface EquitySnapshot {
    readonly date: string;
    readonly cash: number;
    readonly positions: PositionValuation[];
    readonly nav: number;
}

export interface PerformanceMetrics {
    readonly totalReturnPct: number;
    readonly cagrPct: number;
    readonly maxDrawdownPct: number;
    readonly winRatePct: number;
    readonly profitFactor: number;
}

export interface TradeProvenance {
    readonly signalGeneratedAt: Instant;
    readonly score: number;
    readonly primaryFundamental: {
        readonly metric: string;
        readonly eventTime: string; // economicPeriodEnd
        readonly knownAt: Instant;  // acceptanceDateTime
        readonly version: number;   // 1 for original, >1 for restatements
    };
}

export interface TradeRecord {
    readonly tradeId: string;
    readonly cik: string;
    readonly ticker: string;
    
    readonly entryDate: Instant;
    readonly entryGrossPrice: number;
    readonly entrySlippage: number;
    readonly entryFees: number;
    readonly shares: number;
    
    readonly exitDate: Instant;
    readonly exitGrossPrice: number;
    readonly exitSlippage: number;
    readonly exitFees: number;

    readonly grossPnL: number;
    readonly netPnL: number;
    
    readonly provenance: TradeProvenance;
}

export interface AttributionReport {
    readonly totalNetPnL: number;
    readonly totalGrossPnL: number;
    readonly slippageDrag: number;
    readonly feeDrag: number;
}
