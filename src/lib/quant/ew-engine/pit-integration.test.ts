/**
 * EarlyWinner Engine — PIT Integration Tests
 * =============================================
 *
 * Behavioral PIT tests: verify that facts available AFTER asOfTime
 * cannot enter the score, even if a provider bug tries to include them.
 *
 * These tests use mock providers that deliberately return future-dated
 * features. The PIT gate must reject them.
 */

import { describe, it, expect } from 'vitest';
import { PitGate } from './pit-gate.js';
import {
  EwFeature,
  FeatureProvider,
  FeatureCategory,
  makeMissingFeature,
  makeBlockedFeature,
} from './types.js';
import { FEATURE_REGISTRY, getExpectedFeatureKeys } from './feature-registry.js';

// ─── Mock providers for PIT testing ──────────────────────────────────────

/**
 * Mock provider that returns ALL registry features.
 * Available features get a fixed value; missing ones get MISSING.
 * This lets us test PIT gate behavior without a real database.
 */
class MockFullProvider implements FeatureProvider {
  readonly categories: readonly FeatureCategory[];
  readonly version = 'MOCK-v1';

  constructor(
    categories: FeatureCategory[],
    private featureConfig: Record<string, { value: number | null; knownAt: string; availableAt: string; availability: EwFeature['availability'] }>
  ) {
    this.categories = Object.freeze(categories);
  }

  async computeFeatures(_securityId: string, asOfTime: string): Promise<EwFeature[]> {
    const registryFeatures = FEATURE_REGISTRY.filter(e => this.categories.includes(e.category));
    return registryFeatures.map(entry => {
      const config = this.featureConfig[entry.key];
      if (!config || config.value === null) {
        const avail = config?.availability ?? 'MISSING';
        return makeMissingFeature(entry.key, entry.category, asOfTime, 'mock missing', avail);
      }
      return Object.freeze({
        key: entry.key,
        category: entry.category,
        value: config.value,
        knownAt: config.knownAt,
        availableAt: config.availableAt,
        source: 'SEC' as const,
        accession: 'mock-acc',
        confidence: 1.0,
        pitValid: true,
        availability: config.availability,
        evidence: Object.freeze({
          formula: entry.formula,
          inputs: Object.freeze({ mock: true }),
          periodEnd: null,
          periodStart: null,
          notes: 'mock feature',
        }),
      });
    });
  }

  isAvailable(): boolean { return true; }
  describeStatus(): string { return 'MOCK-v1: test provider'; }
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('EW Engine — PIT Integration Tests', () => {
  const gate = new PitGate();
  const asOfTime = '2024-06-15T00:00:00.000Z';
  const pastTime = '2024-01-01T00:00:00.000Z';
  const futureTime = '2024-12-31T00:00:00.000Z';

  // ─── PIT gate rejects future-dated facts ───────────────────────────────

  describe('PIT gate rejects future information', () => {
    it('rejects when knownAt is 1 day in the future', () => {
      const features: EwFeature[] = [
        makeBlockedFeature('epsSurprisePct', 'EARNINGS', asOfTime, 'blocked'),
        makeBlockedFeature('revenueSurprisePct', 'EARNINGS', asOfTime, 'blocked'),
        makeBlockedFeature('estimateRevisionsPct', 'EARNINGS', asOfTime, 'blocked'),
        makeBlockedFeature('guidanceSurprisePct', 'EARNINGS', asOfTime, 'blocked'),
        {
          key: 'revenueAccelerationPct',
          category: 'FUNDAMENTALS',
          value: 15.5,
          knownAt: '2024-06-16T00:00:00.000Z', // 1 day future
          availableAt: pastTime,
          source: 'SEC',
          accession: 'acc-1',
          confidence: 1.0,
          pitValid: true,
          availability: 'AVAILABLE',
          evidence: { formula: 'test', inputs: {}, periodEnd: null, periodStart: null, notes: null },
        },
        makeMissingFeature('marginExpansionBps', 'FUNDAMENTALS', asOfTime, 'missing'),
        makeMissingFeature('priceStrengthPct', 'MOMENTUM', asOfTime, 'missing'),
        makeMissingFeature('trendAlignment', 'MOMENTUM', asOfTime, 'missing'),
        makeMissingFeature('relativeVolume', 'MOMENTUM', asOfTime, 'missing'),
        makeMissingFeature('profitabilityScore', 'QUALITY', asOfTime, 'missing'),
        makeMissingFeature('leverageRatio', 'QUALITY', asOfTime, 'missing'),
      ];

      const result = gate.validate(features, asOfTime);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.featureKey).toBe('revenueAccelerationPct');
      expect(result.violations[0]!.violation).toBe('KNOWN_AT_FUTURE');
    });

    it('rejects when availableAt is in the future', () => {
      const features: EwFeature[] = [
        {
          key: 'priceStrengthPct',
          category: 'MOMENTUM',
          value: 5.2,
          knownAt: pastTime,
          availableAt: futureTime, // FUTURE ingest
          source: 'POLYGON',
          accession: null,
          confidence: 1.0,
          pitValid: true,
          availability: 'AVAILABLE',
          evidence: { formula: 'test', inputs: {}, periodEnd: null, periodStart: null, notes: null },
        },
      ];

      const result = gate.validate(features, asOfTime);
      expect(result.passed).toBe(false);
      expect(result.violations[0]!.violation).toBe('AVAILABLE_AT_FUTURE');
    });

    it('rejects multiple future-dated features and reports all violations', () => {
      const features: EwFeature[] = [
        {
          key: 'revenueAccelerationPct',
          category: 'FUNDAMENTALS',
          value: 10,
          knownAt: futureTime,
          availableAt: pastTime,
          source: 'SEC', accession: 'a1', confidence: 1.0, pitValid: true, availability: 'AVAILABLE',
          evidence: { formula: 't', inputs: {}, periodEnd: null, periodStart: null, notes: null },
        },
        {
          key: 'marginExpansionBps',
          category: 'FUNDAMENTALS',
          value: 200,
          knownAt: pastTime,
          availableAt: futureTime,
          source: 'SEC', accession: 'a2', confidence: 1.0, pitValid: true, availability: 'AVAILABLE',
          evidence: { formula: 't', inputs: {}, periodEnd: null, periodStart: null, notes: null },
        },
        {
          key: 'priceStrengthPct',
          category: 'MOMENTUM',
          value: 5,
          knownAt: futureTime,
          availableAt: futureTime,
          source: 'POLYGON', accession: null, confidence: 1.0, pitValid: true, availability: 'AVAILABLE',
          evidence: { formula: 't', inputs: {}, periodEnd: null, periodStart: null, notes: null },
        },
      ];

      const result = gate.validate(features, asOfTime);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(4); // 1 + 1 + 2
    });
  });

  // ─── PIT gate passes valid historical facts ────────────────────────────

  describe('PIT gate passes valid historical facts', () => {
    it('passes when all features are known well before asOfTime', () => {
      const features: EwFeature[] = [
        {
          key: 'revenueAccelerationPct',
          category: 'FUNDAMENTALS',
          value: 10,
          knownAt: '2024-03-01T00:00:00.000Z',
          availableAt: '2024-03-02T00:00:00.000Z',
          source: 'SEC', accession: 'a1', confidence: 1.0, pitValid: true, availability: 'AVAILABLE',
          evidence: { formula: 't', inputs: {}, periodEnd: null, periodStart: null, notes: null },
        },
        {
          key: 'priceStrengthPct',
          category: 'MOMENTUM',
          value: 5,
          knownAt: '2024-06-14T00:00:00.000Z',
          availableAt: '2024-06-14T00:00:00.000Z',
          source: 'POLYGON', accession: null, confidence: 1.0, pitValid: true, availability: 'AVAILABLE',
          evidence: { formula: 't', inputs: {}, periodEnd: null, periodStart: null, notes: null },
        },
      ];

      const result = gate.validate(features, asOfTime); // asOf = 2024-06-15
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('passes when knownAt equals asOfTime exactly (boundary)', () => {
      const features: EwFeature[] = [
        {
          key: 'revenueAccelerationPct',
          category: 'FUNDAMENTALS',
          value: 10,
          knownAt: asOfTime, // exactly equal
          availableAt: asOfTime,
          source: 'SEC', accession: 'a1', confidence: 1.0, pitValid: true, availability: 'AVAILABLE',
          evidence: { formula: 't', inputs: {}, periodEnd: null, periodStart: null, notes: null },
        },
      ];

      const result = gate.validate(features, asOfTime);
      expect(result.passed).toBe(true);
    });
  });

  // ─── Feature registry completeness ─────────────────────────────────────

  describe('Feature registry completeness', () => {
    it('mock provider returns all registry features for its categories', async () => {
      const provider = new MockFullProvider(
        ['FUNDAMENTALS', 'QUALITY'],
        {
          revenueAccelerationPct: { value: 10, knownAt: pastTime, availableAt: pastTime, availability: 'AVAILABLE' },
          marginExpansionBps: { value: 200, knownAt: pastTime, availableAt: pastTime, availability: 'AVAILABLE' },
        }
      );

      const features = await provider.computeFeatures('test-sec', asOfTime);
      const keys = features.map(f => f.key);

      // Must include ALL registry features for FUNDAMENTALS + QUALITY
      const expectedKeys = FEATURE_REGISTRY
        .filter(e => ['FUNDAMENTALS', 'QUALITY'].includes(e.category))
        .map(e => e.key);

      for (const expected of expectedKeys) {
        expect(keys).toContain(expected);
      }
    });

    it('missing features are explicitly MISSING, not absent', async () => {
      const provider = new MockFullProvider(
        ['MOMENTUM'],
        {} // no features configured → all MISSING
      );

      const features = await provider.computeFeatures('test-sec', asOfTime);
      const momentumFeatures = features.filter(f => f.category === 'MOMENTUM');

      expect(momentumFeatures.length).toBe(3); // priceStrength, trendAlignment, relativeVolume
      for (const f of momentumFeatures) {
        expect(f.value).toBeNull();
        expect(f.availability).toBe('MISSING');
      }
    });
  });

  // ─── Determinism ───────────────────────────────────────────────────────

  describe('Determinism', () => {
    it('PIT gate produces identical results for identical input', () => {
      const features: EwFeature[] = [
        {
          key: 'revenueAccelerationPct',
          category: 'FUNDAMENTALS',
          value: 10,
          knownAt: pastTime,
          availableAt: pastTime,
          source: 'SEC', accession: 'a1', confidence: 1.0, pitValid: true, availability: 'AVAILABLE',
          evidence: { formula: 't', inputs: {}, periodEnd: null, periodStart: null, notes: null },
        },
      ];

      const result1 = gate.validate(features, asOfTime);
      const result2 = gate.validate(features, asOfTime);

      expect(result1.passed).toBe(result2.passed);
      expect(result1.violations).toEqual(result2.violations);
    });

    it('PIT gate is order-independent', () => {
      const f1: EwFeature = {
        key: 'revenueAccelerationPct', category: 'FUNDAMENTALS', value: 10,
        knownAt: pastTime, availableAt: pastTime,
        source: 'SEC', accession: 'a1', confidence: 1.0, pitValid: true, availability: 'AVAILABLE',
        evidence: { formula: 't', inputs: {}, periodEnd: null, periodStart: null, notes: null },
      };
      const f2: EwFeature = {
        key: 'priceStrengthPct', category: 'MOMENTUM', value: 5,
        knownAt: pastTime, availableAt: pastTime,
        source: 'POLYGON', accession: null, confidence: 1.0, pitValid: true, availability: 'AVAILABLE',
        evidence: { formula: 't', inputs: {}, periodEnd: null, periodStart: null, notes: null },
      };

      const r1 = gate.validate([f1, f2], asOfTime);
      const r2 = gate.validate([f2, f1], asOfTime);

      expect(r1.passed).toBe(r2.passed);
    });
  });
});
