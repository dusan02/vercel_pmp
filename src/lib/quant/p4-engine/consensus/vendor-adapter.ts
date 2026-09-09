/**
 * Vendor Consensus Adapter Interface
 * ====================================
 *
 * Clean adapter boundary so vendor samples can be plugged in without
 * changing the core PIT model.
 *
 * Architecture:
 *
 *   Vendor raw sample
 *       ↓
 *   Vendor adapter (implements ConsensusVendorAdapter)
 *       ↓
 *   Canonical consensus schema (ConsensusFactRow / PitConsensusFact)
 *       ↓
 *   PIT validation (vendor-empirical-gate.ts)
 *       ↓
 *   PitConsensusFact / PitConsensusRevision (DB)
 *       ↓
 *   consensusAt(T) reconstruction
 *       ↓
 *   V5
 *
 * Each vendor has its own adapter that parses vendor-specific formats.
 * The adapter outputs canonical ConsensusFactRow objects that the
 * PIT reconstruction logic understands.
 *
 * Do NOT assume field names or timestamp semantics until the real
 * vendor sample is inspected. The adapter is a skeleton — actual
 * parsing logic is added when sample data arrives.
 */

import { ConsensusFactRow } from './consensus-feature-calculators';

// ─── Canonical Types ─────────────────────────────────────────────────────────

/**
 * Canonical consensus snapshot — vendor-agnostic.
 * All vendor adapters must produce this format.
 */
export interface CanonicalConsensusSnapshot {
  securityId: string;
  ticker: string;
  cik: string | null;

  fiscalYear: number;
  fiscalPeriod: string;      // 'Q1', 'Q2', 'Q3', 'Q4', 'FY'
  periodEndDate: Date;       // fiscal period end

  // PIT timestamp — THE CRITICAL FIELD
  // This is the date the consensus was KNOWN/AVAILABLE to the market.
  // NOT the period end date. NOT the report date.
  // The vendor MUST provide this. If they don't, adapter returns null
  // and the vendor is rejected at the PIT gate.
  knownAt: Date;

  metricType: string;        // 'EPS' | 'REVENUE'
  consensusMean: number | null;
  consensusMedian: number | null;
  consensusHigh: number | null;
  consensusLow: number | null;
  consensusStdDev: number | null;
  analystCount: number | null;

  actualValue: number | null;
  actualReportDate: Date | null;

  sourceProvider: string;    // 'ZACKS' | 'ESTIMIZE' | 'NASDAQ_DL'
  sourceType: string;        // 'ZEE' | 'CSV' | 'API'
  sourceRecordHash: string;
}

/**
 * Canonical revision event — vendor-agnostic.
 */
export interface CanonicalRevisionEvent {
  securityId: string;
  ticker: string;

  fiscalYear: number;
  fiscalPeriod: string;
  periodEndDate: Date;

  revisionDate: Date;        // when the revision was published (PIT timestamp)
  analystId: string | null;
  analystName: string | null;

  metricType: string;
  priorEstimate: number | null;
  newEstimate: number | null;

  sourceProvider: string;
  sourceType: string;
  sourceRecordHash: string;
}

// ─── Adapter Interface ───────────────────────────────────────────────────────

/**
 * Every vendor adapter must implement this interface.
 * The adapter takes raw vendor data (CSV, JSON, API response) and
 * produces canonical consensus snapshots.
 *
 * The adapter does NOT write to the database. It only transforms data.
 * Database writing is handled by the ingest pipeline after PIT validation.
 */
export interface ConsensusVendorAdapter {
  /** Vendor name (e.g. 'ZACKS', 'ESTIMIZE') */
  readonly vendorName: string;

  /** Check if the adapter has the necessary credentials/config */
  isAvailable(): boolean;

  /** Describe the current status (for logging/diagnostics) */
  describeStatus(): string;

  /**
   * Parse raw vendor data into canonical consensus snapshots.
   *
   * @param rawData The raw vendor data (file contents, API response, etc.)
   * @returns Array of canonical snapshots, or null if parsing fails
   *
   * ⚠️  The adapter MUST verify that each snapshot has a valid knownAt timestamp.
   *     If the vendor data does not include observation/known timestamps,
   *     return null — do NOT fabricate timestamps.
   */
  parseSnapshots(rawData: unknown): CanonicalConsensusSnapshot[] | null;

  /**
   * Parse raw vendor data into canonical revision events.
   *
   * @param rawData The raw vendor data
   * @returns Array of canonical revisions, or null if not available
   */
  parseRevisions(rawData: unknown): CanonicalRevisionEvent[] | null;

  /**
   * Validate the adapter's output before it enters the PIT gate.
   * This is a self-check, not a substitute for the empirical PIT gate.
   *
   * @param snapshots The parsed snapshots
   * @returns Array of validation errors (empty = valid)
   */
  validateOutput(snapshots: CanonicalConsensusSnapshot[]): string[];
}

// ─── Base Adapter Implementation ─────────────────────────────────────────────

/**
 * Base class with common validation logic.
 * Vendor adapters extend this and implement parseSnapshots/parseRevisions.
 */
export abstract class BaseConsensusAdapter implements ConsensusVendorAdapter {
  abstract readonly vendorName: string;
  abstract isAvailable(): boolean;
  abstract describeStatus(): string;
  abstract parseSnapshots(rawData: unknown): CanonicalConsensusSnapshot[] | null;
  abstract parseRevisions(rawData: unknown): CanonicalRevisionEvent[] | null;

  validateOutput(snapshots: CanonicalConsensusSnapshot[]): string[] {
    const errors: string[] = [];

    for (let i = 0; i < snapshots.length; i++) {
      const s = snapshots[i];
      const prefix = `Snapshot[${i}] (${s.ticker} ${s.fiscalPeriod} ${s.metricType}):`;

      // knownAt is MANDATORY
      if (!s.knownAt || isNaN(s.knownAt.getTime())) {
        errors.push(`${prefix} missing or invalid knownAt timestamp`);
      }

      // periodEndDate is MANDATORY
      if (!s.periodEndDate || isNaN(s.periodEndDate.getTime())) {
        errors.push(`${prefix} missing or invalid periodEndDate`);
      }

      // knownAt must not be after actualReportDate (if present)
      if (s.knownAt && s.actualReportDate && s.knownAt.getTime() > s.actualReportDate.getTime()) {
        errors.push(`${prefix} knownAt > actualReportDate — consensus known after earnings report`);
      }

      // metricType must be valid
      if (s.metricType !== 'EPS' && s.metricType !== 'REVENUE') {
        errors.push(`${prefix} invalid metricType '${s.metricType}'`);
      }

      // consensusMean should be a number or null
      if (s.consensusMean !== null && typeof s.consensusMean !== 'number') {
        errors.push(`${prefix} consensusMean is not a number`);
      }

      // securityId or ticker must be present
      if (!s.securityId && !s.ticker) {
        errors.push(`${prefix} missing both securityId and ticker`);
      }
    }

    return errors;
  }
}

// ─── Zacks Adapter (Skeleton) ────────────────────────────────────────────────

/**
 * Zacks consensus adapter.
 *
 * ⚠️  SKELETON ONLY — do not implement parsing logic until a real
 *     Zacks sample is received and the raw schema is inspected.
 *
 * When a sample arrives:
 *   1. Inspect the raw data format (CSV columns, JSON fields)
 *   2. Identify the knownAt timestamp field (observation date, per_date, etc.)
 *   3. Map vendor fields to CanonicalConsensusSnapshot
 *   4. Implement parseSnapshots()
 *   5. Run through PIT empirical gate
 */
export class ZacksConsensusAdapter extends BaseConsensusAdapter {
  readonly vendorName = 'ZACKS';

  isAvailable(): boolean {
    return !!process.env.ZACKS_API_KEY || !!process.env.NASDAQ_DATA_LINK_API_KEY;
  }

  describeStatus(): string {
    if (process.env.NASDAQ_DATA_LINK_API_KEY) {
      return 'Zacks: Nasdaq Data Link API key configured (but free tier lacks PIT — see v5-pit-probe-report.md)';
    }
    if (process.env.ZACKS_API_KEY) {
      return 'Zacks: Direct API key configured';
    }
    return 'Zacks: NO API KEY';
  }

  parseSnapshots(_rawData: unknown): CanonicalConsensusSnapshot[] | null {
    // ⚠️ NOT IMPLEMENTED — awaiting real vendor sample
    // Do NOT implement until we have inspected actual Zacks data format.
    // The free NDL tier returns only current consensus (no historical snapshots).
    // Premium/direct Zacks data format is unknown until sample arrives.
    throw new Error('ZacksConsensusAdapter.parseSnapshots: NOT IMPLEMENTED — awaiting vendor sample');
  }

  parseRevisions(_rawData: unknown): CanonicalRevisionEvent[] | null {
    throw new Error('ZacksConsensusAdapter.parseRevisions: NOT IMPLEMENTED — awaiting vendor sample');
  }
}

// ─── Estimize Adapter (Skeleton) ─────────────────────────────────────────────

/**
 * Estimize consensus adapter.
 *
 * ⚠️  SKELETON ONLY — do not implement until a real Estimize sample is received.
 *
 * Estimize API endpoints (from docs):
 *   GET /releases/:id/consensus — revisions array with updated_at
 *   GET /releases/:id/estimates — individual estimates with created_at
 *   GET /releases — list releases by ticker/date
 */
export class EstimizeConsensusAdapter extends BaseConsensusAdapter {
  readonly vendorName = 'ESTIMIZE';

  isAvailable(): boolean {
    return !!process.env.ESTIMIZE_API_KEY;
  }

  describeStatus(): string {
    if (process.env.ESTIMIZE_API_KEY) {
      return 'Estimize: API key configured';
    }
    return 'Estimize: NO API KEY — set ESTIMIZE_API_KEY in .env';
  }

  parseSnapshots(_rawData: unknown): CanonicalConsensusSnapshot[] | null {
    // ⚠️ NOT IMPLEMENTED — awaiting real vendor sample
    // Estimize uses created_at for estimates and updated_at for consensus revisions.
    // These need to be mapped to knownAt in the canonical schema.
    throw new Error('EstimizeConsensusAdapter.parseSnapshots: NOT IMPLEMENTED — awaiting vendor sample');
  }

  parseRevisions(_rawData: unknown): CanonicalRevisionEvent[] | null {
    throw new Error('EstimizeConsensusAdapter.parseRevisions: NOT IMPLEMENTED — awaiting vendor sample');
  }
}

// ─── Conversion: Canonical → DB Row ──────────────────────────────────────────

/**
 * Convert a canonical snapshot to a ConsensusFactRow for PIT reconstruction.
 * This is the bridge between the adapter output and the reconstruction logic.
 */
export function canonicalToFactRow(s: CanonicalConsensusSnapshot): ConsensusFactRow {
  return {
    id: s.sourceRecordHash,
    securityId: s.securityId,
    fiscalYear: s.fiscalYear,
    fiscalPeriod: s.fiscalPeriod,
    periodEndDate: s.periodEndDate,
    observationDate: s.knownAt,  // knownAt → observationDate in DB schema
    availableAt: s.knownAt,
    metricType: s.metricType,
    consensusMean: s.consensusMean,
    consensusMedian: s.consensusMedian,
    consensusHigh: s.consensusHigh,
    consensusLow: s.consensusLow,
    consensusStdDev: s.consensusStdDev,
    analystCount: s.analystCount,
    actualValue: s.actualValue,
    actualReportDate: s.actualReportDate,
  };
}
