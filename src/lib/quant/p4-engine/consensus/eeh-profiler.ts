/**
 * EEH Raw-File Profiler — Schema/Profile Inspector
 * =================================================
 *
 * Purpose: separate what a vendor's data dictionary CLAIMS from what a
 * delivered sample actually CONTAINS. Runs on a raw CSV extract and
 * produces a machine-readable profile + human-readable summary.
 *
 * Guarantees:
 *   - read-only, deterministic (same input → same output)
 *   - no DB access, no writes
 *   - no Early Winners scoring logic
 *   - no vendor assumptions beyond column-name ALIASES already confirmed
 *     in the vendor's data dictionary / correspondence (header detection
 *     tolerates case/underscore variants — nothing else is assumed)
 *
 * Column detection: headers are normalized (lowercase, non-alnum stripped)
 * and matched against a candidate alias list. Columns that are not
 * recognized are reported, not guessed at.
 *
 * Input is a parsed record array (see eeh-profiler-cli.ts for CSV parsing).
 */

import { computeOosCoverage, FROZEN_OOS_WINDOW } from './oos-coverage';
import { UniverseManifest, universeTickerMap, universeSecurityIds } from './universe-manifest';

// ─── Column detection ──────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Candidate aliases per canonical field. Only names the vendor has
 * confirmed in correspondence/documentation belong here — detection is
 * descriptive (what IS in the file), never prescriptive.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  ticker:       ['mticker', 'ticker'],
  perEndDate:   ['perenddate', 'periodenddate'],
  perType:      ['pertype'],
  perFiscYear:  ['perfiscyear', 'fiscalyear'],
  perFiscQtr:   ['perfiscqtr', 'fiscalqtr', 'fiscalquarter'],
  obsDate:      ['obsdate', 'observationdate'],
  fileProdDate: ['fileproddate', 'productiondate'],
  epsMeanEst:   ['epsmeanest'],
  epsMedEst:    ['epsmedest', 'epsmedianest'],
  epsHighEst:   ['epshighest'],
  epsLowEst:    ['epslowest'],
  epsStdDevEst: ['epsstddevest', 'epsstdest', 'epsstddev'],
  epsCntEst:    ['epscntest'],
  epsCntRevUp:  ['epscntestrevup', 'epscntrevup'],
  epsCntRevDown:['epscntestrevdown', 'epscntrevdown'],
};

/** Sales/revenue estimate columns — availability detection only. */
const SALES_FIELD_PATTERN = /^(sal|sales|rev|revenue)/i;

/** Canonical fields that MUST resolve unambiguously for the file to be profilable. */
const REQUIRED_FIELDS = ['ticker', 'perEndDate', 'perType', 'obsDate', 'epsMeanEst'] as const;

export interface ColumnDetection {
  /** canonical field → actual header found (or null) */
  mapped: Record<string, string | null>;
  /** canonical field → ALL headers that matched (ambiguity when >1) */
  candidates: Record<string, string[]>;
  /** headers present but not matched to any canonical field */
  unrecognized: string[];
  /** headers matching sales/revenue field pattern */
  salesFields: string[];
  /**
   * Ambiguity report — non-empty means the profiler must STOP.
   * We never silently choose a mapping for unknown vendor data.
   */
  ambiguities: string[];
  /** required canonical fields with no matching header */
  missingRequired: string[];
  /** true iff every required field resolved to exactly one header */
  usable: boolean;
}

export function detectColumns(headers: readonly string[]): ColumnDetection {
  // norm → ALL original headers with that normalized form (catches dup headers)
  const byNorm = new Map<string, string[]>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n)!.push(h);
  }

  const mapped: Record<string, string | null> = {};
  const candidates: Record<string, string[]> = {};
  const ambiguities: string[] = [];
  const used = new Set<string>();

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const hits: string[] = [];
    for (const a of aliases) for (const h of byNorm.get(a) ?? []) hits.push(h);
    candidates[field] = hits;
    if (hits.length > 1) {
      ambiguities.push(`${field}: multiple candidate headers [${hits.join(', ')}] — STOP, explicit mapping required`);
      mapped[field] = null; // do NOT pick one silently
    } else {
      mapped[field] = hits[0] ?? null;
      if (hits[0]) used.add(hits[0]);
    }
  }

  // Same header claimed by two canonical fields → ambiguity
  const claimants = new Map<string, string[]>();
  for (const [field, h] of Object.entries(mapped)) {
    if (!h) continue;
    if (!claimants.has(h)) claimants.set(h, []);
    claimants.get(h)!.push(field);
  }
  for (const [h, fields] of claimants) {
    if (fields.length > 1) {
      ambiguities.push(`header '${h}' claimed by multiple fields [${fields.join(', ')}] — STOP`);
      for (const f of fields) mapped[f] = null;
    }
  }

  const missingRequired = REQUIRED_FIELDS.filter(f => !mapped[f]);

  return {
    mapped,
    candidates,
    unrecognized: headers.filter(h => !used.has(h)),
    salesFields: headers.filter(h => SALES_FIELD_PATTERN.test(normalizeHeader(h))),
    ambiguities,
    missingRequired,
    usable: ambiguities.length === 0 && missingRequired.length === 0,
  };
}

// ─── Profile types ─────────────────────────────────────────────────────────

export interface EehProfile {
  generatedFromRows: number;
  columns: ColumnDetection;
  rows: {
    total: number;
    blank: number;
    unparseableTicker: number;
    unparseableObsDate: number;
    unparseablePerEndDate: number;
  };
  tickers: {
    unique: number;
    top20ByRows: Array<{ ticker: string; rows: number }>;
  };
  partitions: {
    /** distinct (ticker, perEndDate, perType) combos */
    count: number;
    perTypeDistribution: Record<string, number>;
    perFiscQtrDistribution: Record<string, number>;
  };
  obsDate: {
    min: string | null;
    max: string | null;
    perYear: Record<string, number>;
    revisionsPerPartition: { min: number; median: number; max: number; mean: number };
    /** partitions where obs_date is NOT non-decreasing in file order */
    nonMonotonicPartitions: number;
    /** same PK observed twice with conflicting eps_mean_est */
    pkConflicts: number;
  };
  nullRates: Record<string, { nulls: number; pct: number }>;
  sanity: {
    negativeAnalystCounts: number;
    negativeRevisionCounts: number;
    extremeEpsEstimates: number; // |eps_mean_est| > 1000
  };
  fields: {
    hasEpsEstimateFields: boolean;
    hasSalesFields: boolean;
    salesFieldsFound: string[];
  };
  universe?: {
    universeSize: number;
    matchedTickers: number;
    missingTickers: string[];
    unexpectedTickers: string[];
    terminatedTickersMatched: number;
    terminatedTickersMissing: string[];
  };
  oosCoverage?: ReturnType<typeof computeOosCoverage>;
  /** Diagnostics: absence vs invalid records inside the OOS window */
  observationQuality?: {
    inWindowRows: number;
    inWindowWithMean: number;
    inWindowNullMean: number;
    unparseableObsDateInWindow: number;
  };
}

// ─── Core profiler ─────────────────────────────────────────────────────────

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface ProfilerOptions {
  /** Frozen V5-B universe manifest for overlap + OOS coverage checks */
  universe?: UniverseManifest;
  /** OOS window override (defaults to frozen V5-B window) */
  oosWindow?: { start: string; end: string };
}

/**
 * Profile a parsed vendor extract (array of raw records, one per CSV row).
 * Column values are read via detected headers; missing columns degrade
 * the profile section to nulls rather than guessing.
 */
export function profileEehRecords(
  records: readonly Record<string, unknown>[],
  options: ProfilerOptions = {},
): EehProfile {
  const headers = records.length > 0 ? Object.keys(records[0]!) : [];
  const columns = detectColumns(headers);
  const col = columns.mapped;

  let blank = 0, badTicker = 0, badObs = 0, badEnd = 0;
  const tickerRows = new Map<string, number>();
  const partitions = new Map<string, { obsDates: Date[] }>();
  const perTypeDist: Record<string, number> = {};
  const perQtrDist: Record<string, number> = {};
  const obsPerYear: Record<string, number> = {};
  const nullCounts: Record<string, number> = {};
  let negAnalyst = 0, negRevCounts = 0, extremeEps = 0;
  const pkSeen = new Map<string, string | null>();
  let pkConflicts = 0;
  let nonMonotonic = 0;
  const obsDates: Date[] = [];

  const NUMERIC_FIELDS = ['epsMeanEst', 'epsMedEst', 'epsHighEst', 'epsLowEst', 'epsStdDevEst', 'epsCntEst', 'epsCntRevUp', 'epsCntRevDown'];

  for (const r of records) {
    const isBlank = Object.values(r).every(v => v === null || v === undefined || v === '');
    if (isBlank) { blank++; continue; }

    const ticker = col.ticker ? String(r[col.ticker] ?? '').trim().toUpperCase() : '';
    if (!ticker) badTicker++;

    const obsRaw = col.obsDate ? r[col.obsDate] : null;
    const obsD = obsRaw ? new Date(String(obsRaw)) : null;
    if (!obsD || isNaN(obsD.getTime())) badObs++;
    else { obsDates.push(obsD); obsPerYear[String(obsD.getUTCFullYear())] = (obsPerYear[String(obsD.getUTCFullYear())] ?? 0) + 1; }

    const endRaw = col.perEndDate ? r[col.perEndDate] : null;
    const endD = endRaw ? new Date(String(endRaw)) : null;
    if (!endD || isNaN(endD.getTime())) badEnd++;

    const perType = col.perType ? String(r[col.perType] ?? '') : '';
    if (perType) perTypeDist[perType] = (perTypeDist[perType] ?? 0) + 1;
    const perQtr = col.perFiscQtr ? String(r[col.perFiscQtr] ?? '') : '';
    if (perQtr) perQtrDist[perQtr] = (perQtrDist[perQtr] ?? 0) + 1;

    if (ticker) tickerRows.set(ticker, (tickerRows.get(ticker) ?? 0) + 1);

    // Partition accumulation (needs ticker + perEndDate + perType)
    const endKey = endD && !isNaN(endD.getTime()) ? endD.toISOString().slice(0, 10) : String(endRaw ?? '');
    const partKey = `${ticker}|${endKey}|${perType}`;
    if (!partitions.has(partKey)) partitions.set(partKey, { obsDates: [] });
    if (obsD && !isNaN(obsD.getTime())) partitions.get(partKey)!.obsDates.push(obsD);

    // PK duplicate check: ticker|per_end_date|per_type|obs_date
    if (obsD && !isNaN(obsD.getTime())) {
      const pk = `${partKey}|${obsD.toISOString().slice(0, 10)}`;
      const meanKey = col.epsMeanEst ? String(r[col.epsMeanEst] ?? 'NULL') : null;
      if (pkSeen.has(pk)) {
        if (pkSeen.get(pk) !== meanKey) pkConflicts++;
      } else {
        pkSeen.set(pk, meanKey);
      }
    }

    // Null rates for detected numeric fields
    for (const f of NUMERIC_FIELDS) {
      const h = col[f];
      if (!h) continue;
      if (r[h] === null || r[h] === undefined || r[h] === '') {
        nullCounts[f] = (nullCounts[f] ?? 0) + 1;
      }
      const n = numOrNull(r[h]);
      if (n !== null) {
        if ((f === 'epsCntEst') && n < 0) negAnalyst++;
        if ((f === 'epsCntRevUp' || f === 'epsCntRevDown') && n < 0) negRevCounts++;
        if (f === 'epsMeanEst' && Math.abs(n) > 1000) extremeEps++;
      }
    }
  }

  // Monotonicity per partition (file order of obs_date must be non-decreasing)
  const revsPerPart: number[] = [];
  for (const p of partitions.values()) {
    revsPerPart.push(p.obsDates.length);
    for (let i = 1; i < p.obsDates.length; i++) {
      if (p.obsDates[i]!.getTime() < p.obsDates[i - 1]!.getTime()) { nonMonotonic++; break; }
    }
  }

  const nullRates: EehProfile['nullRates'] = {};
  for (const f of NUMERIC_FIELDS) {
    if (!col[f]) continue;
    const nulls = nullCounts[f] ?? 0;
    nullRates[f] = { nulls, pct: records.length ? (nulls / records.length) * 100 : 0 };
  }

  const top20 = [...tickerRows.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([ticker, rows]) => ({ ticker, rows }));

  const profile: EehProfile = {
    generatedFromRows: records.length,
    columns,
    rows: {
      total: records.length,
      blank,
      unparseableTicker: badTicker,
      unparseableObsDate: badObs,
      unparseablePerEndDate: badEnd,
    },
    tickers: { unique: tickerRows.size, top20ByRows: top20 },
    partitions: {
      count: partitions.size,
      perTypeDistribution: perTypeDist,
      perFiscQtrDistribution: perQtrDist,
    },
    obsDate: {
      min: obsDates.length ? new Date(Math.min(...obsDates.map(d => d.getTime()))).toISOString() : null,
      max: obsDates.length ? new Date(Math.max(...obsDates.map(d => d.getTime()))).toISOString() : null,
      perYear: Object.fromEntries(Object.entries(obsPerYear).sort((a, b) => a[0].localeCompare(b[0]))),
      revisionsPerPartition: {
        min: revsPerPart.length ? Math.min(...revsPerPart) : 0,
        median: median(revsPerPart),
        max: revsPerPart.length ? Math.max(...revsPerPart) : 0,
        mean: revsPerPart.length ? revsPerPart.reduce((s, x) => s + x, 0) / revsPerPart.length : 0,
      },
      nonMonotonicPartitions: nonMonotonic,
      pkConflicts,
    },
    nullRates,
    sanity: {
      negativeAnalystCounts: negAnalyst,
      negativeRevisionCounts: negRevCounts,
      extremeEpsEstimates: extremeEps,
    },
    fields: {
      hasEpsEstimateFields: !!col.epsMeanEst,
      hasSalesFields: columns.salesFields.length > 0,
      salesFieldsFound: columns.salesFields,
    },
  };

  // ─── Universe overlap + OOS coverage (optional, needs manifest) ───
  if (options.universe) {
    const tmap = universeTickerMap(options.universe);
    const universeIds = universeSecurityIds(options.universe);
    const terminated = new Set(
      options.universe.securities.filter(s => s.endDate !== null).map(s => s.ticker),
    );

    const matched = new Set<string>();
    for (const t of tickerRows.keys()) if (tmap.has(t)) matched.add(t);
    const missing = [...tmap.keys()].filter(t => !tickerRows.has(t)).sort();
    const unexpected = [...tickerRows.keys()].filter(t => !tmap.has(t)).sort();
    const terminatedMatched = [...matched].filter(t => terminated.has(t)).length;
    const terminatedMissing = [...terminated].filter(t => !tickerRows.has(t)).sort();

    profile.universe = {
      universeSize: universeIds.size,
      matchedTickers: matched.size,
      missingTickers: missing,
      unexpectedTickers: unexpected,
      terminatedTickersMatched: terminatedMatched,
      terminatedTickersMissing: terminatedMissing,
    };

    // OOS coverage via resolved securityIds
    const window = options.oosWindow ?? FROZEN_OOS_WINDOW;
    const coverageObs = records
      .map(r => {
        const t = col.ticker ? String(r[col.ticker] ?? '').trim().toUpperCase() : '';
        const d = col.obsDate ? new Date(String(r[col.obsDate] ?? '')) : null;
        const sid = tmap.get(t);
        return sid && d && !isNaN(d.getTime()) ? { securityId: sid, date: d } : null;
      })
      .filter((x): x is { securityId: string; date: Date } => x !== null);
    profile.oosCoverage = computeOosCoverage(coverageObs, universeIds, window);

    // ─── Observation quality inside the window: absence vs invalid records ───
    const wStart = new Date(`${window.start}T00:00:00.000Z`).getTime();
    const wEnd = new Date(`${window.end}T23:59:59.999Z`).getTime();
    let inWindow = 0, inWindowNullMean = 0, badObsInWindow = 0;
    for (const r of records) {
      const d = col.obsDate ? new Date(String(r[col.obsDate] ?? '')) : null;
      const mean = col.epsMeanEst ? numOrNull(r[col.epsMeanEst]) : null;
      // Rows with unparseable obs_date can still carry a per_end_date in-window —
      // count separately so "missing" is never confused with "malformed".
      if (!d || isNaN(d.getTime())) { if (col.obsDate && (r[col.obsDate] ?? '') !== '') badObsInWindow++; continue; }
      if (d.getTime() >= wStart && d.getTime() <= wEnd) {
        inWindow++;
        if (mean === null) inWindowNullMean++;
      }
    }
    profile.observationQuality = {
      inWindowRows: inWindow,
      inWindowWithMean: inWindow - inWindowNullMean,
      inWindowNullMean,
      unparseableObsDateInWindow: badObsInWindow,
    };
  }

  return profile;
}

// ─── Human-readable summary ────────────────────────────────────────────────

export function formatProfileSummary(p: EehProfile): string {
  const lines: string[] = [];
  lines.push('=== Vendor Extract Profile (READ-ONLY) ===');

  // ─── Schema gate first: ambiguity or missing required fields → STOP ───
  if (!p.columns.usable) {
    lines.push('');
    lines.push('⛔ SCHEMA GATE: PROFILER CANNOT SAFELY MAP THIS FILE — STOP');
    for (const a of p.columns.ambiguities) lines.push(`  AMBIGUITY: ${a}`);
    for (const f of p.columns.missingRequired) lines.push(`  MISSING REQUIRED FIELD: ${f}`);
    lines.push('  → Explicit column mapping required before profiling/adapter work.');
    lines.push('  → The profiler never guesses a mapping for unknown vendor data.');
    lines.push('');
  }

  lines.push(`Rows: ${p.rows.total}  (blank: ${p.rows.blank})`);
  lines.push(`Columns detected: ${Object.values(p.columns.mapped).filter(Boolean).length}/${Object.keys(p.columns.mapped).length} canonical fields`);
  const missing = Object.entries(p.columns.mapped).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) lines.push(`  unmapped fields: ${missing.join(', ')}`);
  if (p.columns.unrecognized.length) lines.push(`  unrecognized headers: ${p.columns.unrecognized.join(', ')}`);
  lines.push(`Unique tickers: ${p.tickers.unique}`);
  lines.push(`Partitions (ticker|per_end|per_type): ${p.partitions.count}`);
  lines.push(`per_type: ${JSON.stringify(p.partitions.perTypeDistribution)}  per_fisc_qtr: ${JSON.stringify(p.partitions.perFiscQtrDistribution)}`);
  lines.push(`obs_date: ${p.obsDate.min ?? 'n/a'} → ${p.obsDate.max ?? 'n/a'}`);
  const r = p.obsDate.revisionsPerPartition;
  lines.push(`revisions/partition: min ${r.min} / median ${r.median} / max ${r.max} / mean ${r.mean.toFixed(1)}`);
  lines.push(`non-monotonic partitions: ${p.obsDate.nonMonotonicPartitions}   PK conflicts: ${p.obsDate.pkConflicts}`);
  lines.push('null rates:');
  for (const [f, v] of Object.entries(p.nullRates)) lines.push(`  ${f}: ${v.nulls} (${v.pct.toFixed(1)}%)`);
  lines.push(`sanity: negAnalyst=${p.sanity.negativeAnalystCounts} negRevCounts=${p.sanity.negativeRevisionCounts} extremeEps=${p.sanity.extremeEpsEstimates}`);
  lines.push(`fields: EPS estimate fields ${p.fields.hasEpsEstimateFields ? 'YES' : 'NO'}, sales fields ${p.fields.hasSalesFields ? `YES (${p.fields.salesFieldsFound.join(', ')})` : 'NO'}`);
  if (p.universe) {
    lines.push(`universe: ${p.universe.matchedTickers}/${p.universe.universeSize} tickers matched (${p.universe.missingTickers.length} missing, ${p.universe.unexpectedTickers.length} unexpected)`);
    lines.push(`terminated/delisted tickers matched: ${p.universe.terminatedTickersMatched} (missing: ${p.universe.terminatedTickersMissing.length})`);
    if (p.universe.missingTickers.length && p.universe.missingTickers.length <= 20) {
      lines.push(`  missing tickers: ${p.universe.missingTickers.join(', ')}`);
    }
  }
  if (p.oosCoverage) {
    const c = p.oosCoverage;
    lines.push(`OOS window ${c.window.start} → ${c.window.end}: ${c.monthsCovered}/${c.monthsTotal} months (${c.windowCoveragePct.toFixed(1)}%), ${c.securitiesCovered}/${c.universeSize} securities (${c.universeCoveragePct.toFixed(1)}%)`);
    if (c.monthsMissing.length) lines.push(`  missing months: ${c.monthsMissing.join(', ')}`);
  }
  if (p.observationQuality) {
    const q = p.observationQuality;
    lines.push(`OOS observation quality: ${q.inWindowWithMean}/${q.inWindowRows} rows with mean; ${q.inWindowNullMean} null-mean; ${q.unparseableObsDateInWindow} unparseable obs_date`);
  }
  lines.push('=== END PROFILE — STOP (no adapter decisions yet) ===');
  return lines.join('\n');
}
