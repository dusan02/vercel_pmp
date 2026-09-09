import { Instant } from './temporal-types.js';
import { UniverseCandidate } from './universe-types.js';
import { EarlyWinnerScore, ImmutableFeatures } from './scoring-types.js';

export interface SignalConfig {
    readonly version: string;
    readonly buyThreshold: number;
    readonly sellThreshold: number;
    readonly requireEps: boolean;
    readonly minAvailableFeatures: number;
}

export type SignalDirection = "BUY" | "SELL" | "HOLD";

export interface Signal {
    readonly cik: string;
    readonly ticker: string;
    readonly observationTime: Instant;
    readonly generatedAt: Instant;
    readonly maxInformationAvailableAt: Instant;
    
    readonly universeDecision: string; // e.g., "ELIGIBLE"
    readonly availabilityMask: string; // e.g., "11101"
    
    // Minimal footprint of features for evidence
    readonly featureValues: Readonly<Record<string, number | null>>;
    
    readonly score: number;
    readonly scoreVersion: string;
    readonly thresholdVersion: string;
    
    readonly direction: SignalDirection;
    readonly decisionReason: string;
}
