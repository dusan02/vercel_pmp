/**
 * Canonical Consensus Ingest — Vendor-Neutral Pipeline
 * =====================================================
 *
 * The vendor-independent half of the consensus pipeline:
 *
 *   CanonicalConsensusSnapshot[] (any vendor adapter output)
 *       ↓
 *   non-observation filtering (optional, per-vendor semantics)
 *       ↓
 *   buildFactRows / buildRevisionRows (normalize, dedup, supersede)
 *       ↓
 *   PIT validation (leakage = HARD FAIL — aborts)
 *       ↓
 *   ConsensusIngestStore (DB adapter or in-memory store)
 *       ↓
 *   IngestManifest (auditable record for the artifact chain)
 *
 * This module contains NO vendor-specific logic. Vendor adapters produce
 * canonical snapshots; this pipeline validates and persists them.
 *
 * Zero-coverage semantics (Task 5):
 *   Some vendors emit rows where the consensus mean is NULL because
 *   contributing coverage fell to zero — i.e. there IS no consensus,
 *   not a consensus with a missing value. Per vendor documentation this
 *   is a NON-OBSERVATION and must be excluded BEFORE canonical facts are
 *   built, otherwise it is miscounted as missingness by the audit.
 *   The exclusion is opt-in per vendor (zeroCoverageIsNonObservation)
 *   because the semantics are vendor-documented, not universal.
 *   Real missing observations (consensusMean null WITH contributing
 *   coverage) remain in the data and are still measured by the audit.
 *   The frozen missingness gate (maxMissingMeanPct = 5) is unchanged.
 */

import {
  CanonicalConsensusSnapshot,
  CanonicalRevisionEvent,
} from './vendor-adapter';
import {
  ConsensusFactInsert,
  ConsensusRevisionInsert,
  ConsensusIngestStore,
  IngestReport,
  QuarantineEntry,
  TickerResolver,
} from './consensus-ingest-types';
import {
  buildFactRows,
  buildRevisionRows,
  buildReport,
} from './estimize-ingest';
import {
  validateConsensusFacts,
  validateConsensusRevisions,
} from './pit-consensus-validator';

// ─── Non-observation filtering (zero-coverage rule) ─────────────────────────

/**
 * Returns true when a canonical snapshot represents "no contributing
 * coverage" rather than a consensus observation with a missing value:
 * consensusMean is null AND there is no analyst coverage
 * (analystCount === 0 or analystCount === null alongside the null mean).
 *
 * This predicate is only applied when the vendor documents that a null
 * mean means zero contributing coverage (e.g. Zacks EEH per Nasdaq's
 * confirmation). It is NOT applied by default — a null consensusMean on
 * a real observation is legitimate missingness the audit must measure.
 */
export function isZeroCoverageNonObservation(s: CanonicalConsensusSnapshot): boolean {
  return s.consensusMean === null && (s.analystCount === null || s.analystCount === 0);
}

export interface IngestOptions {
  /**
   * Vendor-documented semantics: a null consensus mean means zero
   * contributing coverage → the row is a non-observation and is
   * excluded before canonical facts are built (not counted as
   * missingness). Default false — null means are kept and measured.
   */
  zeroCoverageIsNonObservation?: boolean;
}

export interface IngestManifest {
  report: IngestReport;
  factsInserted: number;
  factDuplicates: number;
  revisionsInserted: number;
  revisionDuplicates: number;
  /** Vendor rows excluded as non-observations (zero-coverage rule) */
  nonObservationRowsExcluded: number;
  /** PIT validation stats — always reported, abort already happened on failure */
  validation: {
    factErrors: number;
    factWarnings: number;
    revisionErrors: number;
    revisionWarnings: number;
  };
  quarantine: QuarantineEntry[];
}

/**
 * Run the vendor-neutral ingest pipeline over canonical adapter output.
 *
 * Throws on PIT validation failure — leakage is a hard abort, the same
 * contract the Estimize CLI enforces (exit 1). Callers wanting the
 * validation report without aborting should call validateConsensusFacts
 * directly.
 */
export async function runCanonicalIngest(
  snapshots: CanonicalConsensusSnapshot[],
  revisions: CanonicalRevisionEvent[] | null,
  resolver: TickerResolver,
  store: ConsensusIngestStore,
  options: IngestOptions = {},
): Promise<IngestManifest> {
  const quarantine: QuarantineEntry[] = [];

  // ─── Zero-coverage exclusion (vendor-documented non-observations) ───
  let nonObservationRowsExcluded = 0;
  let effectiveSnapshots = snapshots;
  if (options.zeroCoverageIsNonObservation) {
    effectiveSnapshots = snapshots.filter(s => {
      if (isZeroCoverageNonObservation(s)) {
        nonObservationRowsExcluded++;
        return false;
      }
      return true;
    });
  }

  // ─── Normalize → canonical fact rows ───
  const factRows = buildFactRows(effectiveSnapshots, resolver, quarantine);

  // ─── PIT validation — HARD FAIL on leakage ───
  const factValidation = validateConsensusFacts(factRows);
  if (!factValidation.passed) {
    throw new Error(
      `PIT VALIDATION FAILED — ${factValidation.errors.length} hard failures. ` +
      `Ingest aborted. First error: ${factValidation.errors[0]}`,
    );
  }

  // ─── Write facts (idempotent via store) ───
  let factsInserted = 0;
  let factDuplicates = 0;
  for (const row of factRows) {
    const inserted = await store.insertFactIfAbsent(row);
    if (inserted) factsInserted++;
    else factDuplicates++;
  }

  // ─── Revisions (optional) ───
  let revisionRows: ConsensusRevisionInsert[] = [];
  let revisionsInserted = 0;
  let revisionDuplicates = 0;
  let revValidation = { passed: true, errors: [] as string[], warnings: [] as string[] };
  if (revisions && revisions.length > 0) {
    revisionRows = buildRevisionRows(revisions, resolver, quarantine);
    revValidation = validateConsensusRevisions(revisionRows);
    if (!revValidation.passed) {
      throw new Error(
        `REVISION VALIDATION FAILED — ${revValidation.errors.length} hard failures. ` +
        `Ingest aborted. First error: ${revValidation.errors[0]}`,
      );
    }
    for (const row of revisionRows) {
      const inserted = await store.insertRevisionIfAbsent(row);
      if (inserted) revisionsInserted++;
      else revisionDuplicates++;
    }
  }

  const report = buildReport(
    snapshots.length,
    factsInserted,
    factDuplicates,
    quarantine,
    factRows,
  );

  return {
    report,
    factsInserted,
    factDuplicates,
    revisionsInserted,
    revisionDuplicates,
    nonObservationRowsExcluded,
    validation: {
      factErrors: factValidation.errors.length,
      factWarnings: factValidation.warnings.length,
      revisionErrors: revValidation.errors.length,
      revisionWarnings: revValidation.warnings.length,
    },
    quarantine,
  };
}

// ─── In-memory store (tests, fixtures, dry runs) ────────────────────────────

/**
 * In-memory ConsensusIngestStore — the canonical ingest pipeline is fully
 * executable without Postgres. Used by tests, the synthetic fixture
 * chain, and local validation runs.
 */
export class InMemoryConsensusStore implements ConsensusIngestStore {
  readonly facts: ConsensusFactInsert[] = [];
  readonly revisions: ConsensusRevisionInsert[] = [];
  private factHashes = new Set<string>();
  private revisionHashes = new Set<string>();

  async insertFactIfAbsent(fact: ConsensusFactInsert): Promise<boolean> {
    if (this.factHashes.has(fact.sourceRecordHash)) return false;
    this.factHashes.add(fact.sourceRecordHash);
    this.facts.push(fact);
    return true;
  }

  async insertRevisionIfAbsent(revision: ConsensusRevisionInsert): Promise<boolean> {
    if (this.revisionHashes.has(revision.sourceRecordHash)) return false;
    this.revisionHashes.add(revision.sourceRecordHash);
    this.revisions.push(revision);
    return true;
  }
}
