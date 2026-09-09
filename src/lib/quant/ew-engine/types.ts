/**
 * EarlyWinner Engine — Core Types
 * =================================
 *
 * Production types for the EarlyWinner scoring engine.
 * See docs/EW-ARCHITECTURE-CONTRACT.md for the full contract.
 *
 * Design principles:
 * 1. Every feature carries full PIT provenance (knownAt, availableAt, source, accession)
 * 2. Every feature has a confidence score (0-1) reflecting data quality
 * 3. PIT gate is mandatory — fail closed on any violation
 * 4. Category weights are FROZEN at 35/30/25/10 — no optimization
 * 5. Scoring is rank-based (cross-sectional percentile), NOT threshold-based
 * 6. Every score is fully reproducible (versioned + deterministic)
 * 7. Universe definition is part of the score output
 * 8. Feature registry guarantees no feature silently disappears
 */

import { FEATURE_SET_VERSION } from './feature-registry.js';

// ─── Categories ──────────────────────────────────────────────────────────

export type FeatureCategory = 'EARNINGS' | 'FUNDAMENTALS' | 'MOMENTUM' | 'QUALITY';

export const CATEGORY_WEIGHTS: Readonly<Record<FeatureCategory, number>> = Object.freeze({
  EARNINGS: 0.35,
  FUNDAMENTALS: 0.30,
  MOMENTUM: 0.25,
  QUALITY: 0.10,
});

export const FROZEN_WEIGHTS_VERSION = 'EW-WEIGHTS-v1-frozen';

// ─── Feature Sources ─────────────────────────────────────────────────────

export type FeatureSource = 'SEC' | 'CONSENSUS' | 'POLYGON' | 'DERIVED' | 'N/A';

export type FeatureAvailability =
  | 'AVAILABLE'
  | 'MISSING'
  | 'INSUFFICIENT_HISTORY'
  | 'NOT_APPLICABLE'
  | 'INVALID'
  | 'BLOCKED';

// ─── Feature Contract ────────────────────────────────────────────────────

export interface FeatureEvidence {
  readonly formula: string;
  readonly inputs: Readonly<Record<string, number | string | null>>;
  readonly periodEnd: string | null;
  readonly periodStart: string | null;
  readonly notes: string | null;
}

export interface EwFeature {
  readonly key: string;
  readonly category: FeatureCategory;
  readonly value: number | null;
  readonly knownAt: string;          // ISO timestamp — when value became knowable
  readonly availableAt: string;      // ISO timestamp — when value was ingested
  readonly source: FeatureSource;
  readonly accession: string | null;
  readonly confidence: number;       // 0-1
  readonly pitValid: boolean;
  readonly availability: FeatureAvailability;
  readonly evidence: FeatureEvidence;
}

// ─── Universe Definition ─────────────────────────────────────────────────

export interface UniverseDefinition {
  readonly universeId: string;       // deterministic hash of security set + asOfTime
  readonly asOfTime: string;
  readonly requestedSecurityIds: readonly string[];
  readonly includedSecurityIds: readonly string[];
  readonly excludedSecurityIds: readonly ExcludedSecurity[];
}

export interface ExcludedSecurity {
  readonly securityId: string;
  readonly reason: string;           // 'PIT_GATE_FAILED' | 'NO_FEATURES' | etc.
  readonly detail: string;
}

// ─── Category Score ──────────────────────────────────────────────────────

export interface CategoryScore {
  readonly category: FeatureCategory;
  readonly weight: number;
  readonly rawScore: number | null;  // 0-100 percentile rank, null if blocked/unavailable
  readonly weightedScore: number;    // rawScore * weight (0 if null)
  readonly featureCount: number;     // total features in category (from registry)
  readonly availableFeatureCount: number; // features with value !== null && AVAILABLE
  readonly expectedFeatureCount: number;  // from registry
  readonly isBlocked: boolean;       // provider not available
  readonly isPartial: boolean;       // some but not all features available
  readonly isSingleSecurity: boolean; // true when no cross-section available
  readonly providerVersions: readonly string[]; // versions of providers serving this category
}

// ─── Score ───────────────────────────────────────────────────────────────

export interface EwScore {
  readonly securityId: string;
  readonly asOfTime: string;
  readonly totalScore: number;       // 0-100 (may be < 100 if categories blocked/partial)
  readonly maxPossibleScore: number; // sum of available category weights * 100
  readonly categoryScores: Readonly<Record<FeatureCategory, CategoryScore>>;
  readonly features: Readonly<EwFeature[]>;
  readonly pitGatePassed: boolean;
  readonly pitViolations: readonly PitViolation[];
  // ─── Versioning (reproducibility) ───
  readonly engineVersion: string;
  readonly weightsVersion: string;
  readonly featureSetVersion: string;
  readonly universeDefinition: UniverseDefinition | null; // null for single-security score()
  // ─── Determinism ───
  // generatedAt is NOT included — it would break bit-for-bit reproducibility.
  // Use asOfTime as the temporal anchor. Caller can record wall-clock time separately.
}

export interface EwRankedScore {
  readonly securityId: string;
  readonly score: EwScore;
  readonly rank: number;
}

export interface EwUniverseResult {
  readonly universe: UniverseDefinition;
  readonly rankedScores: readonly EwRankedScore[];
}

// ─── PIT Gate ────────────────────────────────────────────────────────────

export interface PitViolation {
  readonly featureKey: string;
  readonly violation: string;
  readonly detail: string;
}

export interface PitGateResult {
  readonly passed: boolean;
  readonly violations: readonly PitViolation[];
}

// ─── Feature Provider Interface ──────────────────────────────────────────

/**
 * A feature provider computes features for one or more categories.
 * A single provider CAN serve multiple categories (e.g. SecFundamentalsProvider
 * serves both FUNDAMENTALS and QUALITY from the same SEC dataset).
 */
export interface FeatureProvider {
  readonly categories: readonly FeatureCategory[]; // CHANGED: was single `category`
  readonly version: string;

  computeFeatures(
    securityId: string,
    asOfTime: string
  ): Promise<EwFeature[]>;

  isAvailable(): boolean;
  describeStatus(): string;
}

// ─── Scoring Engine Interface ────────────────────────────────────────────

export interface EwScoringEngine {
  score(
    securityId: string,
    asOfTime: string
  ): Promise<EwScore>;

  scoreUniverse(
    securityIds: string[],
    asOfTime: string
  ): Promise<EwUniverseResult>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

export function makeMissingFeature(
  key: string,
  category: FeatureCategory,
  asOfTime: string,
  reason: string,
  availability: FeatureAvailability = 'MISSING'
): EwFeature {
  return Object.freeze({
    key,
    category,
    value: null,
    knownAt: asOfTime,
    availableAt: asOfTime,
    source: 'N/A',
    accession: null,
    confidence: 0,
    pitValid: true, // missing features don't violate PIT
    availability,
    evidence: Object.freeze({
      formula: 'N/A',
      inputs: Object.freeze({ reason }),
      periodEnd: null,
      periodStart: null,
      notes: reason,
    }),
  });
}

export function makeBlockedFeature(
  key: string,
  category: FeatureCategory,
  asOfTime: string,
  reason: string
): EwFeature {
  return makeMissingFeature(key, category, asOfTime, reason, 'BLOCKED');
}

// Re-export for convenience
export { FEATURE_SET_VERSION };
