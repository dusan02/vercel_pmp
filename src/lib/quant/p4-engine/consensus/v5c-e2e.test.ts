/**
 * ═══════════════════════════════════════════════════════════════════════
 *  SYNTHETIC END-TO-END PIPELINE TEST — NOT A V5-C RESEARCH RESULT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Proves the COMPLETE V5-C data path executes end-to-end with no real vendor:
 *
 *   synthetic snapshots (labeled)
 *   → canonical ingest (zero-coverage filter → normalize → PIT validate → store)
 *   → empirical PIT audit (frozen thresholds)
 *   → consensus reconstruction at as-of T
 *   → synthetic stub engine → OOS pass → frozen Go/No-Go report
 *
 * NO real market data, NO vendor files, NO DB writes.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryConsensusStore, runCanonicalIngest } from './canonical-ingest';
import { runPitAudit } from './empirical-pit-audit';
import { ConsensusFactRow } from './consensus-feature-calculators';
import { consensusAt } from './consensus-pit-reconstruction';
import {
  runSyntheticPipeline,
  SYNTHETIC_PIPELINE_LABEL,
} from './synthetic-e2e-pipeline';
import {
  makeSyntheticSnapshot,
  syntheticTickerResolver,
  SYNTHETIC_UNIVERSE,
  SYNTHETIC_TICKER_NAMES,
} from './__fixtures__/synthetic-pit-consensus';
import { FROZEN_OOS_WINDOW } from './oos-coverage';

const OOS_START = new Date(`${FROZEN_OOS_WINDOW.start}T00:00:00.000Z`);
const OOS_END = new Date(`${FROZEN_OOS_WINDOW.end}T00:00:00.000Z`);

describe('V5-C synthetic end-to-end (infrastructure only — not research)', () => {
  it('full chain: ingest → audit → PIT lookup → OOS pass → Go/No-Go', async () => {
    const { label, manifest, audit, oos, goNoGo, store } = await runSyntheticPipeline();

    // ─── Labeled ───
    expect(label).toBe(SYNTHETIC_PIPELINE_LABEL);

    // ─── Ingest: zero-coverage row excluded, DEADC post-termination quarantined ───
    // Snapshots: 5 AAPL EPS + 3 AAPL REV + 1 AAPL FY + 4 MSFT + 2 DEADC = 15
    // minus 1 zero-coverage (MSFT) = 14 → minus 1 quarantined DEADC = 13 facts
    expect(manifest.report.rawCount).toBe(15);
    expect(manifest.nonObservationRowsExcluded).toBe(1);
    expect(manifest.factsInserted).toBe(13);
    expect(manifest.factDuplicates).toBe(0);
    expect(manifest.quarantine.length).toBe(1); // DEADC after termination
    expect(manifest.validation.factErrors).toBe(0);
    expect(manifest.revisionsInserted).toBeGreaterThan(0);

    // ─── Audit runs and reports (synthetic fixture is NOT built to pass the
    // gate — tiny universe, 2 covered months; assert diagnostics, not pass) ───
    expect(audit.coverage.totalFacts).toBe(13);
    expect(audit.coverage.securitiesCovered).toBe(3);
    expect(typeof audit.passed).toBe('boolean');
    expect(audit.classification.valid).toBe(13);
    expect(audit.classification.malformed).toBe(0);
    // zero-coverage row was excluded → no null means ingested
    expect(audit.missingness.nullConsensusMeanPct).toBe(0);
    // DEADC post-termination row quarantined → no rename cases expected beyond fixture
    expect(Array.isArray(audit.tickerRenames)).toBe(true);

    // ─── PIT reconstruction: future/late rows invisible at T ───
    const rows = store.facts.map(f => ({ ...f, id: f.sourceRecordHash })) as ConsensusFactRow[];
    const asOf = new Date('2024-03-15T00:00:00.000Z');
    const aapl = consensusAt(
      rows.filter(r => r.securityId === 'sec-syn-aapl'),
      'EPS',
      asOf,
    );
    expect(aapl).not.toBeNull();
    // AAPL EPS snapshots: 01-05, 02-05, (03-25 pub-lag — NOT yet usable), 04-10...
    // Latest usable at 03-15 = 2024-02-05.
    expect(aapl!.observationDate.getTime()).toBeLessThanOrEqual(asOf.getTime());
    expect(aapl!.availableAt.getTime()).toBeLessThanOrEqual(asOf.getTime());
    expect(aapl!.observationDate.toISOString().slice(0, 10)).toBe('2024-02-05');

    // ─── OOS pass executes deterministically ───
    expect(typeof oos.metrics.pearson).toBe('number'); // or null — just must not crash
    expect(oos.consensusCoveragePct).toBeGreaterThanOrEqual(0);
    expect(oos.consensusCoveragePct).toBeLessThanOrEqual(100);

    // ─── Frozen Go/No-Go produces a decision (NO-GO expected — synthetic) ───
    expect(['GO', 'NO-GO']).toContain(goNoGo.decision);
    expect(goNoGo.consensusCoveragePct).toBe(oos.consensusCoveragePct);
  });

  it('is deterministic — two runs produce identical reports', async () => {
    const a = await runSyntheticPipeline();
    const b = await runSyntheticPipeline();
    expect(a.oos.metrics).toEqual(b.oos.metrics);
    expect(a.manifest.factsInserted).toBe(b.manifest.factsInserted);
    expect(a.goNoGo.decision).toBe(b.goNoGo.decision);
  });

  it('audit classification distinguishes missing vs zero-coverage rows', async () => {
    // zeroCoverageIsNonObservation OFF → null-mean rows land in store and the
    // audit classifies them instead of silently excluding.
    const store = new InMemoryConsensusStore();
    const snaps = [
      makeSyntheticSnapshot({ knownAt: new Date('2024-02-10'), consensusMean: 1.0, analystCount: 5 }),
      makeSyntheticSnapshot({ // real missingness: null mean WITH coverage
        knownAt: new Date('2024-02-11'), consensusMean: null, analystCount: 4,
      }),
      makeSyntheticSnapshot({ // zero-coverage-like: null mean + 0 analysts
        knownAt: new Date('2024-02-12'), consensusMean: null, analystCount: 0,
        consensusHigh: null, consensusLow: null, consensusStdDev: null,
      }),
    ];
    await runCanonicalIngest(snaps, null, syntheticTickerResolver(), store, {
      zeroCoverageIsNonObservation: false,
    });
    const audit = runPitAudit(
      { facts: store.facts, revisions: [], tickerHistory: SYNTHETIC_TICKER_NAMES },
      OOS_START, OOS_END, SYNTHETIC_UNIVERSE,
    );
    expect(audit.classification.valid).toBe(1);
    expect(audit.classification.nullMeanWithCoverage).toBe(1);
    expect(audit.classification.zeroCoverageLike).toBe(1);
    expect(audit.missingness.nullConsensusMeanPct).toBeCloseTo(66.67, 1);
  });
});
