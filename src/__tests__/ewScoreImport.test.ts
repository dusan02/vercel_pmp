/**
 * Tests for the Early Winners score export → EwScoreSnapshot importer.
 * Prisma is mocked — no live DB required.
 */
import {
  validateExport,
  importEwScores,
  buildRationale,
  ExportValidationError,
  EW_EXPORT_CONTRACT,
  type EwScoreExport,
} from '@/lib/earlywinners/score-import';
import type { PrismaClient } from '@prisma/client';

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    symbol: 'AAPL',
    rank: 1,
    totalScore: 72.5,
    maxPossible: 65,
    pitGatePassed: true,
    categories: {
      FUNDAMENTALS: { rawScore: 80.1, weightedScore: 24.03, isBlocked: false, isPartial: false },
      MOMENTUM: { rawScore: 65.0, weightedScore: 16.25, isBlocked: false, isPartial: false },
      QUALITY: { rawScore: 55.0, weightedScore: 5.5, isBlocked: false, isPartial: false },
      EARNINGS: { rawScore: null, weightedScore: 0, isBlocked: true, isPartial: false },
    },
    evidence: [
      {
        key: 'priceStrengthPct',
        category: 'MOMENTUM',
        value: 12.3,
        formula: 'stockReturn(6M) - spyReturn(6M)',
        inputs: {},
        notes: '6-month relative strength vs SPY',
        source: 'PIT_DB',
      },
    ],
    ...overrides,
  };
}

function makeExport(overrides: Partial<EwScoreExport> = {}): EwScoreExport {
  return {
    contractVersion: EW_EXPORT_CONTRACT,
    mode: 'V5-B',
    asOfDate: '2026-09-18',
    engineVersion: 'EW-V5.0.0',
    scores: [makeRow()],
    ...overrides,
  } as EwScoreExport;
}

function makePrisma(knownSymbols: string[] = ['AAPL']) {
  const upsert = jest.fn(async () => ({}));
  const findUnique = jest.fn(async () => null);
  const findMany = jest.fn(async () => knownSymbols.map(symbol => ({ symbol })));
  const prisma = {
    ticker: { findMany },
    ewScoreSnapshot: { findUnique, upsert },
  } as unknown as PrismaClient;
  return { prisma, upsert, findUnique, findMany };
}

describe('validateExport', () => {
  it('accepts a valid export', () => {
    expect(() => validateExport(makeExport())).not.toThrow();
  });

  it('rejects wrong contract version', () => {
    expect(() => validateExport(makeExport({ contractVersion: 'v0' } as EwScoreExport)))
      .toThrow(ExportValidationError);
  });

  it('rejects malformed JSON payload (non-object)', () => {
    expect(() => validateExport('not json')).toThrow(ExportValidationError);
    expect(() => validateExport(null)).toThrow(ExportValidationError);
  });

  it('rejects invalid asOfDate', () => {
    expect(() => validateExport(makeExport({ asOfDate: 'not-a-date' } as EwScoreExport)))
      .toThrow(/asOfDate/);
  });

  it('rejects non-array scores', () => {
    expect(() => validateExport(makeExport({ scores: {} as never }))).toThrow(/scores/);
  });

  it('rejects invalid ticker symbol', () => {
    expect(() => validateExport(makeExport({ scores: [makeRow({ symbol: 'DROP TABLE' }) as never] })))
      .toThrow(/symbol/);
  });

  it('rejects out-of-range score', () => {
    expect(() => validateExport(makeExport({ scores: [makeRow({ totalScore: 150 }) as never] })))
      .toThrow(/totalScore/);
    expect(() => validateExport(makeExport({ scores: [makeRow({ totalScore: -1 }) as never] })))
      .toThrow(/totalScore/);
    expect(() => validateExport(makeExport({ scores: [makeRow({ maxPossible: NaN }) as never] })))
      .toThrow(/maxPossible/);
  });

  it('rejects invalid rank', () => {
    expect(() => validateExport(makeExport({ scores: [makeRow({ rank: 0 }) as never] })))
      .toThrow(/rank/);
  });

  it('rejects invalid category score', () => {
    const row = makeRow();
    row.categories.EARNINGS = { rawScore: 200, weightedScore: 0, isBlocked: false, isPartial: false };
    expect(() => validateExport(makeExport({ scores: [row as never] }))).toThrow(/category/);
  });
});

describe('importEwScores', () => {
  it('imports a valid row as a new snapshot', async () => {
    const { prisma, upsert } = makePrisma();
    const res = await importEwScores(prisma, makeExport());
    expect(res.imported).toBe(1);
    expect(res.updated).toBe(0);
    expect(upsert).toHaveBeenCalledTimes(1);

    const args = upsert.mock.calls[0]![0] as any;
    expect(args.create.symbol).toBe('AAPL');
    expect(args.create.totalScore).toBe(72.5);
    expect(args.create.earningsBlocked).toBe(true);
    expect(args.create.earningsScore).toBeNull();
    expect(args.create.fundamentalsScore).toBe(80.1);
    expect(args.create.momentumScore).toBe(65.0);
    expect(args.create.qualityScore).toBe(55.0);
    expect(args.create.engineVersion).toBe('EW-V5.0.0');
    expect(JSON.parse(args.create.rationaleJson)[0].key).toBe('priceStrengthPct');
  });

  it('is idempotent — same (symbol, asOfDate) upserts instead of duplicating', async () => {
    const { prisma, upsert, findUnique } = makePrisma();
    findUnique.mockResolvedValueOnce({ id: 'existing' } as never);
    const res = await importEwScores(prisma, makeExport());
    expect(res.imported).toBe(0);
    expect(res.updated).toBe(1);
    const args = upsert.mock.calls[0]![0] as any;
    expect(args.where.symbol_asOfDate.symbol).toBe('AAPL');
  });

  it('different asOfDate produces a separate snapshot key', async () => {
    const { prisma, upsert } = makePrisma();
    await importEwScores(prisma, makeExport());
    await importEwScores(prisma, makeExport({ asOfDate: '2026-09-19' } as EwScoreExport));
    const dates = upsert.mock.calls.map(
      c => (c[0] as any).where.symbol_asOfDate.asOfDate.toISOString().slice(0, 10),
    );
    expect(dates).toEqual(['2026-09-18', '2026-09-19']);
  });

  it('skips symbols absent from the Ticker table (live-ticker filter)', async () => {
    const { prisma, upsert } = makePrisma(['AAPL']);
    const res = await importEwScores(prisma, makeExport({
      scores: [makeRow(), makeRow({ symbol: 'DELISTED', rank: 2 }) as never],
    } as EwScoreExport));
    expect(res.imported).toBe(1);
    expect(res.skippedUnknownTicker).toEqual(['DELISTED']);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('skips rows that failed the engine PIT gate', async () => {
    const { prisma, upsert } = makePrisma();
    const res = await importEwScores(prisma, makeExport({
      scores: [makeRow({ pitGatePassed: false }) as never],
    } as EwScoreExport));
    expect(res.imported).toBe(0);
    expect(res.skippedInvalid[0]?.reason).toBe('pitGatePassed=false');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never fabricates an earnings score — stays null when blocked', async () => {
    const { prisma, upsert } = makePrisma();
    await importEwScores(prisma, makeExport());
    const args = upsert.mock.calls[0]![0] as any;
    expect(args.create.earningsBlocked).toBe(true);
    expect(args.create.earningsScore).toBeNull();
  });
});

describe('buildRationale', () => {
  it('maps known feature keys to human labels, deterministic order', () => {
    const json = buildRationale([
      { key: 'priceStrengthPct', category: 'MOMENTUM', value: 5, formula: '', inputs: {}, notes: null, source: 'PIT_DB' },
      { key: 'profitabilityScore', category: 'QUALITY', value: 88, formula: '', inputs: {}, notes: null, source: 'PIT_DB' },
      { key: 'revenueYoYGrowthShock', category: 'FUNDAMENTALS', value: 24, formula: '', inputs: {}, notes: null, source: 'PIT_DB' },
    ]);
    const bullets = JSON.parse(json);
    expect(bullets.map((b: { key: string }) => b.key)).toEqual([
      'revenueYoYGrowthShock', 'priceStrengthPct', 'profitabilityScore',
    ]);
    expect(bullets[0].label).toContain('revenue');
  });

  it('drops null-value evidence and keeps unknown keys verbatim', () => {
    const json = buildRationale([
      { key: 'unknownFeature', category: 'MOMENTUM', value: 1, formula: '', inputs: {}, notes: null, source: 'PIT_DB' },
      { key: 'priceStrengthPct', category: 'MOMENTUM', value: null, formula: '', inputs: {}, notes: null, source: 'PIT_DB' },
    ]);
    const bullets = JSON.parse(json);
    expect(bullets).toHaveLength(1);
    expect(bullets[0].label).toBe('unknownFeature');
  });
});
