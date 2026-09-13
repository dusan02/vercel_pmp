/**
 * ConsensusEarningsProvider — Unit Tests
 * =======================================
 *
 * Verifies computeFeatures() against a mocked Prisma client:
 *   - epsSurprisePct from pre-earnings consensus vs actual
 *   - estimateRevisionsPct from consensusAt(T) vs consensusAt(T-30d)
 *   - guidanceSurprisePct always MISSING (vendor does not provide guidance)
 *   - BLOCKED when security has no consensus facts
 *   - Determinism: same facts → same features
 */

import { describe, it, expect } from 'vitest';
import { ConsensusEarningsProvider } from './consensus-earnings';
import type { PrismaClient } from '../../p4-engine/db/client';

// ─── Fixture factory ─────────────────────────────────────────────────────────

function fact(overrides: Record<string, unknown> = {}) {
  return {
    fiscalYear: 2024,
    fiscalPeriod: 'Q1',
    periodEndDate: new Date('2024-02-01T21:30:00.000Z'),
    observationDate: new Date('2024-01-31T00:00:00.000Z'),
    availableAt: new Date('2024-01-31T00:00:00.000Z'),
    metricType: 'EPS',
    consensusMean: 2.40,
    consensusMedian: null,
    consensusHigh: 2.48,
    consensusLow: 2.32,
    consensusStdDev: 0.03,
    analystCount: 15,
    actualValue: null,
    actualReportDate: null,
    sourceProvider: 'ESTIMIZE',
    sourceType: 'CSV',
    ...overrides,
  };
}

function makeProvider(findManyResult: ReturnType<typeof fact>[]) {
  const prismaStub = {
    pitConsensusFact: { findMany: async () => findManyResult },
  } as unknown as PrismaClient;
  return new ConsensusEarningsProvider(prismaStub);
}

describe('ConsensusEarningsProvider', () => {
  it('isAvailable() returns true (deployed; per-security coverage in computeFeatures)', () => {
    const provider = new ConsensusEarningsProvider({} as PrismaClient);
    expect(provider.isAvailable()).toBe(true);
  });

  it('returns BLOCKED features when security has no consensus facts', async () => {
    const provider = makeProvider([]);
    const features = await provider.computeFeatures('sec-aapl', '2024-03-01T00:00:00.000Z');

    expect(features.length).toBe(4);
    expect(features.every(f => f.availability === 'BLOCKED')).toBe(true);
  });

  it('computes epsSurprisePct from pre-earnings consensus vs actual', async () => {
    const facts = [
      fact(), // consensus 2.40 @ 2024-01-31
      fact({
        observationDate: new Date('2024-02-05T00:00:00.000Z'),
        availableAt: new Date('2024-02-05T00:00:00.000Z'),
        actualValue: 2.18,
        actualReportDate: new Date('2024-02-01T21:30:00.000Z'),
      }),
    ];
    const provider = makeProvider(facts);
    const features = await provider.computeFeatures('sec-aapl', '2024-03-01T00:00:00.000Z');

    const epsSurprise = features.find(f => f.key === 'epsSurprisePct');
    expect(epsSurprise).toBeDefined();
    expect(epsSurprise!.availability).toBe('AVAILABLE');
    // ((2.18 - 2.40) / |2.40|) * 100 = -9.1667
    expect(epsSurprise!.value).toBeCloseTo(-9.1667, 3);
    // PIT: surprise is knowable at the actual report date
    expect(epsSurprise!.knownAt).toBe(new Date('2024-02-01T21:30:00.000Z').toISOString());
  });

  it('computes estimateRevisionsPct from consensusAt(T) vs consensusAt(T-30d)', async () => {
    // T = 2024-03-01, T-30d = 2024-01-30
    // Prior snapshot (2024-01-05, 2.30) <= T-30d; current (2024-02-20, 2.50) <= T
    const facts = [
      fact({ observationDate: new Date('2024-01-05T00:00:00.000Z'), availableAt: new Date('2024-01-05T00:00:00.000Z'), consensusMean: 2.30 }),
      fact({ observationDate: new Date('2024-02-20T00:00:00.000Z'), availableAt: new Date('2024-02-20T00:00:00.000Z'), consensusMean: 2.50 }),
    ];
    const provider = makeProvider(facts);
    const features = await provider.computeFeatures('sec-aapl', '2024-03-01T00:00:00.000Z');

    const revisions = features.find(f => f.key === 'estimateRevisionsPct');
    expect(revisions).toBeDefined();
    expect(revisions!.availability).toBe('AVAILABLE');
    // ((2.50 - 2.30) / |2.30|) * 100 = 8.6957
    expect(revisions!.value).toBeCloseTo(8.6957, 3);
  });

  it('guidanceSurprisePct is always MISSING (vendor does not provide guidance)', async () => {
    const provider = makeProvider([fact()]);
    const features = await provider.computeFeatures('sec-aapl', '2024-03-01T00:00:00.000Z');

    const guidance = features.find(f => f.key === 'guidanceSurprisePct');
    expect(guidance).toBeDefined();
    expect(guidance!.availability).toBe('MISSING');
    expect(guidance!.value).toBeNull();
  });

  it('is deterministic — same facts produce identical features', async () => {
    const facts = [
      fact(),
      fact({
        observationDate: new Date('2024-02-05T00:00:00.000Z'),
        availableAt: new Date('2024-02-05T00:00:00.000Z'),
        actualValue: 2.18,
        actualReportDate: new Date('2024-02-01T21:30:00.000Z'),
      }),
    ];

    const a = await makeProvider(facts).computeFeatures('sec-aapl', '2024-03-01T00:00:00.000Z');
    const b = await makeProvider(facts).computeFeatures('sec-aapl', '2024-03-01T00:00:00.000Z');

    expect(a.map(f => ({ key: f.key, value: f.value, knownAt: f.knownAt })))
      .toEqual(b.map(f => ({ key: f.key, value: f.value, knownAt: f.knownAt })));
  });
});
