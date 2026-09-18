/**
 * ═══════════════════════════════════════════════════════════════════════
 *  SYNTHETIC END-TO-END PIPELINE — INFRASTRUCTURE DEMO, NOT RESEARCH
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Runs the COMPLETE vendor-neutral V5-C data path over the labeled
 * synthetic fixture — no vendor file, no Postgres, no network:
 *
 *   synthetic CanonicalConsensusSnapshot[]
 *     → runCanonicalIngest (zero-coverage filter → normalize → PIT validate → store)
 *     → runPitAudit (frozen thresholds 60/80/5)
 *     → consensusAt PIT reconstruction (observationDate <= T AND availableAt <= T)
 *     → synthetic stub ScoreEngine (labeled — NOT the V5-C model)
 *     → runOosPass over fixed dates → decideGoNoGo (frozen rule)
 *
 * The output is an EXECUTION-ONLY demonstration that the wiring works.
 * It MUST NOT be cited as evidence of predictive performance.
 */

import {
  InMemoryConsensusStore,
  runCanonicalIngest,
  IngestManifest,
} from './canonical-ingest';
import { runPitAudit, PitAuditReport } from './empirical-pit-audit';
import {
  runOosPass,
  decideGoNoGo,
  OosMetrics,
  GoNoGoReport,
} from './v5c-oos-harness';
import { FROZEN_OOS_WINDOW } from './oos-coverage';
import {
  SYNTHETIC_SNAPSHOTS,
  SYNTHETIC_REVISIONS,
  SYNTHETIC_UNIVERSE,
  SYNTHETIC_TICKER_NAMES,
  syntheticTickerResolver,
} from './__fixtures__/synthetic-pit-consensus';
import { makeSyntheticScoreEngine } from './__fixtures__/synthetic-score-engine';

export const SYNTHETIC_PIPELINE_LABEL =
  'SYNTHETIC TEST DATA — PIPELINE EXECUTION CHECK — NOT A V5-C RESEARCH RESULT' as const;

export interface SyntheticPipelineResult {
  label: typeof SYNTHETIC_PIPELINE_LABEL;
  manifest: IngestManifest;
  audit: PitAuditReport;
  oos: { metrics: OosMetrics; consensusCoveragePct: number };
  goNoGo: GoNoGoReport;
  store: InMemoryConsensusStore;
}

/**
 * Deterministic synthetic forward returns — fixed per (securityId, asOf)
 * so the OOS pass is reproducible. NOT market data.
 */
function syntheticForwardReturn(securityId: string, asOfTime: string): number | null {
  // Deterministic pseudo-return from a hash-free stable mapping.
  const seed = `${securityId}|${asOfTime}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ((h % 4000) - 2000) / 100; // range ≈ [-20, +20] %
}

/** Fixed synthetic observation dates inside the frozen window. */
export const SYNTHETIC_OBSERVATION_DATES = [
  '2024-03-01T00:00:00.000Z',
  '2024-08-01T00:00:00.000Z',
] as const;

export async function runSyntheticPipeline(): Promise<SyntheticPipelineResult> {
  // ─── 1. Canonical ingest (synthetic snapshots → facts → store) ───
  const store = new InMemoryConsensusStore();
  const manifest = await runCanonicalIngest(
    [...SYNTHETIC_SNAPSHOTS],
    [...SYNTHETIC_REVISIONS],
    syntheticTickerResolver(),
    store,
    { zeroCoverageIsNonObservation: true },
  );

  // ─── 2. Empirical PIT audit (frozen thresholds) ───
  const audit = runPitAudit(
    {
      facts: store.facts,
      revisions: store.revisions,
      tickerHistory: SYNTHETIC_TICKER_NAMES,
    },
    new Date(`${FROZEN_OOS_WINDOW.start}T00:00:00.000Z`),
    new Date(`${FROZEN_OOS_WINDOW.end}T00:00:00.000Z`),
    SYNTHETIC_UNIVERSE,
  );

  // ─── 3. OOS pass with the labeled stub engine ───
  const engine = makeSyntheticScoreEngine(store.facts);
  const oos = await runOosPass(
    engine.scoreUniverse,
    [...SYNTHETIC_UNIVERSE],
    SYNTHETIC_OBSERVATION_DATES,
    syntheticForwardReturn,
  );

  // ─── 4. Frozen Go/No-Go (expected NO-GO — synthetic data proves nothing) ───
  const goNoGo = decideGoNoGo(oos.metrics, oos.consensusCoveragePct);

  return { label: SYNTHETIC_PIPELINE_LABEL, manifest, audit, oos, goNoGo, store };
}
