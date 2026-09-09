import { Instant } from './temporal-types.js';

export type FeatureAvailability = 
    | "AVAILABLE"
    | "MISSING"
    | "INSUFFICIENT_HISTORY"
    | "NOT_APPLICABLE"
    | "INVALID";

export interface ValidatedFeature<T> {
    readonly key: string;
    readonly value: T | null;
    readonly knownAt: Instant;
    readonly periodStart: string | null;
    readonly periodEnd: string | null;
    readonly source: string;
    readonly accession: string | null;
    readonly availability: FeatureAvailability;
}

export interface ImmutableFeatures {
    readonly epsSurprisePct: ValidatedFeature<number>;
    readonly revenueAccelerationPct: ValidatedFeature<number>;
    readonly marginExpansionBps: ValidatedFeature<number>;
    readonly estimateRevisionsPct: ValidatedFeature<number>;
    readonly priceStrengthPct: ValidatedFeature<number>;
}

export interface ScoringInput {
    readonly cik: string;
    readonly observationTime: Instant;
    readonly features: ImmutableFeatures;
}

export interface ScoreComponent {
    readonly name: string;
    readonly points: number;
    readonly reason: string;
}

export interface EarlyWinnerScore {
    readonly total: number;
    readonly components: ReadonlyArray<Readonly<ScoreComponent>>;
}

export interface ScoringEngineContract {
    calculateScore(input: ScoringInput): EarlyWinnerScore;
}

export interface RankedResult {
    readonly cik: string;
    readonly score: EarlyWinnerScore;
    readonly rank: number;
}
