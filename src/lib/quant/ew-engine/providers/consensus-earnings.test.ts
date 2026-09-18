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
import type { PitActualsSource, PitActual } from '../../p4-engine/consensus/actuals-source';

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

function makeProvider(
  findManyResult: ReturnType<typeof fact>[],
  actualsSource?: PitActualsSource,
) {
  const prismaStub = {
    pitConsensusFact: { findMany: async () => findManyResult },
  } as unknown as PrismaClient;
  return new ConsensusEarningsProvider(prismaStub, actualsSource);
}

/** Fake actuals source — returns a fixed actual or throws. */
function fakeActuals(actual: PitActual | null | Error): PitActualsSource {
  return {
    getActual: async () => {
      if (actual instanceof Error) throw actual;
      return actual;
    },
  };
}

const ACTUAL = (reportDate: string, availableAt: string, value = 2.18): PitActual => ({
  value,
  reportDate: new Date(reportDate),
  availableAt: new Date(availableAt),
  sourceForm: '10-Q',
  accessionNum: 'syn-acc-1',
});

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

  // ─── Actuals source (opt-in): PIT boundary cases ─────────────────────────
  // Estimates-only vendor rows (no actualValue) + SEC actuals source.

  const ESTIMATE_ONLY = () => [
    fact(), // pre-earnings consensus 2.40 @ 2024-01-31 — no actual attached
  ];
  const T = '2024-03-01T00:00:00.000Z';

  it('actuals: report before T + available before T → surprise computed', async () => {
    const provider = makeProvider(ESTIMATE_ONLY(), fakeActuals(ACTUAL('2024-02-01', '2024-02-01')));
    const f = (await provider.computeFeatures('sec-aapl', T)).find(x => x.key === 'epsSurprisePct');
    expect(f!.availability).toBe('AVAILABLE');
    expect(f!.value).toBeCloseTo(-9.1667, 3); // (2.18-2.40)/2.40
  });

  it('actuals: report before T + available AFTER T → NOT usable (MISSING)', async () => {
    // report happened 2024-02-01 but only entered our store 2024-03-15 (> T=03-01)
    const provider = makeProvider(ESTIMATE_ONLY(), fakeActuals(ACTUAL('2024-02-01', '2024-03-15')));
    const f = (await provider.computeFeatures('sec-aapl', T)).find(x => x.key === 'epsSurprisePct');
    expect(f!.availability).not.toBe('AVAILABLE');
    expect(f!.value).toBeNull();
  });

  it('actuals: report AFTER T → NOT usable (MISSING)', async () => {
    const provider = makeProvider(ESTIMATE_ONLY(), fakeActuals(ACTUAL('2024-04-25', '2024-04-25')));
    const f = (await provider.computeFeatures('sec-aapl', T)).find(x => x.key === 'epsSurprisePct');
    expect(f!.availability).not.toBe('AVAILABLE');
    expect(f!.value).toBeNull();
  });

  it('actuals: source returns null (no actual exists) → MISSING, not crash', async () => {
    const provider = makeProvider(ESTIMATE_ONLY(), fakeActuals(null));
    const f = (await provider.computeFeatures('sec-aapl', T)).find(x => x.key === 'epsSurprisePct');
    expect(f!.availability).not.toBe('AVAILABLE');
    expect(f!.value).toBeNull();
  });

  it('actuals: source failure propagates (distinguishable from "no actual")', async () => {
    const provider = makeProvider(ESTIMATE_ONLY(), fakeActuals(new Error('db down')));
    await expect(provider.computeFeatures('sec-aapl', T)).rejects.toThrow('db down');
  });

  it('actuals: without actualsSource, estimate-only rows → MISSING (unchanged)', async () => {
    const provider = makeProvider(ESTIMATE_ONLY()); // no source
    const f = (await provider.computeFeatures('sec-aapl', T)).find(x => x.key === 'epsSurprisePct');
    expect(f!.availability).not.toBe('AVAILABLE');
    expect(f!.value).toBeNull();
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
