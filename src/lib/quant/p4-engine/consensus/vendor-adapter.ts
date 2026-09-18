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
      const s = snapshots[i]!;
      const prefix = `Snapshot[${i}] (${s.ticker} ${s.fiscalPeriod} ${s.metricType}):`;

      // knownAt is MANDATORY
      if (!s.knownAt || isNaN(s.knownAt.getTime())) {
        errors.push(`${prefix} missing or invalid knownAt timestamp`);
      }

      // periodEndDate is MANDATORY
      if (!s.periodEndDate || isNaN(s.periodEndDate.getTime())) {
        errors.push(`${prefix} missing or invalid periodEndDate`);
      }

      // LEAKAGE: a snapshot observed BEFORE the report must not carry the
      // actual value. Post-report snapshots (knownAt >= actualReportDate)
      // are the legitimate way actuals enter the dataset.
      if (
        s.actualValue !== null &&
        s.actualReportDate &&
        s.knownAt &&
        s.knownAt.getTime() < s.actualReportDate.getTime()
      ) {
        errors.push(`${prefix} knownAt < actualReportDate but carries actualValue — leakage`);
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
    // ⚠️ NOT IMPLEMENTED — dormant future extension point.
    // Do NOT implement without inspecting a real Zacks extract first —
    // field semantics must be verified, never guessed.
    // The free NDL tier returns only current consensus (no historical snapshots).
    throw new Error('ZacksConsensusAdapter.parseSnapshots: NOT IMPLEMENTED — requires verified vendor field semantics');
  }

  parseRevisions(_rawData: unknown): CanonicalRevisionEvent[] | null {
    throw new Error('ZacksConsensusAdapter.parseRevisions: NOT IMPLEMENTED — requires verified vendor field semantics');
  }
}

// ─── Estimize Adapter ─────────────────────────────────────────────────────────

/**
 * Estimize consensus adapter.
 *
 * Supports two input formats:
 *   1. CSV (historical testing files — Consensus.csv, Estimates.csv)
 *   2. API JSON response (/releases/:id/consensus, /releases/:id/estimates)
 *
 * PIT timestamp mapping:
 *   - Consensus.csv::Date → knownAt (daily PIT snapshot date)
 *   - API consensus::updated_at → knownAt (revision timestamp)
 *   - Estimates.csv::created_at → revisionDate (individual estimate creation)
 *   - API estimates::created_at → revisionDate
 *
 * Estimize guarantees PIT integrity (from FAQ):
 *   "We keep point-in-time data for all estimates. We never delete estimates
 *    or change estimates."
 *
 * History: January 2012+
 * Coverage: 3,000+ US equities and ADRs
 *
 * See: docs/v5-consensus-vendor-gate.md
 */

import * as crypto from 'crypto';

// ─── Estimize CSV Types ──────────────────────────────────────────────────────

/**
 * Row from Estimize Consensus.csv (historical file).
 * Each row is a daily PIT snapshot of the consensus for a ticker/fiscal period.
 */
interface EstimizeConsensusCsvRow {
  Date: string;                    // PIT snapshot date (YYYY-MM-DD) → knownAt
  Ticker: string;
  Cusip: string;
  Instrument_id: string;
  Instrument_name: string;
  Fiscal_year: number;
  Fiscal_quarter: number;          // 1-4
  Reports_at: string;              // expected/actual report datetime
  'Estimize.eps.weighted': number | null;
  'Estimize.eps.high': number | null;
  'Estimize.eps.low': number | null;
  'Estimize.eps.sd': number | null;
  'Estimize.eps.count': number | null;
  'Estimize.revenue.weighted': number | null;
  'Estimize.revenue.high': number | null;
  'Estimize.revenue.low': number | null;
  'Estimize.revenue.sd': number | null;
  'Estimize.revenue.count': number | null;
  'Wallstreet.eps.mean': number | null;
  'Wallstreet.eps.count': number | null;
  'Wallstreet.revenue.mean': number | null;
  'Wallstreet.revenue.count': number | null;
  'Reported.eps': number | null;
  'Reported.revenue': number | null;
}

/**
 * Row from Estimize Estimates.csv (historical file).
 * Each row is an individual analyst estimate with a creation timestamp.
 */
interface EstimizeEstimateCsvRow {
  Estimate_id: string;
  Eps: number | null;
  Revenue: number | null;
  Created_at: string;              // ISO 8601 → revisionDate / knownAt
  Flagged: boolean;
  Release_id: string;
  Fiscal_quarter: number;
  Fiscal_year: number;
  Reported_eps: number | null;
  Reported_revenue: number | null;
  Reports_at: string;
  Point_in_time_ticker: string;
  Point_in_time_cusip: string;
  Analyst_id: string;
  Username: string;
}

// ─── Estimize API Types ──────────────────────────────────────────────────────

interface EstimizeApiConsensusRevision {
  mean: number;
  high: number;
  low: number;
  standard_deviation: number;
  count: number;
  updated_at: string;              // ISO 8601 → knownAt
}

interface EstimizeApiConsensusResponse {
  estimize: {
    eps: {
      revisions: EstimizeApiConsensusRevision[];
      mean: number;
      high: number;
      low: number;
      standard_deviation: number;
      count: number;
      updated_at: string;
    };
    revenue: {
      revisions: EstimizeApiConsensusRevision[];
      mean: number;
      high: number;
      low: number;
      standard_deviation: number;
      count: number;
      updated_at: string;
    };
  };
  wallstreet: {
    eps: {
      revisions: EstimizeApiConsensusRevision[];
      mean: number;
      high: number;
      low: number;
      standard_deviation: number;
      count: number;
      updated_at: string;
    };
    revenue: {
      revisions: EstimizeApiConsensusRevision[];
      mean: number;
      high: number;
      low: number;
      standard_deviation: number;
      count: number;
      updated_at: string;
    };
  };
}

interface EstimizeApiEstimate {
  id: string;
  eps: number | null;
  revenue: number | null;
  created_at: string;              // ISO 8601 → revisionDate
  analyst_id: string;
  username: string;
  release_id: string;
  fiscal_year: number;
  fiscal_quarter: number;
}

// ─── Estimize Adapter Implementation ──────────────────────────────────────────

export class EstimizeConsensusAdapter extends BaseConsensusAdapter {
  readonly vendorName = 'ESTIMIZE';

  isAvailable(): boolean {
    return !!process.env.ESTIMIZE_API_KEY;
  }

  describeStatus(): string {
    if (process.env.ESTIMIZE_API_KEY) {
      return 'Estimize: API key configured';
    }
    return 'Estimize: NO API KEY — set ESTIMIZE_API_KEY in .env (or use CSV mode for historical files)';
  }

  /**
   * Parse Estimize data into canonical consensus snapshots.
   *
   * Accepts:
   *   - Parsed CSV rows (EstimizeConsensusCsvRow[]) from Consensus.csv
   *   - API JSON response (EstimizeApiConsensusResponse) from /releases/:id/consensus
   *
   * The caller must provide securityId/ticker/fiscalPeriod context when using
   * the API format (single-release response). For CSV, each row is self-contained.
   */
  parseSnapshots(rawData: unknown): CanonicalConsensusSnapshot[] | null {
    if (Array.isArray(rawData)) {
      return this.parseConsensusCsv(rawData as EstimizeConsensusCsvRow[]);
    }
    if (typeof rawData === 'object' && rawData !== null) {
      return this.parseConsensusApiResponse(
        rawData as EstimizeApiConsensusResponse & {
          _securityId?: string; _ticker?: string; _cik?: string | null;
          _fiscalYear?: number; _fiscalQuarter?: number; _periodEndDate?: string;
          _actualEps?: number | null; _actualRevenue?: number | null;
          _actualReportDate?: string | null;
        }
      );
    }
    return null;
  }

  /**
   * Parse Estimize data into canonical revision events.
   *
   * Accepts:
   *   - Parsed CSV rows (EstimizeEstimateCsvRow[]) from Estimates.csv
   *   - API JSON array (EstimizeApiEstimate[]) from /releases/:id/estimates
   */
  parseRevisions(rawData: unknown): CanonicalRevisionEvent[] | null {
    if (!Array.isArray(rawData)) return null;

    // Detect format: API estimates have `created_at` + `analyst_id`
    // CSV estimates have `Created_at` + `Analyst_id`
    const sample = rawData[0] as Record<string, unknown>;
    if (!sample) return null;

    if ('Created_at' in sample) {
      return this.parseEstimatesCsv(rawData as EstimizeEstimateCsvRow[]);
    }
    if ('created_at' in sample) {
      return this.parseEstimatesApi(rawData as EstimizeApiEstimate[]);
    }
    return null;
  }

  // ─── CSV Parsing ───────────────────────────────────────────────────────────

  private parseConsensusCsv(rows: EstimizeConsensusCsvRow[]): CanonicalConsensusSnapshot[] | null {
    const snapshots: CanonicalConsensusSnapshot[] = [];

    for (const row of rows) {
      const knownAt = new Date(row.Date);
      if (isNaN(knownAt.getTime())) continue;

      const fiscalPeriod = `Q${row.Fiscal_quarter}`;
      const periodEndDate = row.Reports_at ? new Date(row.Reports_at) : knownAt;
      const actualReportDate = row.Reports_at ? new Date(row.Reports_at) : null;

      // EPS snapshot
      if (row['Estimize.eps.weighted'] !== null && row['Estimize.eps.weighted'] !== undefined) {
        snapshots.push(this.makeSnapshot(
          row.Instrument_id, row.Ticker, null,
          row.Fiscal_year, fiscalPeriod, periodEndDate,
          knownAt, 'EPS',
          row['Estimize.eps.weighted'], null,
          row['Estimize.eps.high'], row['Estimize.eps.low'],
          row['Estimize.eps.sd'], row['Estimize.eps.count'],
          row['Reported.eps'] ?? null, actualReportDate,
          row
        ));
      }

      // Revenue snapshot
      if (row['Estimize.revenue.weighted'] !== null && row['Estimize.revenue.weighted'] !== undefined) {
        snapshots.push(this.makeSnapshot(
          row.Instrument_id, row.Ticker, null,
          row.Fiscal_year, fiscalPeriod, periodEndDate,
          knownAt, 'REVENUE',
          row['Estimize.revenue.weighted'], null,
          row['Estimize.revenue.high'], row['Estimize.revenue.low'],
          row['Estimize.revenue.sd'], row['Estimize.revenue.count'],
          row['Reported.revenue'] ?? null, actualReportDate,
          row
        ));
      }
    }

    return snapshots.length > 0 ? snapshots : null;
  }

  private parseEstimatesCsv(rows: EstimizeEstimateCsvRow[]): CanonicalRevisionEvent[] | null {
    const revisions: CanonicalRevisionEvent[] = [];

    for (const row of rows) {
      if (row.Flagged) continue; // Skip flagged/unreliable estimates

      const revisionDate = new Date(row.Created_at);
      if (isNaN(revisionDate.getTime())) continue;

      const fiscalPeriod = `Q${row.Fiscal_quarter}`;
      const periodEndDate = row.Reports_at ? new Date(row.Reports_at) : revisionDate;

      // EPS revision
      if (row.Eps !== null && row.Eps !== undefined) {
        revisions.push(this.makeRevision(
          row.Point_in_time_ticker, row.Fiscal_year, fiscalPeriod, periodEndDate,
          revisionDate, row.Analyst_id, row.Username, 'EPS',
          null, row.Eps, row
        ));
      }

      // Revenue revision
      if (row.Revenue !== null && row.Revenue !== undefined) {
        revisions.push(this.makeRevision(
          row.Point_in_time_ticker, row.Fiscal_year, fiscalPeriod, periodEndDate,
          revisionDate, row.Analyst_id, row.Username, 'REVENUE',
          null, row.Revenue, row
        ));
      }
    }

    return revisions.length > 0 ? revisions : null;
  }

  // ─── API Parsing ────────────────────────────────────────────────────────────

  private parseConsensusApiResponse(
    data: EstimizeApiConsensusResponse & {
      _securityId?: string; _ticker?: string; _cik?: string | null;
      _fiscalYear?: number; _fiscalQuarter?: number; _periodEndDate?: string;
      _actualEps?: number | null; _actualRevenue?: number | null;
      _actualReportDate?: string | null;
    }
  ): CanonicalConsensusSnapshot[] | null {
    // Caller must provide context fields (prefixed with _)
    const securityId = data._securityId ?? '';
    const ticker = data._ticker ?? '';
    const cik = data._cik ?? null;
    const fiscalYear = data._fiscalYear ?? 0;
    const fiscalPeriod = data._fiscalQuarter ? `Q${data._fiscalQuarter}` : '';
    const periodEndDate = data._periodEndDate ? new Date(data._periodEndDate) : new Date(0);
    const actualReportDate = data._actualReportDate ? new Date(data._actualReportDate) : null;

    if (!securityId || !fiscalPeriod) return null;

    const snapshots: CanonicalConsensusSnapshot[] = [];

    // Use Estimize consensus (not Wall Street) — Estimize is the crowdsourced
    // consensus that the platform is built on
    const estimizeEps = data.estimize?.eps;
    if (estimizeEps) {
      // Current snapshot
      const knownAt = new Date(estimizeEps.updated_at);
      if (!isNaN(knownAt.getTime())) {
        snapshots.push(this.makeSnapshot(
          securityId, ticker, cik, fiscalYear, fiscalPeriod, periodEndDate,
          knownAt, 'EPS',
          estimizeEps.mean, null,
          estimizeEps.high, estimizeEps.low,
          estimizeEps.standard_deviation, estimizeEps.count,
          data._actualEps ?? null, actualReportDate,
          { source: 'estimize-api', metric: 'eps', ...estimizeEps }
        ));
      }

      // Historical revisions — each revision is a PIT snapshot
      for (const rev of estimizeEps.revisions ?? []) {
        const revKnownAt = new Date(rev.updated_at);
        if (isNaN(revKnownAt.getTime())) continue;

        snapshots.push(this.makeSnapshot(
          securityId, ticker, cik, fiscalYear, fiscalPeriod, periodEndDate,
          revKnownAt, 'EPS',
          rev.mean, null,
          rev.high, rev.low,
          rev.standard_deviation, rev.count,
          null, null, // Actuals only in the final snapshot
          { source: 'estimize-api-revision', metric: 'eps', ...rev }
        ));
      }
    }

    const estimizeRev = data.estimize?.revenue;
    if (estimizeRev) {
      const knownAt = new Date(estimizeRev.updated_at);
      if (!isNaN(knownAt.getTime())) {
        snapshots.push(this.makeSnapshot(
          securityId, ticker, cik, fiscalYear, fiscalPeriod, periodEndDate,
          knownAt, 'REVENUE',
          estimizeRev.mean, null,
          estimizeRev.high, estimizeRev.low,
          estimizeRev.standard_deviation, estimizeRev.count,
          data._actualRevenue ?? null, actualReportDate,
          { source: 'estimize-api', metric: 'revenue', ...estimizeRev }
        ));
      }

      for (const rev of estimizeRev.revisions ?? []) {
        const revKnownAt = new Date(rev.updated_at);
        if (isNaN(revKnownAt.getTime())) continue;

        snapshots.push(this.makeSnapshot(
          securityId, ticker, cik, fiscalYear, fiscalPeriod, periodEndDate,
          revKnownAt, 'REVENUE',
          rev.mean, null,
          rev.high, rev.low,
          rev.standard_deviation, rev.count,
          null, null,
          { source: 'estimize-api-revision', metric: 'revenue', ...rev }
        ));
      }
    }

    return snapshots.length > 0 ? snapshots : null;
  }

  private parseEstimatesApi(estimates: EstimizeApiEstimate[]): CanonicalRevisionEvent[] | null {
    const revisions: CanonicalRevisionEvent[] = [];

    for (const est of estimates) {
      const revisionDate = new Date(est.created_at);
      if (isNaN(revisionDate.getTime())) continue;

      const fiscalPeriod = `Q${est.fiscal_quarter}`;

      if (est.eps !== null && est.eps !== undefined) {
        revisions.push(this.makeRevision(
          '', est.fiscal_year, fiscalPeriod, revisionDate,
          revisionDate, est.analyst_id, est.username, 'EPS',
          null, est.eps, est
        ));
      }

      if (est.revenue !== null && est.revenue !== undefined) {
        revisions.push(this.makeRevision(
          '', est.fiscal_year, fiscalPeriod, revisionDate,
          revisionDate, est.analyst_id, est.username, 'REVENUE',
          null, est.revenue, est
        ));
      }
    }

    return revisions.length > 0 ? revisions : null;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private makeSnapshot(
    securityId: string, ticker: string, cik: string | null,
    fiscalYear: number, fiscalPeriod: string, periodEndDate: Date,
    knownAt: Date, metricType: string,
    consensusMean: number | null, consensusMedian: number | null,
    consensusHigh: number | null, consensusLow: number | null,
    consensusStdDev: number | null, analystCount: number | null,
    actualValue: number | null, actualReportDate: Date | null,
    sourceRecord: unknown
  ): CanonicalConsensusSnapshot {
    // Hash over snapshot CONTENT (not raw row) so EPS and REVENUE snapshots
    // from the same CSV row get distinct hashes — otherwise dedup would drop
    // the second metric of each row.
    const hashInput = {
      securityId, ticker, fiscalYear, fiscalPeriod,
      periodEndDate: periodEndDate.toISOString(),
      knownAt: knownAt.toISOString(),
      metricType,
      consensusMean, consensusHigh, consensusLow, consensusStdDev, analystCount,
      actualValue, actualReportDate,
    };
    return {
      securityId, ticker, cik,
      fiscalYear, fiscalPeriod, periodEndDate,
      knownAt,
      metricType,
      consensusMean, consensusMedian,
      consensusHigh, consensusLow,
      consensusStdDev, analystCount,
      actualValue, actualReportDate,
      sourceProvider: 'ESTIMIZE',
      sourceType: 'CSV',
      sourceRecordHash: crypto.createHash('sha256').update(JSON.stringify(hashInput)).digest('hex'),
    };
  }

  private makeRevision(
    ticker: string, fiscalYear: number, fiscalPeriod: string, periodEndDate: Date,
    revisionDate: Date, analystId: string | null, analystName: string | null,
    metricType: string, priorEstimate: number | null, newEstimate: number | null,
    _sourceRecord: unknown
  ): CanonicalRevisionEvent {
    // Hash over revision CONTENT (not raw row) — EPS and REVENUE revisions
    // from the same estimate row must get distinct hashes.
    const hashInput = {
      ticker, fiscalYear, fiscalPeriod, periodEndDate,
      revisionDate, analystId, metricType, priorEstimate, newEstimate,
    };
    return {
      securityId: '', // Resolved during ingest from ticker mapping
      ticker,
      fiscalYear, fiscalPeriod, periodEndDate,
      revisionDate, analystId, analystName,
      metricType, priorEstimate, newEstimate,
      sourceProvider: 'ESTIMIZE',
      sourceType: 'CSV',
      sourceRecordHash: crypto.createHash('sha256').update(JSON.stringify(hashInput)).digest('hex'),
    };
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
