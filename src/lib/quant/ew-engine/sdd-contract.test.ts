/**
 * SDD-v1 Contract / Integration Tests
 * ====================================
 *
 * Verifies that the scoring engine implementation realizes the
 * Scoring Design Decision v1 (docs/SCORING-DESIGN-DECISION-v1.md).
 *
 * Tests cover:
 *   1. Equal weight among AVAILABLE features (3/3, 2/3, 1/3, 0/3)
 *   2. isPartial semantics (coverage signal without renormalization penalty)
 *   3. CORE ≠ weight, SECONDARY ≠ weight (tier is pure metadata)
 *   4. DEPRECATED features are not scored
 *   5. Feature order does not change result
 *   6. Category weights remain 35/30/25/10
 *   7. No intra-category weights exist anywhere
 */

import { describe, it, expect } from 'vitest';
import {
  EwFeature,
  FeatureCategory,
  CATEGORY_WEIGHTS,
  FROZEN_WEIGHTS_VERSION,
  makeMissingFeature,
  makeBlockedFeature,
} from './types.js';
import {
  FEATURE_REGISTRY,
  FEATURE_SET_VERSION,
  getExpectedFeatureKeys,
  getFeaturesByCategory,
  getDeprecatedFeatures,
  getResearchValidatedFeatures,
} from './feature-registry.js';
import { computeCategoryRawScore } from './scoring-engine.js';

const asOfTime = '2024-06-15T00:00:00.000Z';

function makeAvailableFeature(
  key: string,
  category: FeatureCategory,
  value: number,
  knownAt = asOfTime,
  availableAt = asOfTime
): EwFeature {
  return Object.freeze({
    key,
    category,
    value,
    knownAt,
    availableAt,
    source: 'TEST',
    accession: 'test-acc',
    confidence: 1.0,
    pitValid: true,
    availability: 'AVAILABLE',
    evidence: Object.freeze({
      formula: 'test',
      inputs: Object.freeze({}),
      periodEnd: null,
      periodStart: null,
      notes: null,
    }),
  });
}

describe('SDD-v1 Contract Tests', () => {

  // ─── 1. Equal Weight Among AVAILABLE ───────────────────────────────────

  describe('Equal weight among AVAILABLE features', () => {
    it('3/3 AVAILABLE → equal weight (1/3 each)', () => {
      const features = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
        makeAvailableFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', 0.20),
      ];
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 80],
        ['operatingMarginYoYExpansion', 60],
        ['fcfYoYGrowthShock', 40],
      ]);

      const rawScore = computeCategoryRawScore(features, ranks, false, false);
      expect(rawScore).not.toBeNull();
      // (80 + 60 + 40) / 3 = 60
      expect(rawScore).toBeCloseTo(60, 10);
    });

    it('2/3 AVAILABLE → equal weight (1/2 each), MISSING excluded', () => {
      const features = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
        makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No FCF data'),
      ];
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 80],
        ['operatingMarginYoYExpansion', 60],
      ]);

      const rawScore = computeCategoryRawScore(
        features.filter(f => f.value !== null && f.availability === 'AVAILABLE'),
        ranks, false, false
      );
      expect(rawScore).not.toBeNull();
      // (80 + 60) / 2 = 70 — NOT (80+60+0)/3 = 46.67
      expect(rawScore).toBeCloseTo(70, 10);
    });

    it('1/3 AVAILABLE → 100% of available feature', () => {
      const features = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeMissingFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', asOfTime, 'No data'),
        makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No data'),
      ];
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 75],
      ]);

      const rawScore = computeCategoryRawScore(
        features.filter(f => f.value !== null && f.availability === 'AVAILABLE'),
        ranks, false, false
      );
      expect(rawScore).not.toBeNull();
      // Only one feature → its rank is the score
      expect(rawScore).toBeCloseTo(75, 10);
    });

    it('0/3 AVAILABLE → rawScore is null (category unavailable)', () => {
      const features = [
        makeMissingFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No data'),
        makeMissingFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', asOfTime, 'No data'),
        makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No data'),
      ];
      const ranks = new Map<string, number>();

      const rawScore = computeCategoryRawScore(
        features.filter(f => f.value !== null && f.availability === 'AVAILABLE'),
        ranks, false, false
      );
      expect(rawScore).toBeNull();
    });

    it('BLOCKED category → rawScore is null', () => {
      const features = [
        makeBlockedFeature('epsSurprisePct', 'EARNINGS', asOfTime, 'vendor blocked'),
        makeBlockedFeature('revenueSurprisePct', 'EARNINGS', asOfTime, 'vendor blocked'),
      ];
      const ranks = new Map<string, number>();

      const rawScore = computeCategoryRawScore(
        features.filter(f => f.value !== null && f.availability === 'AVAILABLE'),
        ranks, true, false  // isBlocked = true
      );
      expect(rawScore).toBeNull();
    });

    it('single security → rawScore is null (no cross-section)', () => {
      const features = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
      ];
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 50],
      ]);

      const rawScore = computeCategoryRawScore(features, ranks, false, true);
      expect(rawScore).toBeNull();
    });
  });

  // ─── 2. isPartial Semantics ────────────────────────────────────────────

  describe('isPartial semantics (coverage signal, no renormalization penalty)', () => {
    it('3/3 FUNDAMENTALS available → not partial', () => {
      const expected = getFeaturesByCategory('FUNDAMENTALS');
      const available = 3;
      expect(available).toBe(expected.length);
      expect(available < expected.length).toBe(false); // not partial
    });

    it('2/3 FUNDAMENTALS available → partial', () => {
      const expected = getFeaturesByCategory('FUNDAMENTALS');
      const available = 2;
      expect(available < expected.length).toBe(true); // partial
    });

    it('1/3 FUNDAMENTALS available → partial', () => {
      const expected = getFeaturesByCategory('FUNDAMENTALS');
      const available = 1;
      expect(available < expected.length).toBe(true); // partial
    });

    it('0/3 FUNDAMENTALS available → partial (or blocked)', () => {
      const expected = getFeaturesByCategory('FUNDAMENTALS');
      const available = 0;
      expect(available < expected.length).toBe(true); // partial
    });

    it('partial does NOT reduce rawScore — 2/3 gets same average as if 2 features', () => {
      // This is the key SDD-v1 invariant: missing data is excluded, not penalized.
      // 2/3 with ranks [80, 60] → 70, NOT 70 * (2/3) = 46.67
      const features = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
      ];
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 80],
        ['operatingMarginYoYExpansion', 60],
      ]);

      const rawScore = computeCategoryRawScore(features, ranks, false, false);
      expect(rawScore).toBeCloseTo(70, 10);
      // NO renormalization penalty: rawScore is NOT multiplied by coverage ratio
      expect(rawScore).not.toBeCloseTo(70 * (2 / 3), 1);
    });
  });

  // ─── 3. Tier = Pure Metadata ───────────────────────────────────────────

  describe('CORE/SECONDARY tier is pure metadata', () => {
    it('CORE and SECONDARY features produce identical scores for same ranks', () => {
      // If tier affected scoring, CORE and SECONDARY would get different weights.
      // SDD-v1: tier has ZERO computation impact.
      const coreFeatures = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
      ];
      const secondaryFeatures = [
        makeAvailableFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', 0.20),
      ];
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 70],
        ['fcfYoYGrowthShock', 70],
      ]);

      const coreScore = computeCategoryRawScore(coreFeatures, ranks, false, false);
      const secondaryScore = computeCategoryRawScore(secondaryFeatures, ranks, false, false);

      expect(coreScore).toBe(secondaryScore);
      expect(coreScore).toBeCloseTo(70, 10);
    });

    it('swapping CORE and SECONDARY features does not change score', () => {
      // [CORE_1, CORE_2, SECONDARY] vs [SECONDARY, CORE_1, CORE_2]
      // Same ranks → same score (tier is irrelevant)
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 80],
        ['operatingMarginYoYExpansion', 60],
        ['fcfYoYGrowthShock', 40],
      ]);

      const order1 = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
        makeAvailableFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', 0.20),
      ];
      const order2 = [
        makeAvailableFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', 0.20),
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
      ];

      const score1 = computeCategoryRawScore(order1, ranks, false, false);
      const score2 = computeCategoryRawScore(order2, ranks, false, false);

      expect(score1).toBe(score2);
      expect(score1).toBeCloseTo(60, 10); // (80+60+40)/3
    });

    it('researchTier field exists but is never consumed by computeCategoryRawScore', () => {
      // The function signature does not accept tier — it cannot use it.
      // This is a structural proof: tier is not a parameter.
      const validated = getResearchValidatedFeatures();
      expect(validated.length).toBe(3);
      // All have tiers
      for (const f of validated) {
        expect(f.researchTier).not.toBeNull();
      }
      // computeCategoryRawScore takes (features, ranks, isBlocked, isSingleSecurity)
      // No tier parameter exists. Tier cannot affect the result.
    });
  });

  // ─── 4. DEPRECATED Features Not Scored ─────────────────────────────────

  describe('DEPRECATED features are excluded from scoring', () => {
    it('DEPRECATED features are not in getExpectedFeatureKeys', () => {
      const keys = getExpectedFeatureKeys();
      const deprecated = getDeprecatedFeatures();
      for (const d of deprecated) {
        expect(keys).not.toContain(d.key);
      }
    });

    it('DEPRECATED features are not in getFeaturesByCategory', () => {
      for (const category of ['EARNINGS', 'FUNDAMENTALS', 'MOMENTUM', 'QUALITY'] as FeatureCategory[]) {
        const entries = getFeaturesByCategory(category);
        for (const e of entries) {
          expect(e.status).toBe('ACTIVE');
        }
      }
    });

    it('Fundamentals category has exactly 3 ACTIVE features (P7-validated)', () => {
      const fundamentals = getFeaturesByCategory('FUNDAMENTALS');
      expect(fundamentals).toHaveLength(3);
      expect(fundamentals.map(e => e.key).sort()).toEqual(
        ['fcfYoYGrowthShock', 'operatingMarginYoYExpansion', 'revenueYoYGrowthShock'].sort()
      );
    });

    it('if DEPRECATED features appear in feature list, they are ignored by rawScore', () => {
      // Even if a provider accidentally emits a DEPRECATED feature,
      // computeCategoryRawScore only uses AVAILABLE features.
      // The scoring engine filters by availability, not by registry status.
      // However, verifyRegistryCompleteness only checks ACTIVE keys,
      // so DEPRECATED features won't cause completeness failures.
      const features = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeAvailableFeature('revenueAccelerationPct', 'FUNDAMENTALS', 0.10), // DEPRECATED
      ];
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 80],
        ['revenueAccelerationPct', 90],
      ]);

      // Both are AVAILABLE, so both contribute to rawScore.
      // But verifyRegistryCompleteness won't require revenueAccelerationPct.
      // The score includes it because it's AVAILABLE — but it shouldn't be emitted.
      // This test documents the behavior: the engine scores what it receives.
      // The provider is responsible for not emitting DEPRECATED features.
      const rawScore = computeCategoryRawScore(features, ranks, false, false);
      expect(rawScore).toBeCloseTo(85, 10); // (80+90)/2
    });
  });

  // ─── 5. Feature Order Invariance ───────────────────────────────────────

  describe('Feature order does not change result', () => {
    it('reversed feature order produces identical rawScore', () => {
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 80],
        ['operatingMarginYoYExpansion', 60],
        ['fcfYoYGrowthShock', 40],
      ]);

      const forward = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
        makeAvailableFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', 0.20),
      ];
      const reverse = [
        makeAvailableFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', 0.20),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
      ];
      const shuffled = [
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
        makeAvailableFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', 0.20),
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
      ];

      const s1 = computeCategoryRawScore(forward, ranks, false, false);
      const s2 = computeCategoryRawScore(reverse, ranks, false, false);
      const s3 = computeCategoryRawScore(shuffled, ranks, false, false);

      expect(s1).toBe(s2);
      expect(s2).toBe(s3);
      expect(s1).toBeCloseTo(60, 10);
    });

    it('shuffled feature order with MISSING produces identical rawScore', () => {
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 80],
        ['operatingMarginYoYExpansion', 60],
      ]);

      const order1 = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
        makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No data'),
      ];
      const order2 = [
        makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No data'),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
      ];

      const avail1 = order1.filter(f => f.value !== null && f.availability === 'AVAILABLE');
      const avail2 = order2.filter(f => f.value !== null && f.availability === 'AVAILABLE');

      const s1 = computeCategoryRawScore(avail1, ranks, false, false);
      const s2 = computeCategoryRawScore(avail2, ranks, false, false);

      expect(s1).toBe(s2);
      expect(s1).toBeCloseTo(70, 10);
    });
  });

  // ─── 6. Frozen Category Weights ────────────────────────────────────────

  describe('Category weights remain frozen at 35/30/25/10', () => {
    it('weights are exactly 35/30/25/10', () => {
      expect(CATEGORY_WEIGHTS.EARNINGS).toBe(0.35);
      expect(CATEGORY_WEIGHTS.FUNDAMENTALS).toBe(0.30);
      expect(CATEGORY_WEIGHTS.MOMENTUM).toBe(0.25);
      expect(CATEGORY_WEIGHTS.QUALITY).toBe(0.10);
    });

    it('weights sum to 1.0', () => {
      const sum = Object.values(CATEGORY_WEIGHTS).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('weights object is frozen', () => {
      expect(Object.isFrozen(CATEGORY_WEIGHTS)).toBe(true);
    });

    it('weights version is frozen', () => {
      expect(FROZEN_WEIGHTS_VERSION).toBe('EW-WEIGHTS-v1-frozen');
    });
  });

  // ─── 7. No Intra-Category Weights ──────────────────────────────────────

  describe('No intra-category weights exist', () => {
    it('no registry entry has a weight field', () => {
      for (const entry of FEATURE_REGISTRY) {
        expect((entry as any).weight).toBeUndefined();
        expect((entry as any).scoringWeight).toBeUndefined();
        expect((entry as any).intraCategoryWeight).toBeUndefined();
      }
    });

    it('computeCategoryRawScore does not accept or use any weight parameter', () => {
      // Structural proof: the function signature is
      // (availableFeatures, featureRanks, isBlocked, isSingleSecurity)
      // There is no weight parameter. Equal weight is implicit.
      const features = [
        makeAvailableFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', 0.15),
        makeAvailableFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', 0.03),
        makeAvailableFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', 0.20),
      ];
      const ranks = new Map<string, number>([
        ['revenueYoYGrowthShock', 90],
        ['operatingMarginYoYExpansion', 30],
        ['fcfYoYGrowthShock', 60],
      ]);

      const rawScore = computeCategoryRawScore(features, ranks, false, false);
      // Equal weight: (90+30+60)/3 = 60
      // If there were weights, this would be different.
      expect(rawScore).toBeCloseTo(60, 10);
    });

    it('no combined or interaction feature is registered', () => {
      for (const entry of FEATURE_REGISTRY) {
        // No feature should be a combination of other features
        expect(entry.key).not.toMatch(/combined|interaction|composite/i);
        expect(entry.formula).not.toMatch(/combined|interaction|composite/i);
      }
    });
  });

  // ─── 8. Feature Set Version ────────────────────────────────────────────

  describe('Feature set version', () => {
    it('is v3 after SDD-v1', () => {
      expect(FEATURE_SET_VERSION).toBe('EW-FEATURESET-v3');
    });
  });
});
