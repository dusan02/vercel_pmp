/**
 * Estimize Consensus Ingest Pipeline
 * ====================================
 *
 * Deterministic, idempotent ingest of Estimize consensus data into
 * PitConsensusFact / PitConsensusRevision.
 *
 * Pipeline:
 *   CSV rows (Consensus.csv / Estimates.csv)
 *       ↓
 *   EstimizeConsensusAdapter (vendor-adapter.ts)
 *       ↓
 *   CanonicalConsensusSnapshot / CanonicalRevisionEvent
 *       ↓
 *   normalize (ticker → securityId, dedup, supersededAt chains)
 *       ↓
 *   PIT validation (pit-consensus-validator.ts) — leakage = HARD FAIL
 *       ↓
 *   DB write (upsert by sourceRecordHash — idempotent)
 *
 * Determinism guarantees:
 *   - Input rows sorted before processing (stable order)
 *   - sourceRecordHash is the dedup/idempotency key
 *   - Same input file → same DB state (no duplicates, no drift)
 *
 * Usage:
 *   npx tsx src/lib/quant/p4-engine/consensus/estimize-ingest.ts <consensus.csv> [estimates.csv]
 */

import {
  CanonicalConsensusSnapshot,
  CanonicalRevisionEvent,
} from './vendor-adapter';
import {
  ConsensusFactInsert,
  ConsensusRevisionInsert,
  QuarantineEntry,
  IngestReport,
  TickerResolver,
  ConsensusIngestStore,
} from './consensus-ingest-types';
import {
  validateConsensusFacts,
  validateConsensusRevisions,
} from './pit-consensus-validator';

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Normalize Estimize ticker symbol.
 * - Uppercase, trim
 * - Strip exchange suffixes (".US", ".USA", ".NYSE", ".NASDAQ")
 */
export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\.(US|USA|NYSE|NASDAQ)$/i, '');
}

/**
 * Normalize a date to UTC midnight (deterministic day-level PIT).
 * Returns null for invalid dates.
 */
export function normalizeDate(raw: string | Date): Date | null {
  const d = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Build supersededAt chain: each snapshot is superseded by the next
 * observationDate for the same (security, period, metric). Last → null.
 */
export function buildSupersededChain(
  snapshots: CanonicalConsensusSnapshot[],
): Map<CanonicalConsensusSnapshot, Date | null> {
  const sorted = [...snapshots].sort(
    (a, b) => a.knownAt.getTime() - b.knownAt.getTime(),
  );
  const chain = new Map<CanonicalConsensusSnapshot, Date | null>();
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[i + 1];
    chain.set(sorted[i], next ? next.knownAt : null);
  }
  return chain;
}

// ─── Core Transform (pure — no DB) ───────────────────────────────────────────

/**
 * Transform canonical snapshots into DB-ready fact rows:
 * ticker resolution (PIT-correct), dedup by hash, supersededAt chains.
 * Pure function — same input always produces same output.
 */
export function buildFactRows(
  snapshots: CanonicalConsensusSnapshot[],
  resolver: TickerResolver,
  quarantine: QuarantineEntry[],
): ConsensusFactInsert[] {
  // Stable sort for determinism
  const sorted = [...snapshots].sort(
    (a, b) =>
      a.ticker.localeCompare(b.ticker) ||
      a.fiscalYear - b.fiscalYear ||
      a.fiscalPeriod.localeCompare(b.fiscalPeriod) ||
      a.metricType.localeCompare(b.metricType) ||
      a.knownAt.getTime() - b.knownAt.getTime(),
  );

  // Dedup by sourceRecordHash (first wins — stable due to sort)
  const seenHashes = new Set<string>();
  const deduped: CanonicalConsensusSnapshot[] = [];
  let duplicateCount = 0;
  for (const s of sorted) {
    if (seenHashes.has(s.sourceRecordHash)) {
      duplicateCount++;
      continue;
    }
    seenHashes.add(s.sourceRecordHash);
    deduped.push(s);
  }

  // Resolve securityIds (PIT-correct: ticker active at knownAt)
  const resolved: CanonicalConsensusSnapshot[] = [];
  for (const s of deduped) {
    const ticker = normalizeTicker(s.ticker);
    const securityId = resolver.resolve(ticker, s.knownAt);
    if (!securityId) {
      quarantine.push({
        reason: 'TICKER_UNRESOLVED',
        detail: `Ticker '${ticker}' not active at knownAt=${s.knownAt.toISOString()}`,
        record: { ticker, metric: s.metricType },
      });
      continue;
    }
    resolved.push({ ...s, securityId, ticker });
  }

  // Group by (security, period, metric) → supersededAt chains
  const groups = new Map<string, CanonicalConsensusSnapshot[]>();
  for (const s of resolved) {
    const key = `${s.securityId}|${s.fiscalYear}|${s.fiscalPeriod}|${s.metricType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const rows: ConsensusFactInsert[] = [];
  for (const group of groups.values()) {
    const sortedGroup = [...group].sort((a, b) => a.knownAt.getTime() - b.knownAt.getTime());
    for (let i = 0; i < sortedGroup.length; i++) {
      const s = sortedGroup[i];
      const next = sortedGroup[i + 1];
      rows.push({
        securityId: s.securityId,
        fiscalYear: s.fiscalYear,
        fiscalPeriod: s.fiscalPeriod,
        periodEndDate: s.periodEndDate,
        observationDate: s.knownAt,
        availableAt: s.knownAt,
        supersededAt: next ? next.knownAt : null,
        metricType: s.metricType,
        consensusMean: s.consensusMean,
        consensusMedian: s.consensusMedian,
        consensusHigh: s.consensusHigh,
        consensusLow: s.consensusLow,
        consensusStdDev: s.consensusStdDev,
        analystCount: s.analystCount,
        actualValue: s.actualValue,
        actualReportDate: s.actualReportDate,
        sourceProvider: s.sourceProvider,
        sourceType: s.sourceType,
        sourceRecordHash: s.sourceRecordHash,
      });
    }
  }

  return rows;
}

/**
 * Transform canonical revision events into DB-ready revision rows.
 * Pure function.
 */
export function buildRevisionRows(
  revisions: CanonicalRevisionEvent[],
  resolver: TickerResolver,
  quarantine: QuarantineEntry[],
): ConsensusRevisionInsert[] {
  const sorted = [...revisions].sort(
    (a, b) =>
      a.ticker.localeCompare(b.ticker) ||
      a.fiscalYear - b.fiscalYear ||
      a.fiscalPeriod.localeCompare(b.fiscalPeriod) ||
      a.revisionDate.getTime() - b.revisionDate.getTime(),
  );

  const seenHashes = new Set<string>();
  const rows: ConsensusRevisionInsert[] = [];

  for (const r of sorted) {
    if (seenHashes.has(r.sourceRecordHash)) continue;
    seenHashes.add(r.sourceRecordHash);

    const ticker = normalizeTicker(r.ticker);
    const securityId = r.securityId || (ticker ? resolver.resolve(ticker, r.revisionDate) : null);
    if (!securityId) {
      quarantine.push({
        reason: 'TICKER_UNRESOLVED',
        detail: `Revision ticker '${ticker}' not active at revisionDate=${r.revisionDate.toISOString()}`,
        record: { ticker, metric: r.metricType },
      });
      continue;
    }

    rows.push({
      securityId,
      fiscalYear: r.fiscalYear,
      fiscalPeriod: r.fiscalPeriod,
      periodEndDate: r.periodEndDate,
      revisionDate: r.revisionDate,
      availableAt: r.revisionDate,
      analystId: r.analystId,
      analystName: r.analystName,
      metricType: r.metricType,
      priorEstimate: r.priorEstimate,
      newEstimate: r.newEstimate,
      sourceProvider: r.sourceProvider,
      sourceType: r.sourceType,
      sourceRecordHash: r.sourceRecordHash,
    });
  }

  return rows;
}

/**
 * Build an ingest report from counters and rows.
 */
export function buildReport(
  rawCount: number,
  acceptedCount: number,
  duplicateCount: number,
  quarantined: QuarantineEntry[],
  rows: ConsensusFactInsert[],
): IngestReport {
  const dates = rows.map(r => r.observationDate.getTime());
  const securities = new Set(rows.map(r => r.securityId));
  return {
    rawCount,
    acceptedCount,
    duplicateCount,
    quarantinedCount: quarantined.length,
    quarantined,
    securitiesCovered: securities.size,
    dateRange: dates.length
      ? { min: new Date(Math.min(...dates)), max: new Date(Math.max(...dates)) }
      : { min: null, max: null },
  };
}
