/**
 * Universe Manifest — Validation Tests (Task 7)
 * ============================================
 *
 * The frozen V5-B universe manifest is a DB-derived artifact
 * (data/quant/processed/v5b-universe-manifest.json, gitignored).
 * These tests pin the validator's invariants so a corrupt or
 * hand-edited manifest fails loudly.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  UniverseManifest,
  validateUniverseManifest,
  verifyV5bUniverse,
  universeTickers,
  terminatedTickers,
  diffUniverse,
  formatUniverseDiff,
  FROZEN_V5B_UNIVERSE,
} from './universe-manifest';

function makeManifest(securities: UniverseManifest['securities']): UniverseManifest {
  const ended = securities.filter(s => s.endDate !== null).length;
  return {
    name: 'test-manifest',
    generatedAt: '2026-09-07T00:00:00.000Z',
    source: 'test',
    reproduces: 'test',
    oosWindow: { start: FROZEN_V5B_UNIVERSE.oosStart, end: FROZEN_V5B_UNIVERSE.oosEnd },
    counts: {
      securities: securities.length,
      distinctTickers: new Set(securities.map(s => s.ticker)).size,
      delistedOrEndedTickers: ended,
    },
    securities,
  };
}

const entry = (ticker: string, endDate: string | null = null): UniverseManifest['securities'][number] => ({
  securityId: `sec-${ticker.toLowerCase()}`,
  ticker,
  startDate: '2000-01-01',
  endDate,
  exchange: 'NASDAQ',
  delisted: endDate !== null,
});

describe('validateUniverseManifest', () => {
  it('passes a well-formed manifest', () => {
    const m = makeManifest([entry('AAA'), entry('BBB', '2019-06-30')]);
    const r = validateUniverseManifest(m);
    expect(r.passed).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects duplicate tickers and securityIds', () => {
    const m = makeManifest([
      entry('AAA'),
      { ...entry('AAA'), securityId: 'sec-other' }, // dup ticker
      { ...entry('BBB'), securityId: 'sec-aaa' },   // dup securityId
    ]);
    m.counts.securities = 3;
    const r = validateUniverseManifest(m);
    expect(r.passed).toBe(false);
    expect(r.errors.some(e => e.includes("duplicate ticker 'AAA'"))).toBe(true);
    expect(r.errors.some(e => e.includes("duplicate securityId 'sec-aaa'"))).toBe(true);
  });

  it('rejects invalid validity ranges', () => {
    const m = makeManifest([{ ...entry('AAA'), startDate: '2020-01-01', endDate: '2019-01-01', delisted: true }]);
    const r = validateUniverseManifest(m);
    expect(r.passed).toBe(false);
    expect(r.errors.some(e => e.includes('endDate'))).toBe(true);
  });

  it('rejects delisted flag disagreeing with endDate', () => {
    const m = makeManifest([{ ...entry('AAA'), endDate: '2019-01-01', delisted: false }]);
    const r = validateUniverseManifest(m);
    expect(r.passed).toBe(false);
  });

  it('rejects count mismatches', () => {
    const m = makeManifest([entry('AAA')]);
    m.counts.securities = 99;
    const r = validateUniverseManifest(m);
    expect(r.passed).toBe(false);
    expect(r.errors.some(e => e.includes('counts.securities'))).toBe(true);
  });

  it('terminatedTickers returns only ended tickers', () => {
    const m = makeManifest([entry('AAA'), entry('BBB', '2018-01-01'), entry('CCC', '2020-01-01')]);
    expect(terminatedTickers(m)).toEqual(['BBB', 'CCC']);
    expect(universeTickers(m)).toEqual(['AAA', 'BBB', 'CCC']);
  });
});

describe('diffUniverse', () => {
  const m = makeManifest([entry('AAA'), entry('BBB'), entry('CCC', '2018-01-01')]);

  it('full match → passed, empty diffs', () => {
    const d = diffUniverse(m, ['AAA', 'BBB', 'CCC']);
    expect(d.passed).toBe(true);
    expect(d.matched).toBe(3);
    expect(d.missing).toEqual([]);
    expect(d.unexpected).toEqual([]);
  });

  it('reports missing and unexpected tickers', () => {
    const d = diffUniverse(m, ['AAA', 'ZZZ']);
    expect(d.passed).toBe(false);
    expect(d.expected).toBe(3);
    expect(d.observed).toBe(2);
    expect(d.matched).toBe(1);
    expect(d.missing).toEqual(['BBB', 'CCC']);
    expect(d.unexpected).toEqual(['ZZZ']);
  });

  it('is case-insensitive on observed tickers', () => {
    expect(diffUniverse(m, ['aaa', 'bbb', 'ccc']).passed).toBe(true);
  });

  it('formatUniverseDiff produces Expected/Observed/Missing/Unexpected', () => {
    const text = formatUniverseDiff(diffUniverse(m, ['AAA', 'ZZZ']));
    expect(text).toContain('Expected universe: 3');
    expect(text).toContain('Observed: 2');
    expect(text).toContain('Missing (2): BBB, CCC');
    expect(text).toContain('Unexpected (1): ZZZ');
  });
});

describe('frozen V5-B constants', () => {
  it('pins the frozen universe shape', () => {
    expect(FROZEN_V5B_UNIVERSE.securities).toBe(575);
    expect(FROZEN_V5B_UNIVERSE.distinctTickers).toBe(575);
    expect(FROZEN_V5B_UNIVERSE.delistedOrEndedTickers).toBe(173);
    expect(FROZEN_V5B_UNIVERSE.oosStart).toBe('2023-06-18');
    expect(FROZEN_V5B_UNIVERSE.oosEnd).toBe('2025-09-30');
  });
});

describe('generated artifact (if present locally)', () => {
  const manifestPath = path.resolve(
    __dirname, '../../../../..', 'data/quant/processed/v5b-universe-manifest.json',
  );

  it('validates and matches the frozen V5-B shape', () => {
    if (!fs.existsSync(manifestPath)) {
      // Artifact is a local DB-derived file (data/quant/ is gitignored).
      // Absent in CI is expected — the deterministic regeneration path
      // is documented in data/quant/README or the manifest provenance.
      return;
    }
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as UniverseManifest;
    const r = validateUniverseManifest(m);
    expect(r.errors).toEqual([]);
    expect(r.passed).toBe(true);
    expect(verifyV5bUniverse(m)).toEqual([]);
  });
});
