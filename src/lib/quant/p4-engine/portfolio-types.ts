import { Signal, SignalDirection } from './signal-types.js';
import { Instant } from './temporal-types.js';

export interface PortfolioConfig {
    readonly maxPositions: number;           // e.g., 20
    readonly maxWeightPerPosition: number;   // e.g., 0.05 (5%)
    readonly maxSectorWeight: number;        // e.g., 0.25 (25%)
    readonly minCashBuffer: number;          // e.g., 0.02 (2%)
    readonly turnoverThreshold: number;      // e.g., 0.01 (1%) ignored
}

export interface PortfolioPosition {
    readonly cik: string;
    readonly ticker: string;
    readonly shares: number;
}

export interface PortfolioState {
    readonly cash: number;
    readonly positions: ReadonlyArray<Readonly<PortfolioPosition>>;
    readonly observationTime: Instant;
}

export interface SecurityMetadata {
    readonly cik: string;
    readonly sector: string;
}

export type PortfolioAction = "BUY" | "SELL" | "HOLD" | "REJECTED_BY_PORTFOLIO" | "NO_ACTION";

export interface TargetPosition {
    readonly cik: string;
    readonly ticker: string;
    readonly targetWeight: number; 
    readonly action: PortfolioAction;
    readonly reason: string;
}

export interface AllocationDecision {
    readonly cik: string;
    readonly ticker: string;
    readonly action: PortfolioAction;
    readonly reason: string;
    readonly signalScore: number | null;
    readonly portfolioRank: number | null;
    readonly targetWeight: number;
}
