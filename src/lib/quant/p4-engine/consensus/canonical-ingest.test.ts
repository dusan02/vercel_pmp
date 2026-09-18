/**
 * Canonical Ingest — Vendor-Neutral Pipeline Tests
 * ==================================================
 *
 * Tests the vendor-independent ingest path over the SYNTHETIC fixture:
 *   CanonicalConsensusSnapshot[] → non-observation filter → buildFactRows
 *   → PIT validation → InMemoryConsensusStore → manifest
 *
 * Includes the Task-5 zero-coverage rule: a vendor row with a null
 * consensus mean AND zero analyst coverage is a NON-OBSERVATION
 * (excluded before missingness is measured) when — and only when —
 * the vendor documents that semantics. The frozen 5% missingness gate
 * is unchanged.
 */

import { describe, it, expect } from 'vitest';
import {
  runCanonicalIngest,
  InMemoryConsensusStore,
  isZeroCoverageNonObservation,
} from './canonical-ingest';
import {
  SYNTHETIC_SNAPSHOTS,
  SYNTHETIC_REVISIONS,
  MSFT_Q2_EPS,
  AAPL_Q1_EPS,
  syntheticTickerResolver,
  makeSyntheticSnapshot,
} from './__fixtures__/synthetic-pit-consensus';
import { runPitAudit, FROZEN_AUDIT_THRESHOLDS } from './empirical-pit-audit';

const resolver = syntheticTickerResolver();

describe('runCanonicalIngest — synthetic pipeline', () => {
  it('ingests clean synthetic snapshots into the store', async () => {
    const store = new InMemoryConsensusStore();
    const manifest = await runCanonicalIngest(
      [...SYNTHETIC_SNAPSHOTS],
      [...SYNTHETIC_REVISIONS],
      resolver,
      store,
      { zeroCoverageIsNonObservation: true },
    );

    // 14 snapshots − 1 zero-coverage non-observation = 13 candidates;
    // DEADC post-termination snapshot quarantined → 12 facts
    expect(manifest.nonObservationRowsExcluded).toBe(1);
    expect(manifest.quarantine.some(q => q.reason === 'TICKER_UNRESOLVED')).toBe(true);
    expect(manifest.factsInserted).toBe(store.facts.length);
    expect(manifest.factsInserted).toBeGreaterThan(0);
    expect(manifest.revisionsInserted).toBe(SYNTHETIC_REVISIONS.length);
    expect(manifest.validation.factErrors).toBe(0);
  });

  it('is idempotent — re-ingesting inserts nothing', async () => {
    const store = new InMemoryConsensusStore();
    const snaps = [...SYNTHETIC_SNAPSHOTS];
    await runCanonicalIngest(snaps, null, resolver, store, { zeroCoverageIsNonObservation: true });
    const first = store.facts.length;
    const second = await runCanonicalIngest(snaps, null, resolver, store, { zeroCoverageIsNonObservation: true });
    expect(second.factsInserted).toBe(0);
    expect(second.factDuplicates).toBe(first);
  });

  it('resolves delisted ticker PIT-correctly (pre-termination OK, post quarantined)', async () => {
    const store = new InMemoryConsensusStore();
    const manifest = await runCanonicalIngest(
      [...SYNTHETIC_SNAPSHOTS], null, resolver, store,
      { zeroCoverageIsNonObservation: true },
    );
    const deadc = store.facts.filter(f => f.securityId === 'sec-syn-dead');
    expect(deadc).toHaveLength(1); // only the 2020 snapshot resolved
    expect(deadc[0]!.fiscalYear).toBe(2020);
    expect(manifest.quarantine.filter(q => q.reason === 'TICKER_UNRESOLVED')).toHaveLength(1);
  });
});

describe('zero-coverage non-observation rule (Task 5)', () => {
  it('predicate: null mean + zero coverage = non-observation', () => {
    const zeroCov = makeSyntheticSnapshot({ consensusMean: null, analystCount: 0 });
    const nullCnt = makeSyntheticSnapshot({ consensusMean: null, analystCount: null });
    const realMissing = makeSyntheticSnapshot({ consensusMean: null, analystCount: 5 });
    const normal = makeSyntheticSnapshot({});

    expect(isZeroCoverageNonObservation(zeroCov)).toBe(true);
    expect(isZeroCoverageNonObservation(nullCnt)).toBe(true);
    expect(isZeroCoverageNonObservation(realMissing)).toBe(false); // real missingness stays
    expect(isZeroCoverageNonObservation(normal)).toBe(false);
  });

  it('excluded rows are not counted as missingness by the audit', async () => {
    const store = new InMemoryConsensusStore();
    // MSFT_Q2_EPS contains one zero-coverage row amid real observations
    await runCanonicalIngest([...MSFT_Q2_EPS], null, resolver, store, {
      zeroCoverageIsNonObservation: true,
    });
    // null-mean row never became a fact
    expect(store.facts.every(f => f.consensusMean !== null)).toBe(true);

    const audit = runPitAudit(
      { facts: store.facts, revisions: [], tickerHistory: new Map() },
      new Date('2024-05-01'), new Date('2024-07-31'),
      new Set(['sec-syn-msft']),
    );
    expect(audit.missingness.nullConsensusMeanPct).toBe(0);
  });

  it('without the flag, null-mean rows flow through and ARE measured', async () => {
    const store = new InMemoryConsensusStore();
    await runCanonicalIngest([...MSFT_Q2_EPS], null, resolver, store); // flag off
    const nullRows = store.facts.filter(f => f.consensusMean === null);
    expect(nullRows).toHaveLength(1);

    const audit = runPitAudit(
      { facts: store.facts, revisions: [], tickerHistory: new Map() },
      new Date('2024-05-01'), new Date('2024-07-31'),
      new Set(['sec-syn-msft']),
    );
    expect(audit.missingness.nullConsensusMeanPct).toBeCloseTo(25, 1); // 1 of 4
  });

  it('frozen missingness threshold is unchanged (5%)', () => {
    expect(FROZEN_AUDIT_THRESHOLDS.maxMissingMeanPct).toBe(5);
  });
});

describe('PIT validation in ingest — hard failures', () => {
  it('aborts on leakage (actual on pre-report snapshot)', async () => {
    const leaky = makeSyntheticSnapshot({
      knownAt: new Date('2024-04-10'),
      actualValue: 2.25,
      actualReportDate: new Date('2024-04-25'), // report AFTER observation
    });
    const store = new InMemoryConsensusStore();
    await expect(
      runCanonicalIngest([leaky], null, resolver, store),
    ).rejects.toThrow(/PIT VALIDATION FAILED/);
    expect(store.facts).toHaveLength(0); // nothing written
  });

  it('aborts on conflicting duplicate PK', async () => {
    const a = makeSyntheticSnapshot({ knownAt: new Date('2024-01-05'), consensusMean: 2.10 });
    const b = makeSyntheticSnapshot({ knownAt: new Date('2024-01-05'), consensusMean: 9.99 });
    const store = new InMemoryConsensusStore();
    await expect(runCanonicalIngest([a, b], null, resolver, store)).rejects.toThrow();
  });
});
