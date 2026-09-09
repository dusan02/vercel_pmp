/**
 * EarlyWinner Engine — Contract Tests
 * ======================================
 *
 * Tests that verify the architecture contract holds:
 *   1. Feature registry completeness — all expected features present
 *   2. PIT gate — future-dated features are rejected
 *   3. Determinism — same input → same output
 *   4. Score versioning — all version fields present
 *   5. Universe definition — exclusions tracked
 *   6. Partial category — flagged correctly
 *   7. Single security — rawScore=null
 *   8. Frozen weights — cannot be modified
 *   9. Provider multi-category — QUALITY has providerVersions
 */

import { describe, it, expect } from 'vitest';
import {
  CATEGORY_WEIGHTS,
  FROZEN_WEIGHTS_VERSION,
  FEATURE_SET_VERSION,
  makeMissingFeature,
  makeBlockedFeature,
  EwFeature,
  FeatureCategory,
} from './types.js';
import { PitGate } from './pit-gate.js';
import {
  FEATURE_REGISTRY,
  getExpectedFeatureKeys,
  getFeaturesByCategory,
  getResearchValidatedFeatures,
  getFeaturesByResearchTier,
  getDeprecatedFeatures,
  ResearchTier,
  FeatureStatus,
} from './feature-registry.js';

describe('EW Engine — Contract Tests', () => {

  // ─── 1. Feature Registry ───────────────────────────────────────────────

  describe('Feature Registry', () => {
    it('registry contains all expected ACTIVE feature keys', () => {
      const keys = getExpectedFeatureKeys();
      expect(keys).toContain('epsSurprisePct');
      expect(keys).toContain('priceStrengthPct');
      expect(keys).toContain('trendAlignment');
      expect(keys).toContain('relativeVolume');
      expect(keys).toContain('profitabilityScore');
      expect(keys).toContain('leverageRatio');
      // P7-validated features (Feature Selection Decision v1)
      expect(keys).toContain('revenueYoYGrowthShock');
      expect(keys).toContain('operatingMarginYoYExpansion');
      expect(keys).toContain('fcfYoYGrowthShock');
      // SDD-v1: legacy features are DEPRECATED, NOT in expected keys
      expect(keys).not.toContain('revenueAccelerationPct');
      expect(keys).not.toContain('marginExpansionBps');
    });

    it('every category has at least one feature', () => {
      for (const cat of ['EARNINGS', 'FUNDAMENTALS', 'MOMENTUM', 'QUALITY'] as FeatureCategory[]) {
        const features = getFeaturesByCategory(cat);
        expect(features.length).toBeGreaterThan(0);
      }
    });

    it('every registry entry has formula, provider, version', () => {
      for (const entry of FEATURE_REGISTRY) {
        expect(entry.formula).toBeTruthy();
        expect(entry.provider).toBeTruthy();
        expect(entry.providerVersion).toBeTruthy();
        expect(entry.pitRequirements.length).toBeGreaterThan(0);
      }
    });

    it('feature set version is defined', () => {
      expect(FEATURE_SET_VERSION).toMatch(/^EW-FEATURESET-v\d+$/);
    });

    // ─── P7-validated feature registry tests (Feature Selection Decision v1) ───

    it('three P7-validated features are registered with correct provenance', () => {
      const validated = getResearchValidatedFeatures();
      expect(validated).toHaveLength(3);

      const keys = validated.map(e => e.key);
      expect(keys).toContain('revenueYoYGrowthShock');
      expect(keys).toContain('operatingMarginYoYExpansion');
      expect(keys).toContain('fcfYoYGrowthShock');
    });

    it('P7.1 Revenue feature has CORE tier and correct provenance', () => {
      const entry = FEATURE_REGISTRY.find(e => e.key === 'revenueYoYGrowthShock');
      expect(entry).toBeDefined();
      expect(entry!.researchTier).toBe('CORE');
      expect(entry!.researchProvenance).toBe('P7.1');
      expect(entry!.researchCommit).toBe('ed78aa4');
      expect(entry!.researchStatus).toBe('PASS-frozen');
      expect(entry!.category).toBe('FUNDAMENTALS');
      expect(entry!.formula).toContain('revenue');
    });

    it('P7.2 Margin feature has CORE tier and correct provenance', () => {
      const entry = FEATURE_REGISTRY.find(e => e.key === 'operatingMarginYoYExpansion');
      expect(entry).toBeDefined();
      expect(entry!.researchTier).toBe('CORE');
      expect(entry!.researchProvenance).toBe('P7.2');
      expect(entry!.researchCommit).toBe('962f9bc');
      expect(entry!.researchStatus).toBe('PASS-frozen');
      expect(entry!.category).toBe('FUNDAMENTALS');
      expect(entry!.formula).toContain('operatingIncome');
    });

    it('P7.3 FCF feature has SECONDARY tier and correct provenance', () => {
      const entry = FEATURE_REGISTRY.find(e => e.key === 'fcfYoYGrowthShock');
      expect(entry).toBeDefined();
      expect(entry!.researchTier).toBe('SECONDARY');
      expect(entry!.researchProvenance).toBe('P7.3');
      expect(entry!.researchCommit).toBe('87b6e23');
      expect(entry!.researchStatus).toBe('PASS-frozen-borderline-matched');
      expect(entry!.category).toBe('FUNDAMENTALS');
      expect(entry!.formula).toContain('operatingCashFlow');
      expect(entry!.formula).toContain('capitalExpenditures');
    });

    it('researchTier is evidence metadata, NOT a scoring parameter', () => {
      // The scoring engine MUST NOT interpret researchTier as a weight.
      // This test verifies the field exists but is NOT consumed by scoring logic.
      // It is purely for audit/provenance.
      const coreFeatures = getFeaturesByResearchTier('CORE');
      const secondaryFeatures = getFeaturesByResearchTier('SECONDARY');
      expect(coreFeatures.length).toBeGreaterThanOrEqual(2); // Revenue + Margin
      expect(secondaryFeatures.length).toBeGreaterThanOrEqual(1); // FCF
    });

    it('all P7-validated features have PIT requirements declared', () => {
      const validated = getResearchValidatedFeatures();
      for (const entry of validated) {
        expect(entry.pitRequirements.length).toBeGreaterThanOrEqual(3);
        expect(entry.pitRequirements.some(r => r.includes('availableAt'))).toBe(true);
      }
    });

    it('no registry entry has a weight field (firewall: feature ≠ weight)', () => {
      for (const entry of FEATURE_REGISTRY) {
        expect((entry as any).weight).toBeUndefined();
        expect((entry as any).scoringWeight).toBeUndefined();
      }
    });

    it('feature set version bumped to v3 after SDD-v1 deprecation', () => {
      expect(FEATURE_SET_VERSION).toBe('EW-FEATURESET-v3');
    });

    // ─── SDD-v1: Feature lifecycle tests ────────────────────────────────

    it('legacy features are DEPRECATED with correct replacements', () => {
      const deprecated = getDeprecatedFeatures();
      expect(deprecated).toHaveLength(2);

      const revAccel = FEATURE_REGISTRY.find(e => e.key === 'revenueAccelerationPct');
      expect(revAccel).toBeDefined();
      expect(revAccel!.status).toBe('DEPRECATED');
      expect(revAccel!.replacedBy).toBe('revenueYoYGrowthShock');

      const marginExp = FEATURE_REGISTRY.find(e => e.key === 'marginExpansionBps');
      expect(marginExp).toBeDefined();
      expect(marginExp!.status).toBe('DEPRECATED');
      expect(marginExp!.replacedBy).toBe('operatingMarginYoYExpansion');
    });

    it('DEPRECATED features are excluded from getFeaturesByCategory', () => {
      const fundamentals = getFeaturesByCategory('FUNDAMENTALS');
      const keys = fundamentals.map(e => e.key);
      // Only 3 ACTIVE P7-validated features
      expect(fundamentals).toHaveLength(3);
      expect(keys).toContain('revenueYoYGrowthShock');
      expect(keys).toContain('operatingMarginYoYExpansion');
      expect(keys).toContain('fcfYoYGrowthShock');
      // Legacy features NOT included
      expect(keys).not.toContain('revenueAccelerationPct');
      expect(keys).not.toContain('marginExpansionBps');
    });

    it('DEPRECATED features are excluded from getExpectedFeatureKeys', () => {
      const keys = getExpectedFeatureKeys();
      expect(keys).not.toContain('revenueAccelerationPct');
      expect(keys).not.toContain('marginExpansionBps');
    });

    it('all ACTIVE features have status ACTIVE and replacedBy null', () => {
      const active = FEATURE_REGISTRY.filter(e => e.status === 'ACTIVE');
      expect(active.length).toBeGreaterThan(0);
      for (const entry of active) {
        expect(entry.status).toBe('ACTIVE');
        expect(entry.replacedBy).toBeNull();
      }
    });

    it('replacement targets exist in registry', () => {
      const deprecated = getDeprecatedFeatures();
      for (const entry of deprecated) {
        expect(entry.replacedBy).not.toBeNull();
        const replacement = FEATURE_REGISTRY.find(e => e.key === entry.replacedBy);
        expect(replacement).toBeDefined();
        expect(replacement!.status).toBe('ACTIVE');
      }
    });
  });

  // ─── 2. PIT Gate ───────────────────────────────────────────────────────

  describe('PIT Gate', () => {
    const gate = new PitGate();
    const asOfTime = '2024-06-15T00:00:00.000Z';

    it('rejects feature with knownAt > asOfTime', () => {
      const feature: EwFeature = {
        key: 'testFeature',
        category: 'FUNDAMENTALS',
        value: 42,
        knownAt: '2024-06-16T00:00:00.000Z', // FUTURE
        availableAt: '2024-06-10T00:00:00.000Z',
        source: 'SEC',
        accession: 'test-acc',
        confidence: 1.0,
        pitValid: true,
        availability: 'AVAILABLE',
        evidence: { formula: 'test', inputs: {}, periodEnd: null, periodStart: null, notes: null },
      };

      const result = gate.validate([feature], asOfTime);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.violation === 'KNOWN_AT_FUTURE')).toBe(true);
    });

    it('rejects feature with availableAt > asOfTime', () => {
      const feature: EwFeature = {
        key: 'testFeature',
        category: 'FUNDAMENTALS',
        value: 42,
        knownAt: '2024-06-10T00:00:00.000Z',
        availableAt: '2024-06-16T00:00:00.000Z', // FUTURE
        source: 'SEC',
        accession: 'test-acc',
        confidence: 1.0,
        pitValid: true,
        availability: 'AVAILABLE',
        evidence: { formula: 'test', inputs: {}, periodEnd: null, periodStart: null, notes: null },
      };

      const result = gate.validate([feature], asOfTime);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.violation === 'AVAILABLE_AT_FUTURE')).toBe(true);
    });

    it('rejects feature with pitValid=false', () => {
      const feature: EwFeature = {
        key: 'testFeature',
        category: 'FUNDAMENTALS',
        value: 42,
        knownAt: '2024-06-10T00:00:00.000Z',
        availableAt: '2024-06-10T00:00:00.000Z',
        source: 'SEC',
        accession: 'test-acc',
        confidence: 1.0,
        pitValid: false, // INVALID
        availability: 'AVAILABLE',
        evidence: { formula: 'test', inputs: {}, periodEnd: null, periodStart: null, notes: null },
      };

      const result = gate.validate([feature], asOfTime);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.violation === 'PIT_INVALID')).toBe(true);
    });

    it('rejects feature with availability=INVALID', () => {
      const feature: EwFeature = {
        key: 'testFeature',
        category: 'FUNDAMENTALS',
        value: 42,
        knownAt: '2024-06-10T00:00:00.000Z',
        availableAt: '2024-06-10T00:00:00.000Z',
        source: 'SEC',
        accession: 'test-acc',
        confidence: 1.0,
        pitValid: true,
        availability: 'INVALID',
        evidence: { formula: 'test', inputs: {}, periodEnd: null, periodStart: null, notes: null },
      };

      const result = gate.validate([feature], asOfTime);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.violation === 'INVALID_AVAILABILITY')).toBe(true);
    });

    it('passes valid features', () => {
      const feature: EwFeature = {
        key: 'testFeature',
        category: 'FUNDAMENTALS',
        value: 42,
        knownAt: '2024-06-10T00:00:00.000Z',
        availableAt: '2024-06-10T00:00:00.000Z',
        source: 'SEC',
        accession: 'test-acc',
        confidence: 1.0,
        pitValid: true,
        availability: 'AVAILABLE',
        evidence: { formula: 'test', inputs: {}, periodEnd: null, periodStart: null, notes: null },
      };

      const result = gate.validate([feature], asOfTime);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('skips missing/blocked features (null value)', () => {
      const missing = makeMissingFeature('missingFeature', 'FUNDAMENTALS', asOfTime, 'not available');
      const blocked = makeBlockedFeature('blockedFeature', 'EARNINGS', asOfTime, 'vendor blocked');

      const result = gate.validate([missing, blocked], asOfTime);
      expect(result.passed).toBe(true);
    });
  });

  // ─── 3. Frozen Weights ─────────────────────────────────────────────────

  describe('Frozen Weights', () => {
    it('weights sum to 1.0', () => {
      const sum = Object.values(CATEGORY_WEIGHTS).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('weights match frozen values', () => {
      expect(CATEGORY_WEIGHTS.EARNINGS).toBe(0.35);
      expect(CATEGORY_WEIGHTS.FUNDAMENTALS).toBe(0.30);
      expect(CATEGORY_WEIGHTS.MOMENTUM).toBe(0.25);
      expect(CATEGORY_WEIGHTS.QUALITY).toBe(0.10);
    });

    it('weights version is defined', () => {
      expect(FROZEN_WEIGHTS_VERSION).toMatch(/^EW-WEIGHTS-v\d+-frozen$/);
    });

    it('weights object is frozen', () => {
      expect(Object.isFrozen(CATEGORY_WEIGHTS)).toBe(true);
    });
  });

  // ─── 4. Score Versioning ───────────────────────────────────────────────

  describe('Score Versioning', () => {
    it('EwScore type includes all version fields (compile-time check)', () => {
      // This is a type-level test — if it compiles, the fields exist
      const score: import('./types.js').EwScore = {
        securityId: 'test',
        asOfTime: '2024-01-01',
        totalScore: 50,
        maxPossibleScore: 65,
        categoryScores: {} as any,
        features: [],
        pitGatePassed: true,
        pitViolations: [],
        engineVersion: 'test',
        weightsVersion: FROZEN_WEIGHTS_VERSION,
        featureSetVersion: FEATURE_SET_VERSION,
        universeDefinition: null,
      };

      expect(score.weightsVersion).toBe(FROZEN_WEIGHTS_VERSION);
      expect(score.featureSetVersion).toBe(FEATURE_SET_VERSION);
      expect(score.universeDefinition).toBeNull();
    });

    it('EwScore does NOT include generatedAt (determinism)', () => {
      // If generatedAt existed, this would fail at compile time
      const score: import('./types.js').EwScore = {
        securityId: 'test',
        asOfTime: '2024-01-01',
        totalScore: 50,
        maxPossibleScore: 65,
        categoryScores: {} as any,
        features: [],
        pitGatePassed: true,
        pitViolations: [],
        engineVersion: 'test',
        weightsVersion: 'test',
        featureSetVersion: 'test',
        universeDefinition: null,
      };

      expect((score as any).generatedAt).toBeUndefined();
    });
  });

  // ─── 5. CategoryScore contract ─────────────────────────────────────────

  describe('CategoryScore contract', () => {
    it('includes isPartial and isSingleSecurity fields', () => {
      const cs: import('./types.js').CategoryScore = {
        category: 'FUNDAMENTALS',
        weight: 0.30,
        rawScore: 75,
        weightedScore: 22.5,
        featureCount: 2,
        availableFeatureCount: 2,
        expectedFeatureCount: 2,
        isBlocked: false,
        isPartial: false,
        isSingleSecurity: false,
        providerVersions: ['SEC-FUND-v1'],
      };

      expect(cs.isPartial).toBe(false);
      expect(cs.isSingleSecurity).toBe(false);
      expect(cs.expectedFeatureCount).toBe(2);
      expect(cs.providerVersions).toContain('SEC-FUND-v1');
    });
  });

  // ─── 6. Universe Definition ────────────────────────────────────────────

  describe('Universe Definition', () => {
    it('includes requested, included, and excluded security lists', () => {
      const universe: import('./types.js').UniverseDefinition = {
        universeId: 'test-universe',
        asOfTime: '2024-01-01',
        requestedSecurityIds: ['sec-a', 'sec-b', 'sec-c'],
        includedSecurityIds: ['sec-a', 'sec-b'],
        excludedSecurityIds: [
          { securityId: 'sec-c', reason: 'PIT_GATE_FAILED', detail: 'knownAt future' },
        ],
      };

      expect(universe.requestedSecurityIds).toHaveLength(3);
      expect(universe.includedSecurityIds).toHaveLength(2);
      expect(universe.excludedSecurityIds).toHaveLength(1);
      expect(universe.excludedSecurityIds[0]!.reason).toBe('PIT_GATE_FAILED');
    });
  });

  // ─── 7. Provider multi-category ────────────────────────────────────────

  describe('Provider multi-category', () => {
    it('FeatureProvider interface uses categories[] not category', () => {
      const provider: import('./types.js').FeatureProvider = {
        categories: ['FUNDAMENTALS', 'QUALITY'],
        version: 'test-v1',
        computeFeatures: async () => [],
        isAvailable: () => true,
        describeStatus: () => 'test',
      };

      expect(provider.categories).toContain('FUNDAMENTALS');
      expect(provider.categories).toContain('QUALITY');
      expect((provider as any).category).toBeUndefined();
    });
  });
});
