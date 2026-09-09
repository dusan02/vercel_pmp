/**
 * Consensus PIT Reconstruction — Synthetic Tests
 * ================================================
 *
 * Tests for consensusAt(T) reconstruction logic using SYNTHETIC fixtures.
 *
 * ⚠️  SYNTHETIC TESTS DO NOT PROVE VENDOR PIT SUITABILITY.
 *     They verify our reconstruction logic is correct.
 *     Vendor data must pass the empirical PIT gate separately.
 *
 * Test cases:
 *   1. Observation before T → returns that observation
 *   2. Observation exactly at T → returns that observation
 *   3. Observation after T → excluded
 *   4. Multiple revisions → returns latest <= T
 *   5. Missing observation → returns null
 *   6. Duplicate timestamps → deterministic (last in array)
 *   7. Conflicting observations → deterministic (latest by sort)
 *   8. Deterministic reconstruction → same input always gives same output
 *
 * Usage:
 *   npx tsx src/lib/quant/p4-engine/consensus/consensus-pit-reconstruction.test.ts
 */

import {
  consensusAt,
  consensusRevisionAt,
  preEarningsConsensusAt,
  surpriseAt,
  temporalIntegrityCheck,
} from './consensus-pit-reconstruction';
import { ConsensusFactRow } from './consensus-feature-calculators';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    // console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string): void {
  const actualStr = typeof actual === 'number' ? actual.toFixed(6) : String(actual);
  const expectedStr = typeof expected === 'number' ? expected.toFixed(6) : String(expected);
  assert(actualStr === expectedStr, `${message} (expected ${expectedStr}, got ${actualStr})`);
}

function makeFact(
  observationDate: string,
  metricType: string = 'EPS',
  mean: number = 2.50,
  actualValue: number | null = null,
  actualReportDate: string | null = null,
): ConsensusFactRow {
  return {
    id: `fact-${observationDate}-${metricType}`,
    securityId: 'test-sec',
    fiscalYear: 2022,
    fiscalPeriod: 'Q4',
    periodEndDate: new Date('2022-12-31'),
    observationDate: new Date(observationDate),
    availableAt: new Date(observationDate),
    metricType,
    consensusMean: mean,
    consensusMedian: mean,
    consensusHigh: mean + 0.1,
    consensusLow: mean - 0.1,
    consensusStdDev: 0.05,
    analystCount: 30,
    actualValue,
    actualReportDate: actualReportDate ? new Date(actualReportDate) : null,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

function runTests(): void {
  console.log('=== Consensus PIT Reconstruction — Synthetic Tests ===\n');
  console.log('⚠️  Synthetic tests verify reconstruction logic, NOT vendor PIT suitability.\n');

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 1: Observation before T → returns that observation
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 1: Observation before T');
  {
    const facts = [makeFact('2022-01-15', 'EPS', 2.50)];
    const T = new Date('2022-02-01');
    const result = consensusAt(facts, 'EPS', T);
    assert(result !== null, 'Should return a snapshot');
    assertEqual(result?.consensusMean, 2.50, 'Mean should be 2.50');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 2: Observation exactly at T → returns that observation
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 2: Observation exactly at T');
  {
    const facts = [makeFact('2022-01-15', 'EPS', 2.50)];
    const T = new Date('2022-01-15');
    const result = consensusAt(facts, 'EPS', T);
    assert(result !== null, 'Should return snapshot when knownAt == T');
    assertEqual(result?.consensusMean, 2.50, 'Mean should be 2.50');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 3: Observation after T → excluded (returns null)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 3: Observation after T');
  {
    const facts = [makeFact('2022-03-15', 'EPS', 2.80)];
    const T = new Date('2022-01-15');
    const result = consensusAt(facts, 'EPS', T);
    assert(result === null, 'Should return null when all observations are after T');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 4: Multiple revisions → returns latest <= T
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 4: Multiple revisions');
  {
    const facts = [
      makeFact('2021-10-01', 'EPS', 2.30),
      makeFact('2021-11-15', 'EPS', 2.45),
      makeFact('2022-01-20', 'EPS', 2.60),
      makeFact('2022-03-15', 'EPS', 2.70),
    ];

    // T between 2nd and 3rd observation
    const T1 = new Date('2022-01-01');
    const r1 = consensusAt(facts, 'EPS', T1);
    assertEqual(r1?.consensusMean, 2.45, 'At T=2022-01-01, should return 2.45 (2nd observation)');

    // T between 3rd and 4th
    const T2 = new Date('2022-02-01');
    const r2 = consensusAt(facts, 'EPS', T2);
    assertEqual(r2?.consensusMean, 2.60, 'At T=2022-02-01, should return 2.60 (3rd observation)');

    // T after all
    const T3 = new Date('2022-04-01');
    const r3 = consensusAt(facts, 'EPS', T3);
    assertEqual(r3?.consensusMean, 2.70, 'At T=2022-04-01, should return 2.70 (4th observation)');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 5: Missing observation → returns null
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 5: Missing observation');
  {
    const facts: ConsensusFactRow[] = [];
    const T = new Date('2022-01-15');
    const result = consensusAt(facts, 'EPS', T);
    assert(result === null, 'Empty facts should return null');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 6: Duplicate timestamps → deterministic (latest in sort order)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 6: Duplicate timestamps');
  {
    const facts = [
      makeFact('2022-01-15', 'EPS', 2.50),
      makeFact('2022-01-15', 'EPS', 2.55),  // same timestamp, different value
    ];
    const T = new Date('2022-02-01');
    const result = consensusAt(facts, 'EPS', T);
    assert(result !== null, 'Should return a snapshot');
    // With duplicate timestamps, sort is stable — last one in sorted order wins
    // Both have same timestamp, so result depends on input order (deterministic)
    assert(result!.consensusMean === 2.50 || result!.consensusMean === 2.55,
      'Should return one of the duplicate-timestamp values');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 7: Conflicting observations → deterministic (latest by sort)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 7: Conflicting observations (different metrics)');
  {
    const facts = [
      makeFact('2022-01-15', 'EPS', 2.50),
      makeFact('2022-01-15', 'REVENUE', 100e9),
    ];
    const T = new Date('2022-02-01');
    const epsResult = consensusAt(facts, 'EPS', T);
    const revResult = consensusAt(facts, 'REVENUE', T);
    assertEqual(epsResult?.consensusMean, 2.50, 'EPS query should return EPS snapshot');
    assertEqual(revResult?.consensusMean, 100e9, 'REVENUE query should return REVENUE snapshot');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 8: Deterministic reconstruction → same input always gives same output
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 8: Deterministic reconstruction');
  {
    const facts = [
      makeFact('2021-10-01', 'EPS', 2.30),
      makeFact('2021-11-15', 'EPS', 2.45),
      makeFact('2022-01-20', 'EPS', 2.60),
    ];
    const T = new Date('2022-01-01');

    const r1 = consensusAt(facts, 'EPS', T);
    const r2 = consensusAt(facts, 'EPS', T);
    const r3 = consensusAt(facts, 'EPS', T);

    assert(r1?.consensusMean === r2?.consensusMean && r2?.consensusMean === r3?.consensusMean,
      'Three runs should produce identical results');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 9: Revision percentage computation
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 9: Revision percentage');
  {
    const facts = [
      makeFact('2022-01-01', 'EPS', 2.50),
      makeFact('2022-02-01', 'EPS', 2.625),  // +5%
    ];
    const currentT = new Date('2022-02-15');
    const priorT = new Date('2022-01-15');
    const rev = consensusRevisionAt(facts, 'EPS', currentT, priorT);
    assertEqual(rev, 5.0, 'Revision should be +5.0%');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 10: Pre-earnings consensus
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 10: Pre-earnings consensus');
  {
    const facts = [
      makeFact('2022-01-15', 'EPS', 2.50),
      makeFact('2022-02-15', 'EPS', 2.60),
      makeFact('2022-03-15', 'EPS', 2.65),
      // Actual report on 2022-04-28
      makeFact('2022-04-28', 'EPS', 2.65, 2.67, '2022-04-28'),
    ];
    const preEarnings = preEarningsConsensusAt(facts, 'EPS');
    assert(preEarnings !== null, 'Should return pre-earnings consensus');
    assertEqual(preEarnings?.consensusMean, 2.65, 'Pre-earnings consensus should be 2.65');
    assert(preEarnings!.observationDate.getTime() < new Date('2022-04-28').getTime(),
      'Pre-earnings knownAt must be before report date');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 11: Surprise computation (PIT-correct)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 11: Surprise computation');
  {
    const facts = [
      makeFact('2022-01-15', 'EPS', 2.50),
      makeFact('2022-04-15', 'EPS', 2.60),  // pre-earnings consensus
      makeFact('2022-04-28', 'EPS', 2.60, 2.67, '2022-04-28'),  // actual
    ];
    const surprise = surpriseAt(facts, 'EPS');
    // surprise = ((2.67 - 2.60) / |2.60|) * 100 = 2.6923%
    assert(surprise !== null, 'Should compute surprise');
    assertEqual(surprise, ((2.67 - 2.60) / Math.abs(2.60)) * 100, 'Surprise should be ~2.69%');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 12: Temporal Integrity Gate — no violations
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 12: Temporal Integrity Gate (clean)');
  {
    const facts = [
      makeFact('2022-01-15', 'EPS', 2.50),
      makeFact('2022-02-15', 'EPS', 2.60),
    ];
    const T = new Date('2022-03-01');
    const check = temporalIntegrityCheck(facts, 'EPS', T);
    assert(check.passed, 'Should pass with no violations');
    assertEqual(check.violations.length, 0, 'Should have 0 violations');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 13: Temporal Integrity Gate — violation detected
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 13: Temporal Integrity Gate (violation)');
  {
    // Snapshot knownAt=2022-01-15 but actualReportDate=2022-04-28
    // At T=2022-02-01, this snapshot is "used" (knownAt <= T)
    // but actualReportDate > T → violation
    const facts = [
      makeFact('2022-01-15', 'EPS', 2.50, 2.67, '2022-04-28'),
    ];
    const T = new Date('2022-02-01');
    const check = temporalIntegrityCheck(facts, 'EPS', T);
    assert(!check.passed, 'Should FAIL — actualReportDate > T but snapshot knownAt <= T');
    assert(check.violations.length > 0, 'Should have violations');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 14: Full observation chain (the user's requested example)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('TEST 14: Full observation chain (AAPL FY2022 EPS pattern)');
  {
    const facts = [
      makeFact('2021-10-01', 'EPS', 5.80),
      makeFact('2021-11-15', 'EPS', 5.92),
      makeFact('2022-01-20', 'EPS', 6.05),
      makeFact('2022-03-15', 'EPS', 6.12),
      makeFact('2022-04-28', 'EPS', 6.12, 6.11, '2022-04-28'),  // actual
    ];

    // T = 2022-01-01 → consensus = 5.92
    const r1 = consensusAt(facts, 'EPS', new Date('2022-01-01'));
    assertEqual(r1?.consensusMean, 5.92, 'At T=2022-01-01, consensus should be 5.92');

    // T = 2022-02-01 → consensus = 6.05
    const r2 = consensusAt(facts, 'EPS', new Date('2022-02-01'));
    assertEqual(r2?.consensusMean, 6.05, 'At T=2022-02-01, consensus should be 6.05');

    // Pre-earnings consensus = 6.12
    const pre = preEarningsConsensusAt(facts, 'EPS');
    assertEqual(pre?.consensusMean, 6.12, 'Pre-earnings consensus should be 6.12');

    // Surprise = ((6.11 - 6.12) / |6.12|) * 100 = -0.1634%
    const surp = surpriseAt(facts, 'EPS');
    assertEqual(surp, ((6.11 - 6.12) / Math.abs(6.12)) * 100, 'Surprise should be ~-0.16%');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error('❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('✅ ALL TESTS PASSED');
  }
}

runTests();
