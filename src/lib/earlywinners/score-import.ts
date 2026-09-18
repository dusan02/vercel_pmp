/**
 * Early Winners score export → EwScoreSnapshot importer.
 *
 * Consumes the JSON contract "ew-score-export/1" produced by
 *   npm run quant:score -- --as-of <date> --json-out <file>
 *
 * Pure validation + upsert logic — the Prisma client is injected so this
 * module is unit-testable without a live DB.
 *
 * NOTE: the exported scores are V5-B current-data scores, NOT backtested
 * V5-C results. `earningsBlocked` is preserved verbatim — never fabricate
 * an earnings score when PIT consensus is unavailable.
 */

import type { PrismaClient } from '@prisma/client';

export const EW_EXPORT_CONTRACT = 'ew-score-export/1';

export interface EwExportCategory {
  rawScore: number | null;
  weightedScore: number;
  isBlocked: boolean;
  isPartial: boolean;
}

export interface EwExportEvidence {
  key: string;
  category: string;
  value: number | null;
  formula: string;
  inputs: Record<string, number | string | null>;
  notes: string | null;
  source: string;
}

export interface EwExportScoreRow {
  symbol: string;
  securityId?: string;
  rank: number;
  totalScore: number;
  maxPossible: number;
  pitGatePassed: boolean;
  categories: Record<string, EwExportCategory>;
  evidence: EwExportEvidence[];
}

export interface EwScoreExport {
  contractVersion: string;
  mode: string;
  disclaimer?: string;
  asOfDate: string;
  engineVersion: string;
  universe?: { requested: number; scored: number; excluded: number };
  scores: EwExportScoreRow[];
}

export interface ImportResult {
  asOfDate: string;
  imported: number;
  updated: number;
  skippedUnknownTicker: string[];
  skippedInvalid: { symbol: string; reason: string }[];
}

export class ExportValidationError extends Error {}

const SYMBOL_RE = /^[A-Z0-9.\-]{1,12}$/;

function isFiniteScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
}

function validCategory(c: unknown): c is EwExportCategory {
  if (typeof c !== 'object' || c === null) return false;
  const cat = c as Record<string, unknown>;
  if (cat.rawScore !== null && !isFiniteScore(cat.rawScore)) return false;
  if (typeof cat.isBlocked !== 'boolean') return false;
  return true;
}

/** Structural validation of the export envelope. Throws ExportValidationError. */
export function validateExport(data: unknown): EwScoreExport {
  if (typeof data !== 'object' || data === null) {
    throw new ExportValidationError('export is not an object');
  }
  const d = data as Record<string, unknown>;

  if (d.contractVersion !== EW_EXPORT_CONTRACT) {
    throw new ExportValidationError(
      `unsupported contractVersion: ${String(d.contractVersion)} (expected ${EW_EXPORT_CONTRACT})`,
    );
  }
  if (typeof d.asOfDate !== 'string' || isNaN(new Date(d.asOfDate).getTime())) {
    throw new ExportValidationError(`invalid asOfDate: ${String(d.asOfDate)}`);
  }
  if (!Array.isArray(d.scores)) {
    throw new ExportValidationError('scores is not an array');
  }

  for (const [i, row] of d.scores.entries()) {
    if (typeof row !== 'object' || row === null) {
      throw new ExportValidationError(`scores[${i}] is not an object`);
    }
    const r = row as Record<string, unknown>;
    if (typeof r.symbol !== 'string' || !SYMBOL_RE.test(r.symbol)) {
      throw new ExportValidationError(`scores[${i}].symbol invalid: ${String(r.symbol)}`);
    }
    if (!isFiniteScore(r.totalScore)) {
      throw new ExportValidationError(`scores[${i}] (${r.symbol}) totalScore out of range: ${String(r.totalScore)}`);
    }
    if (!isFiniteScore(r.maxPossible)) {
      throw new ExportValidationError(`scores[${i}] (${r.symbol}) maxPossible out of range: ${String(r.maxPossible)}`);
    }
    if (typeof r.rank !== 'number' || !Number.isInteger(r.rank) || r.rank < 1) {
      throw new ExportValidationError(`scores[${i}] (${r.symbol}) rank invalid: ${String(r.rank)}`);
    }
    if (typeof r.categories !== 'object' || r.categories === null) {
      throw new ExportValidationError(`scores[${i}] (${r.symbol}) categories missing`);
    }
    for (const [cat, val] of Object.entries(r.categories as Record<string, unknown>)) {
      if (!validCategory(val)) {
        throw new ExportValidationError(`scores[${i}] (${r.symbol}) category ${cat} invalid`);
      }
    }
  }

  return d as unknown as EwScoreExport;
}

/** Deterministic feature-key → human label map for the "why" bullets. */
const FEATURE_LABELS: Record<string, string> = {
  priceStrengthPct: 'Relative strength vs S&P 500 (6M)',
  trendAlignment: 'Trading above its 50-day moving average',
  relativeVolume: 'Above-average trading volume (20d)',
  revenueAccelerationPct: 'Accelerating revenue growth',
  marginExpansionBps: 'Expanding operating margin',
  revenueYoYGrowthShock: 'Strong year-over-year revenue growth',
  operatingMarginYoYExpansion: 'Year-over-year margin expansion',
  fcfYoYGrowthShock: 'Strong year-over-year free cash flow growth',
  profitabilityScore: 'Stable profitability across recent quarters',
  leverageRatio: 'Leverage relative to equity',
  earningsConsistency: 'Consistent reported earnings',
};

const CATEGORY_ORDER = ['FUNDAMENTALS', 'MOMENTUM', 'QUALITY', 'EARNINGS'];

/** Compact rationale stored in rationaleJson — deterministic, no generated text. */
export function buildRationale(evidence: EwExportEvidence[]): string {
  const bullets = evidence
    .filter(e => e.value !== null)
    .map(e => ({
      key: e.key,
      category: e.category,
      label: FEATURE_LABELS[e.key] ?? e.key,
      value: e.value,
      notes: e.notes,
    }))
    .sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category);
      const cb = CATEGORY_ORDER.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      return a.key.localeCompare(b.key);
    });
  return JSON.stringify(bullets);
}

function catScore(row: EwExportScoreRow, cat: string): number | null {
  const c = row.categories[cat];
  return c && !c.isBlocked ? (c.rawScore ?? null) : null;
}

/**
 * Validate + upsert export rows into EwScoreSnapshot.
 * Idempotent: (symbol, asOfDate) upsert; unrelated snapshots untouched.
 * Rows whose ticker is absent from the Ticker table are skipped
 * (live-ticker presentation filter — the frozen research universe is unchanged).
 */
export async function importEwScores(
  prisma: PrismaClient,
  data: unknown,
): Promise<ImportResult> {
  const payload = validateExport(data);
  const asOfDate = new Date(payload.asOfDate);

  const result: ImportResult = {
    asOfDate: payload.asOfDate,
    imported: 0,
    updated: 0,
    skippedUnknownTicker: [],
    skippedInvalid: [],
  };

  const symbols = payload.scores.map(s => s.symbol);
  const known = await prisma.ticker.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true },
  });
  const knownSet = new Set(known.map(t => t.symbol));

  for (const row of payload.scores) {
    if (!knownSet.has(row.symbol)) {
      result.skippedUnknownTicker.push(row.symbol);
      continue;
    }
    if (!row.pitGatePassed) {
      result.skippedInvalid.push({ symbol: row.symbol, reason: 'pitGatePassed=false' });
      continue;
    }

    const earnings = row.categories.EARNINGS;
    const earningsBlocked = earnings ? earnings.isBlocked : true;

    const fields = {
      totalScore: row.totalScore,
      maxPossible: row.maxPossible,
      fundamentalsScore: catScore(row, 'FUNDAMENTALS'),
      momentumScore: catScore(row, 'MOMENTUM'),
      qualityScore: catScore(row, 'QUALITY'),
      earningsScore: catScore(row, 'EARNINGS'),
      earningsBlocked,
      rank: row.rank,
      engineVersion: payload.engineVersion,
      rationaleJson: buildRationale(row.evidence ?? []),
    };

    const existing = await prisma.ewScoreSnapshot.findUnique({
      where: { symbol_asOfDate: { symbol: row.symbol, asOfDate } },
      select: { id: true },
    });

    await prisma.ewScoreSnapshot.upsert({
      where: { symbol_asOfDate: { symbol: row.symbol, asOfDate } },
      create: { symbol: row.symbol, asOfDate, ...fields },
      update: fields,
    });

    if (existing) result.updated++;
    else result.imported++;
  }

  return result;
}
