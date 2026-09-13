/**
 * Consensus Ingest Shared Types
 * ==============================
 *
 * Shared between the ingest pipeline (estimize-ingest.ts) and the
 * PIT validator (pit-consensus-validator.ts). Kept in a separate module
 * to avoid circular imports.
 */

/** Ticker → securityId resolver (PIT-correct). Implemented over Prisma in DB layer. */
export interface TickerResolver {
  /** Resolve ticker to securityId, requiring the ticker to be active at `at`. */
  resolve(ticker: string, at: Date): string | null;
}

/** Minimal DB surface for ingest — testable without real Postgres. */
export interface ConsensusIngestStore {
  /** Insert fact if sourceRecordHash not already present. Returns true if inserted. */
  insertFactIfAbsent(fact: ConsensusFactInsert): Promise<boolean>;
  /** Insert revision if sourceRecordHash not already present. Returns true if inserted. */
  insertRevisionIfAbsent(revision: ConsensusRevisionInsert): Promise<boolean>;
}

export interface ConsensusFactInsert {
  securityId: string;
  fiscalYear: number;
  fiscalPeriod: string;
  periodEndDate: Date;
  observationDate: Date;
  availableAt: Date;
  supersededAt: Date | null;
  metricType: string;
  consensusMean: number | null;
  consensusMedian: number | null;
  consensusHigh: number | null;
  consensusLow: number | null;
  consensusStdDev: number | null;
  analystCount: number | null;
  actualValue: number | null;
  actualReportDate: Date | null;
  sourceProvider: string;
  sourceType: string;
  sourceRecordHash: string;
}

export interface ConsensusRevisionInsert {
  securityId: string;
  fiscalYear: number;
  fiscalPeriod: string;
  periodEndDate: Date;
  revisionDate: Date;
  availableAt: Date;
  analystId: string | null;
  analystName: string | null;
  metricType: string;
  priorEstimate: number | null;
  newEstimate: number | null;
  sourceProvider: string;
  sourceType: string;
  sourceRecordHash: string;
}

export interface QuarantineEntry {
  reason: string;
  detail: string;
  record: unknown;
}

export interface IngestReport {
  rawCount: number;
  acceptedCount: number;
  duplicateCount: number;
  quarantinedCount: number;
  quarantined: QuarantineEntry[];
  securitiesCovered: number;
  dateRange: { min: Date | null; max: Date | null };
}
