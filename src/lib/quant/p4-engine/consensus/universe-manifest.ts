/**
 * V5-B Universe Manifest — Types + Validation
 * ============================================
 *
 * The frozen V5-B eligible universe (575 securities) is reproduced
 * deterministically from the PIT database:
 *
 *   PitFundamentalFact (revenue, operatingIncome, epsDiluted NOT NULL)
 *     ∩ PitPriceFact
 *     → PitTickerHistory for ticker mapping
 *
 * The generated artifact lives at:
 *   data/quant/processed/v5b-universe-manifest.json   (full manifest)
 *   data/quant/processed/v5b-universe-tickers.csv     (plain ticker list)
 *
 * `data/quant/` is intentionally gitignored — the manifest is a LOCAL
 * derived artifact carrying its own provenance (source query + the
 * run it reproduces). It must never become a manually maintained list:
 * regenerate it from the DB when needed; validate it here before use.
 *
 * This module validates the manifest's internal consistency and exposes
 * typed access for the profiler and OOS coverage tooling.
 */

// ─── Manifest schema (matches generated artifact) ──────────────────────────

export interface UniverseSecurityEntry {
  securityId: string;
  ticker: string;
  startDate: string;          // ISO date
  endDate: string | null;     // ISO date or null = still active
  exchange: string | null;
  delisted: boolean;
}

export interface UniverseManifest {
  name: string;
  generatedAt: string;
  source: string;
  reproduces: string;
  oosWindow: { start: string; end: string };
  counts: {
    securities: number;
    distinctTickers: number;
    delistedOrEndedTickers: number;
  };
  securities: UniverseSecurityEntry[];
}

// ─── Frozen V5-B universe constants ────────────────────────────────────────

/** Frozen V5-B universe shape — reproduced from the DB, not hand-maintained. */
export const FROZEN_V5B_UNIVERSE = Object.freeze({
  securities: 575,
  distinctTickers: 575,
  delistedOrEndedTickers: 173,
  oosStart: '2023-06-18',
  oosEnd: '2025-09-30',
});

// ─── Validation ────────────────────────────────────────────────────────────

export interface UniverseValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a universe manifest for internal consistency.
 * Structural checks only — no methodology, no thresholds.
 */
export function validateUniverseManifest(m: UniverseManifest): UniverseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(m.securities)) {
    return { passed: false, errors: ['manifest.securities is not an array'], warnings };
  }

  // ─── Uniqueness: securityId and ticker must be unique ───
  const secIds = new Set<string>();
  const tickers = new Set<string>();
  for (const [i, s] of m.securities.entries()) {
    if (!s.securityId) errors.push(`securities[${i}]: missing securityId`);
    if (!s.ticker) errors.push(`securities[${i}]: missing ticker`);
    if (secIds.has(s.securityId)) errors.push(`duplicate securityId '${s.securityId}'`);
    if (tickers.has(s.ticker)) errors.push(`duplicate ticker '${s.ticker}'`);
    secIds.add(s.securityId);
    tickers.add(s.ticker);
  }

  // ─── Validity ranges ───
  for (const s of m.securities) {
    const start = new Date(s.startDate);
    if (isNaN(start.getTime())) {
      errors.push(`${s.ticker}: invalid startDate '${s.startDate}'`);
      continue;
    }
    if (s.endDate !== null) {
      const end = new Date(s.endDate);
      if (isNaN(end.getTime())) {
        errors.push(`${s.ticker}: invalid endDate '${s.endDate}'`);
      } else if (end.getTime() <= start.getTime()) {
        errors.push(`${s.ticker}: endDate ${s.endDate} <= startDate ${s.startDate}`);
      }
    }
    // delisted flag must agree with endDate presence
    if (s.delisted !== (s.endDate !== null)) {
      errors.push(`${s.ticker}: delisted=${s.delisted} but endDate=${s.endDate}`);
    }
  }

  // ─── Counts must match contents ───
  if (m.counts.securities !== m.securities.length) {
    errors.push(`counts.securities ${m.counts.securities} != securities.length ${m.securities.length}`);
  }
  if (m.counts.distinctTickers !== tickers.size) {
    errors.push(`counts.distinctTickers ${m.counts.distinctTickers} != actual ${tickers.size}`);
  }
  const ended = m.securities.filter(s => s.endDate !== null).length;
  if (m.counts.delistedOrEndedTickers !== ended) {
    errors.push(`counts.delistedOrEndedTickers ${m.counts.delistedOrEndedTickers} != actual ${ended}`);
  }

  // ─── OOS window sanity ───
  const oosStart = new Date(m.oosWindow.start);
  const oosEnd = new Date(m.oosWindow.end);
  if (isNaN(oosStart.getTime()) || isNaN(oosEnd.getTime()) || oosEnd <= oosStart) {
    errors.push(`invalid oosWindow ${m.oosWindow.start} → ${m.oosWindow.end}`);
  }

  return { passed: errors.length === 0, errors, warnings };
}

/**
 * Assert a manifest is the frozen V5-B universe (shape match).
 * Returns errors describing any mismatch vs the frozen constants.
 */
export function verifyV5bUniverse(m: UniverseManifest): string[] {
  const errors: string[] = [];
  if (m.counts.securities !== FROZEN_V5B_UNIVERSE.securities) {
    errors.push(`securities ${m.counts.securities} != frozen ${FROZEN_V5B_UNIVERSE.securities}`);
  }
  if (m.counts.distinctTickers !== FROZEN_V5B_UNIVERSE.distinctTickers) {
    errors.push(`distinctTickers ${m.counts.distinctTickers} != frozen ${FROZEN_V5B_UNIVERSE.distinctTickers}`);
  }
  if (m.counts.delistedOrEndedTickers !== FROZEN_V5B_UNIVERSE.delistedOrEndedTickers) {
    errors.push(`delistedOrEndedTickers ${m.counts.delistedOrEndedTickers} != frozen ${FROZEN_V5B_UNIVERSE.delistedOrEndedTickers}`);
  }
  if (m.oosWindow.start !== FROZEN_V5B_UNIVERSE.oosStart || m.oosWindow.end !== FROZEN_V5B_UNIVERSE.oosEnd) {
    errors.push(`oosWindow ${m.oosWindow.start}→${m.oosWindow.end} != frozen ${FROZEN_V5B_UNIVERSE.oosStart}→${FROZEN_V5B_UNIVERSE.oosEnd}`);
  }
  return errors;
}

// ─── Universe diff (for ingest/coverage failure messages) ──────────────────

export interface UniverseDiff {
  expected: number;
  observed: number;
  matched: number;
  missing: string[];      // universe tickers absent from observed set
  unexpected: string[];   // observed tickers not in universe
  passed: boolean;        // all universe tickers observed (unexpected is informational)
}

/**
 * Diff an observed ticker set against the universe manifest.
 * Produces the Expected/Observed/Missing/Unexpected diagnostic used by
 * ingest validation and the profiler.
 */
export function diffUniverse(
  m: UniverseManifest,
  observedTickers: Iterable<string>,
): UniverseDiff {
  const expected = new Set(m.securities.map(s => s.ticker));
  const observed = new Set([...observedTickers].map(t => t.toUpperCase()));
  const matched = [...expected].filter(t => observed.has(t));
  const missing = [...expected].filter(t => !observed.has(t)).sort();
  const unexpected = [...observed].filter(t => !expected.has(t)).sort();
  return {
    expected: expected.size,
    observed: observed.size,
    matched: matched.length,
    missing,
    unexpected,
    passed: missing.length === 0,
  };
}

/** Human-readable one-line diff (for CLI/report output). */
export function formatUniverseDiff(d: UniverseDiff): string {
  const lines = [
    `Expected universe: ${d.expected}  Observed: ${d.observed}  Matched: ${d.matched}`,
  ];
  if (d.missing.length) {
    lines.push(`Missing (${d.missing.length}): ${d.missing.slice(0, 50).join(', ')}${d.missing.length > 50 ? ' …' : ''}`);
  }
  if (d.unexpected.length) {
    lines.push(`Unexpected (${d.unexpected.length}): ${d.unexpected.slice(0, 50).join(', ')}${d.unexpected.length > 50 ? ' …' : ''}`);
  }
  return lines.join('\n');
}

// ─── Typed accessors ───────────────────────────────────────────────────────

/** All tickers in the universe (sorted). */
export function universeTickers(m: UniverseManifest): string[] {
  return m.securities.map(s => s.ticker).sort();
}

/** Tickers whose history terminated (delisted/ended). */
export function terminatedTickers(m: UniverseManifest): string[] {
  return m.securities.filter(s => s.endDate !== null).map(s => s.ticker).sort();
}

/** securityId set — for coverage checks. */
export function universeSecurityIds(m: UniverseManifest): Set<string> {
  return new Set(m.securities.map(s => s.securityId));
}

/** ticker → securityId lookup. */
export function universeTickerMap(m: UniverseManifest): Map<string, string> {
  return new Map(m.securities.map(s => [s.ticker, s.securityId]));
}
