/**
 * EarlyWinner Scoring Engine
 * ============================
 *
 * Combines features from all providers into a weighted, rank-based score.
 *
 * Algorithm:
 *   1. Collect features from all providers
 *   2. Verify feature registry completeness (no silent missing features)
 *   3. Run PIT gate (fail closed)
 *   4. For each category:
 *      a. Filter to available features (value !== null, availability === AVAILABLE)
 *      b. Compute cross-sectional percentile rank per feature
 *      c. Average ranks within category → rawScore (0-100)
 *      d. weightedScore = rawScore * categoryWeight
 *      e. Mark isPartial if not all expected features available
 *   5. totalScore = sum of weightedScores
 *   6. maxPossibleScore = sum of available category weights * 100
 *
 * Determinism:
 *   - Percentile ranking uses deterministic tie-breaking (by securityId)
 *   - Same input → same output, bit-for-bit
 *   - No generatedAt timestamp (would break reproducibility)
 *   - No randomness anywhere
 *
 * Weights are FROZEN at 35/30/25/10. No optimization.
 * Partial categories are flagged but NOT renormalized.
 */

import { PrismaClient } from '../../p4-engine/db/client';
import {
  EwFeature,
  EwScore,
  EwRankedScore,
  EwUniverseResult,
  EwScoringEngine,
  FeatureCategory,
  FeatureProvider,
  CategoryScore,
  UniverseDefinition,
  ExcludedSecurity,
  CATEGORY_WEIGHTS,
  FROZEN_WEIGHTS_VERSION,
  FEATURE_SET_VERSION,
  PitViolation,
} from './types.js';
import { PitGate as PitGateImpl } from './pit-gate.js';
import {
  FEATURE_REGISTRY,
  getFeaturesByCategory,
  getExpectedFeatureKeys,
} from './feature-registry.js';
import { SecFundamentalsProvider } from './providers/sec-fundamentals.js';
import { PriceMomentumProvider } from './providers/price-momentum.js';
import { ConsensusEarningsProvider } from './providers/consensus-earnings.js';

const ENGINE_VERSION = 'EW-ENGINE-v1';

/**
 * SDD-v1 contract: compute category rawScore from available features.
 *
 * Rule (SDD-v1 Decision 2):
 *   rawScore = average(percentileRank(f) for f in availableFeatures)
 *   - Equal weight among AVAILABLE features (no intra-category weights)
 *   - MISSING features are excluded from average (not zeroed)
 *   - If ALL features MISSING/BLOCKED → rawScore = null
 *   - Single security (no cross-section) → rawScore = null
 *
 * This is a pure function exported for contract testing.
 */
export function computeCategoryRawScore(
  availableFeatures: EwFeature[],
  featureRanks: Map<string, number>,
  isBlocked: boolean,
  isSingleSecurity: boolean
): number | null {
  if (isBlocked) return null;
  if (availableFeatures.length === 0) return null;
  if (isSingleSecurity) return null;
  if (featureRanks.size === 0) return null;

  const ranks = availableFeatures
    .map(f => featureRanks.get(f.key))
    .filter((r): r is number => r !== undefined);

  return ranks.length > 0 ? ranks.reduce((s, r) => s + r, 0) / ranks.length : null;
}

interface SecurityFeatures {
  securityId: string;
  features: EwFeature[];
}

export class EwEngine implements EwScoringEngine {
  private providers: FeatureProvider[];
  private pitGate: PitGateImpl;

  constructor(private prisma: PrismaClient) {
    this.providers = [
      new ConsensusEarningsProvider(), // EARNINGS (blocked)
      new SecFundamentalsProvider(prisma), // FUNDAMENTALS + QUALITY
      new PriceMomentumProvider(prisma), // MOMENTUM
    ];
    this.pitGate = new PitGateImpl();
  }

  async score(securityId: string, asOfTime: string): Promise<EwScore> {
    // 1. Collect features from all providers
    const allFeatures = await this.collectFeatures(securityId, asOfTime);

    // 2. Verify feature registry completeness
    this.verifyRegistryCompleteness(allFeatures, securityId);

    // 3. PIT gate
    const pitResult = this.pitGate.validate(allFeatures, asOfTime);

    if (!pitResult.passed) {
      return this.buildFailedScore(securityId, asOfTime, allFeatures, pitResult.violations, null);
    }

    // 4. Score (single security — no cross-section, rawScore=null)
    return this.buildScore(securityId, asOfTime, allFeatures, true, [], null);
  }

  async scoreUniverse(securityIds: string[], asOfTime: string): Promise<EwUniverseResult> {
    // 1. Collect features for all securities
    const allSecurityFeatures: SecurityFeatures[] = [];
    const excluded: ExcludedSecurity[] = [];

    for (const secId of securityIds) {
      const features = await this.collectFeatures(secId, asOfTime);
      this.verifyRegistryCompleteness(features, secId);
      allSecurityFeatures.push({ securityId: secId, features });
    }

    // 2. PIT gate per security — track exclusions
    const validSecurities: SecurityFeatures[] = [];
    for (const sf of allSecurityFeatures) {
      const result = this.pitGate.validate(sf.features, asOfTime);
      if (result.passed) {
        validSecurities.push(sf);
      } else {
        excluded.push({
          securityId: sf.securityId,
          reason: 'PIT_GATE_FAILED',
          detail: result.violations.map(v => `${v.featureKey}:${v.violation}`).join('; '),
        });
      }
    }

    // 3. Cross-sectional percentile ranking per feature
    const featureKeys = this.extractFeatureKeys(validSecurities);
    const featureRanks = this.computeCrossSectionalRanks(validSecurities, featureKeys);

    // 4. Build universe definition
    const universeId = this.computeUniverseId(securityIds, asOfTime);
    const universe: UniverseDefinition = Object.freeze({
      universeId,
      asOfTime,
      requestedSecurityIds: Object.freeze(securityIds),
      includedSecurityIds: Object.freeze(validSecurities.map(sf => sf.securityId)),
      excludedSecurityIds: Object.freeze(excluded),
    });

    // 5. Build scores
    const scores = validSecurities.map(sf => {
      const ranks = featureRanks.get(sf.securityId) ?? new Map<string, number>();
      return this.buildRankedScore(sf.securityId, asOfTime, sf.features, ranks, true, [], universe);
    });

    // 6. Rank by totalScore DESC, securityId ASC (deterministic tie-break)
    scores.sort((a, b) => {
      if (b.score.totalScore !== a.score.totalScore) {
        return b.score.totalScore - a.score.totalScore;
      }
      return a.securityId.localeCompare(b.securityId);
    });

    const rankedScores = scores.map((s, i) => Object.freeze({ ...s, rank: i + 1 }));

    return Object.freeze({
      universe,
      rankedScores: Object.freeze(rankedScores),
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────

  private async collectFeatures(securityId: string, asOfTime: string): Promise<EwFeature[]> {
    const allFeatures: EwFeature[] = [];
    for (const provider of this.providers) {
      const features = await provider.computeFeatures(securityId, asOfTime);
      allFeatures.push(...features);
    }
    return allFeatures;
  }

  /**
   * Verifies that all features from the registry are present in the output.
   * Missing features must be explicitly MISSING/BLOCKED — they cannot silently disappear.
   */
  private verifyRegistryCompleteness(features: EwFeature[], securityId: string): void {
    const expectedKeys = getExpectedFeatureKeys();
    const actualKeys = new Set(features.map(f => f.key));

    const missing = expectedKeys.filter(k => !actualKeys.has(k));
    if (missing.length > 0) {
      throw new Error(
        `Feature registry violation: ${missing.length} expected features missing from ` +
        `provider output for security ${securityId}: [${missing.join(', ')}]. ` +
        `Providers must return ALL registry features (as MISSING/BLOCKED if unavailable).`
      );
    }
  }

  private computeUniverseId(securityIds: string[], asOfTime: string): string {
    // Deterministic hash of sorted security IDs + asOfTime
    const sorted = [...securityIds].sort();
    const input = `${asOfTime}|${sorted.join(',')}`;
    // Simple FNV-1a hash (deterministic, no crypto dependency needed)
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `universe-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  private extractFeatureKeys(securities: SecurityFeatures[]): string[] {
    const keys = new Set<string>();
    for (const sf of securities) {
      for (const f of sf.features) {
        if (f.value !== null && f.availability === 'AVAILABLE') {
          keys.add(f.key);
        }
      }
    }
    return Array.from(keys).sort();
  }

  private computeCrossSectionalRanks(
    securities: SecurityFeatures[],
    featureKeys: string[]
  ): Map<string, Map<string, number>> {
    const ranks = new Map<string, Map<string, number>>();

    for (const key of featureKeys) {
      const pairs: Array<{ securityId: string; value: number }> = [];
      for (const sf of securities) {
        const feature = sf.features.find(f => f.key === key && f.value !== null && f.availability === 'AVAILABLE');
        if (feature && feature.value !== null) {
          pairs.push({ securityId: sf.securityId, value: feature.value });
        }
      }

      // Sort by value ASC, then securityId ASC for deterministic tie-breaking
      pairs.sort((a, b) => {
        if (a.value !== b.value) return a.value - b.value;
        return a.securityId.localeCompare(b.securityId);
      });

      // Assign percentile ranks (0-100)
      const n = pairs.length;
      for (let i = 0; i < n; i++) {
        const percentile = n > 1 ? (i / (n - 1)) * 100 : 50;
        if (!ranks.has(pairs[i]!.securityId)) {
          ranks.set(pairs[i]!.securityId, new Map());
        }
        ranks.get(pairs[i]!.securityId)!.set(key, percentile);
      }
    }

    return ranks;
  }

  private buildScore(
    securityId: string,
    asOfTime: string,
    features: EwFeature[],
    pitPassed: boolean,
    pitViolations: readonly PitViolation[],
    universe: UniverseDefinition | null
  ): EwScore {
    // Single security: no cross-section → isSingleSecurity=true, rawScore=null
    const categoryScores = this.computeCategoryScores(features, new Map(), true, universe);

    const totalScore = Object.values(categoryScores).reduce(
      (sum, cs) => sum + cs.weightedScore, 0
    );
    const maxPossibleScore = Object.values(categoryScores).reduce(
      (sum, cs) => sum + (cs.isBlocked ? 0 : cs.weight * 100), 0
    );

    return Object.freeze({
      securityId,
      asOfTime,
      totalScore,
      maxPossibleScore,
      categoryScores: Object.freeze(categoryScores),
      features: Object.freeze(features),
      pitGatePassed: pitPassed,
      pitViolations: Object.freeze(pitViolations),
      engineVersion: ENGINE_VERSION,
      weightsVersion: FROZEN_WEIGHTS_VERSION,
      featureSetVersion: FEATURE_SET_VERSION,
      universeDefinition: universe,
    });
  }

  private buildRankedScore(
    securityId: string,
    asOfTime: string,
    features: EwFeature[],
    featureRanks: Map<string, number>,
    pitPassed: boolean,
    pitViolations: readonly PitViolation[],
    universe: UniverseDefinition
  ): EwRankedScore {
    const categoryScores = this.computeCategoryScores(features, featureRanks, false, universe);

    const totalScore = Object.values(categoryScores).reduce(
      (sum, cs) => sum + cs.weightedScore, 0
    );
    const maxPossibleScore = Object.values(categoryScores).reduce(
      (sum, cs) => sum + (cs.isBlocked ? 0 : cs.weight * 100), 0
    );

    const score: EwScore = Object.freeze({
      securityId,
      asOfTime,
      totalScore,
      maxPossibleScore,
      categoryScores: Object.freeze(categoryScores),
      features: Object.freeze(features),
      pitGatePassed: pitPassed,
      pitViolations: Object.freeze(pitViolations),
      engineVersion: ENGINE_VERSION,
      weightsVersion: FROZEN_WEIGHTS_VERSION,
      featureSetVersion: FEATURE_SET_VERSION,
      universeDefinition: universe,
    });

    return Object.freeze({ securityId, score, rank: 0 });
  }

  private computeCategoryScores(
    features: EwFeature[],
    featureRanks: Map<string, number>,
    isSingleSecurity: boolean,
    universe: UniverseDefinition | null
  ): Record<FeatureCategory, CategoryScore> {
    const categories: FeatureCategory[] = ['EARNINGS', 'FUNDAMENTALS', 'MOMENTUM', 'QUALITY'];
    const result = {} as Record<FeatureCategory, CategoryScore>;

    for (const category of categories) {
      const catFeatures = features.filter(f => f.category === category);
      const availableFeatures = catFeatures.filter(f => f.value !== null && f.availability === 'AVAILABLE');
      const expectedFeatures = getFeaturesByCategory(category);
      const isBlocked = catFeatures.every(f => f.availability === 'BLOCKED');
      const isPartial = !isBlocked && availableFeatures.length < expectedFeatures.length;

      const rawScore = computeCategoryRawScore(availableFeatures, featureRanks, isBlocked, isSingleSecurity);
      const weightedScore = rawScore !== null ? rawScore * CATEGORY_WEIGHTS[category] : 0;

      // Find provider versions for this category (multi-category providers supported)
      const providerVersions = this.providers
        .filter(p => p.categories.includes(category))
        .map(p => p.version);

      result[category] = Object.freeze({
        category,
        weight: CATEGORY_WEIGHTS[category],
        rawScore,
        weightedScore,
        featureCount: catFeatures.length,
        availableFeatureCount: availableFeatures.length,
        expectedFeatureCount: expectedFeatures.length,
        isBlocked,
        isPartial,
        isSingleSecurity,
        providerVersions: Object.freeze(providerVersions),
      });
    }

    return result;
  }

  private buildFailedScore(
    securityId: string,
    asOfTime: string,
    features: EwFeature[],
    violations: readonly PitViolation[],
    universe: UniverseDefinition | null
  ): EwScore {
    const categoryScores = this.computeCategoryScores(features, new Map(), true, universe);

    return Object.freeze({
      securityId,
      asOfTime,
      totalScore: 0,
      maxPossibleScore: 0,
      categoryScores: Object.freeze(categoryScores),
      features: Object.freeze(features),
      pitGatePassed: false,
      pitViolations: Object.freeze(violations),
      engineVersion: ENGINE_VERSION,
      weightsVersion: FROZEN_WEIGHTS_VERSION,
      featureSetVersion: FEATURE_SET_VERSION,
      universeDefinition: universe,
    });
  }
}

export { FROZEN_WEIGHTS_VERSION, ENGINE_VERSION, FEATURE_SET_VERSION };
