/**
 * Shared pillar-derivation tests — the Phase-1 consistency guards.
 *
 * Invariants under test:
 *  1. derivePillarInputs is deterministic: identical inputs → identical
 *     output, byte-for-byte.
 *  2. Interest coverage picks the latest ANNUAL row carrying both ebit and
 *     interestExpense — a newer quarterly row must not shadow the matching
 *     fiscal year (KKR's FY25 InterestExpenseNonoperating = $2.78B was
 *     invisible to the old extraction and the newest-first scan fell through
 *     to Finnhub's −0.0142).
 *  3. computeMetrics produces identical pillars regardless of what stale
 *     values AnalysisCache holds — the read path must not mix cached metrics
 *     into a live snapshot (cold-cache vs warm-cache equivalence).
 */

import { derivePillarInputs, selectInterestCoverage, type PillarStmt } from '@/services/analysis/pillarInputs';
import type { DerivePillarInputsArgs } from '@/services/analysis/pillarInputs';

const ZERO: PillarStmt = {
    fiscalPeriod: null, fiscalYear: null, endDate: new Date(0),
    revenue: null, netIncome: null, ebit: null, grossProfit: null,
    operatingCashFlow: null, capex: null, sbc: null,
    totalAssets: null, totalLiabilities: null, currentAssets: null,
    currentLiabilities: null, retainedEarnings: null, totalEquity: null,
    sharesOutstanding: null, interestExpense: null, totalDebt: null,
    cashAndEquivalents: null, netPPE: null,
};

const stmt = (over: Partial<PillarStmt>): PillarStmt => ({ ...ZERO, ...over });

// ── KKR-shaped fixture (production magnitudes, FY2023–FY2025 + a fresh
// quarterly row that reports both fields — the trap case) ───────────────────
const KKR_STMTS: PillarStmt[] = [
    stmt({
        fiscalPeriod: 'Q1', fiscalYear: 2026, endDate: new Date('2026-03-31'),
        revenue: 4.9e9, netIncome: 0.6e9, ebit: 0.1e9, interestExpense: 0.7e9,
        // Income-only quarterly row — no balance sheet (DELL pattern).
    }),
    stmt({
        fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-31'),
        revenue: 19.464e9, netIncome: 2.37e9, ebit: 7.099e9,
        interestExpense: 2.777e9, // us-gaap_InterestExpenseNonoperating (widened extract)
        operatingCashFlow: 3.1e9, capex: 0.2e9,
        totalAssets: 343e9, totalLiabilities: 328.5e9, totalEquity: 30.9e9,
        totalDebt: 52.9e9, cashAndEquivalents: 16.9e9,
        retainedEarnings: 5e9, sharesOutstanding: 0.89e9,
    }),
    stmt({
        fiscalPeriod: 'FY', fiscalYear: 2024, endDate: new Date('2024-12-31'),
        revenue: 20.99e9, netIncome: 2.9e9, ebit: 5.86e9,
        interestExpense: 3.034e9, // InterestExpenseNonoperating
        operatingCashFlow: 2.8e9, capex: 0.18e9,
        totalAssets: 320e9, totalLiabilities: 295e9, totalEquity: 25e9,
        totalDebt: 46e9, cashAndEquivalents: 14e9,
        retainedEarnings: 4e9, sharesOutstanding: 0.89e9,
    }),
    stmt({
        fiscalPeriod: 'FY', fiscalYear: 2023, endDate: new Date('2023-12-31'),
        revenue: 14.5e9, netIncome: 2.2e9, ebit: 6.555e9,
        interestExpense: 2.772e9, // us-gaap_InterestExpense (old tag)
        operatingCashFlow: 2.5e9, capex: 0.15e9,
        totalAssets: 289e9, totalLiabilities: 261e9, totalEquity: 22.7e9,
        totalDebt: 44e9, cashAndEquivalents: 12e9,
        retainedEarnings: 3e9, sharesOutstanding: 0.86e9,
    }),
];

const KKR: DerivePillarInputsArgs = {
    stmts: KKR_STMTS,
    tickerData: { lastPrice: 130, lastMarketCap: 115.6, sharesOutstanding: 0.89e9 },
    finnhubMetrics: { interestCoverage: -0.0142, currentRatio: null, netMargin: null, roe: null, operatingMargin: null, netIncomePerShare: null, forwardPe: null, psRatio: null, priceFreeCashFlow: null, cashPerShare: null },
    valuationRows: [],
};

// ── MSFT-shaped fixture — real OperatingIncomeLoss ebit, genuine interest tag
const MSFT_FY = (fy: number, rev: number, ebit: number, ni: number) => stmt({
    fiscalPeriod: 'FY', fiscalYear: fy, endDate: new Date(`${fy}-06-30`),
    revenue: rev * 1e9, netIncome: ni * 1e9, ebit: ebit * 1e9,
    grossProfit: rev * 0.69e9, operatingCashFlow: rev * 0.5e9, capex: -rev * 0.15e9,
    interestExpense: 2.4e9, sbc: 11e9,
    totalAssets: 560e9, totalLiabilities: 240e9, totalEquity: 320e9,
    totalDebt: 60e9, cashAndEquivalents: 110e9,
    currentAssets: 160e9, currentLiabilities: 120e9,
    retainedEarnings: 240e9, sharesOutstanding: 7.43e9, netPPE: 160e9,
});
const MSFT: DerivePillarInputsArgs = {
    stmts: [
        MSFT_FY(2025, 282, 128, 102), MSFT_FY(2024, 245, 109, 88),
        MSFT_FY(2023, 212, 89, 72), MSFT_FY(2022, 198, 83, 73),
        MSFT_FY(2021, 168, 70, 61), MSFT_FY(2020, 143, 53, 44),
    ],
    tickerData: { lastPrice: 420, lastMarketCap: 3120, sharesOutstanding: 7.43e9 },
    finnhubMetrics: null,
    valuationRows: [],
};

describe('derivePillarInputs — determinism', () => {
    it('identical inputs produce byte-identical output (twice)', () => {
        const a = derivePillarInputs(KKR);
        const b = derivePillarInputs(KKR);
        expect(JSON.stringify(a.pillarsInput)).toBe(JSON.stringify(b.pillarsInput));
        expect(a.pillars).toEqual(b.pillars);
        expect(a.altmanZ).toBe(b.altmanZ);
        expect(a.interestCoverage).toBe(b.interestCoverage);
    });

    it('input mutation between calls is the only source of difference', () => {
        const base = derivePillarInputs(KKR);
        const mutated: DerivePillarInputsArgs = {
            ...KKR,
            stmts: KKR_STMTS.map(s => s.fiscalYear === 2025 ? { ...s, ebit: s.ebit! * 2 } : s),
        };
        const changed = derivePillarInputs(mutated);
        expect(changed.pillarsInput).not.toEqual(base.pillarsInput);
    });
});

describe('selectInterestCoverage — annual-first selection', () => {
    it('KKR: picks FY2025, not the newer Q1-2026 quarterly row', () => {
        const { coverage, stmt: picked } = selectInterestCoverage(
            KKR_STMTS, KKR_STMTS.filter(s => s.fiscalPeriod === 'FY'), -0.0142,
        );
        expect(picked?.fiscalPeriod).toBe('FY');
        expect(picked?.fiscalYear).toBe(2025);
        // storedEBIT/|intExp| provisional basis: 7.099 / 2.777 ≈ 2.56
        expect(coverage).toBeCloseTo(7.099e9 / 2.777e9, 3);
    });

    it('without the widened extraction (FY24/25 intExp null) falls to FY2023 while still fresh', () => {
        // Q1-2026 in the fixture sits ~27 months after FY2023's endDate —
        // within the 3-year recency bound, so the annual row still wins over
        // the partial-year quarter.
        const stmts = KKR_STMTS.map(s =>
            (s.fiscalPeriod === 'FY' && s.fiscalYear >= 2024) ? { ...s, interestExpense: null } : s);
        const { coverage, stmt: picked } = selectInterestCoverage(
            stmts, stmts.filter(s => s.fiscalPeriod === 'FY'), -0.0142,
        );
        expect(picked?.fiscalYear).toBe(2023);
        expect(coverage).toBeCloseTo(6.555e9 / 2.772e9, 3);
    });

    it('a stale annual row (>3y older than newest) yields to a fresh quarterly row', () => {
        // HST-shaped: FY2020 has ebit+intExp but is years old; Q2-2024 is the
        // recent row. The stale annual must not win the selection.
        const stmts = [
            stmt({ fiscalPeriod: 'Q2', fiscalYear: 2024, endDate: new Date('2024-06-30'), ebit: 1.0e9, interestExpense: 0.166e9 }),
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2020, endDate: new Date('2020-12-31'), ebit: -0.9e9, interestExpense: 0.18e9 }),
        ];
        const { coverage, stmt: picked } = selectInterestCoverage(
            stmts, stmts.filter(s => s.fiscalPeriod === 'FY'), null,
        );
        expect(picked?.fiscalPeriod).toBe('Q2');
        expect(coverage).toBeCloseTo(1.0e9 / 0.166e9, 3);
    });

    it('skips rows with interestExpense = 0 (genuine zero is not a denominator)', () => {
        const stmts = [stmt({
            fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-31'),
            ebit: 5e9, interestExpense: 0,
        })];
        const { coverage, stmt: picked } = selectInterestCoverage(stmts, stmts, 8.4);
        expect(picked).toBeNull();
        expect(coverage).toBe(8.4); // Finnhub fallback stands
    });

    it('falls back to a non-annual row only when no annual row qualifies', () => {
        const stmts = [
            stmt({ fiscalPeriod: 'Q2', fiscalYear: 2026, endDate: new Date('2026-06-30'), ebit: 2e9, interestExpense: 0.5e9 }),
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-31'), ebit: 5e9, interestExpense: null }),
        ];
        const { coverage, stmt: picked } = selectInterestCoverage(stmts, [], null);
        expect(picked?.fiscalPeriod).toBe('Q2');
        expect(coverage).toBe(4);
    });

    it('no valid statement row → Finnhub interestCoverage fallback is used', () => {
        const stmts = [stmt({
            fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-31'),
            ebit: 5e9, interestExpense: null,
        })];
        const { coverage, stmt: picked } = selectInterestCoverage(stmts, stmts, 7.25);
        expect(picked).toBeNull();
        expect(coverage).toBe(7.25);
    });

    it('no valid statement row and no Finnhub value → coverage is null (insufficient, not zero)', () => {
        const stmts = [stmt({
            fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-31'),
            ebit: 5e9, interestExpense: null,
        })];
        const { coverage, stmt: picked } = selectInterestCoverage(stmts, stmts, null);
        expect(picked).toBeNull();
        expect(coverage).toBeNull();
        // null → the pillar leg scores 0 pts under existing missing-data
        // semantics — it is NOT promoted to full coverage.
    });

    it('debt-free-looking company: ebit present, interestExpense absent on all rows → null, not infinite', () => {
        const stmts = [
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-31'), ebit: 5e9, interestExpense: null, totalDebt: null }),
            stmt({ fiscalPeriod: 'Q2', fiscalYear: 2026, endDate: new Date('2026-06-30'), ebit: 1e9, interestExpense: null }),
        ];
        const { coverage } = selectInterestCoverage(stmts, stmts.slice(0, 1), null);
        expect(coverage).toBeNull();
    });

    it('rows are never mixed across periods: numerator and denominator come from the same row', () => {
        const stmts = [
            stmt({ fiscalPeriod: 'Q1', fiscalYear: 2026, endDate: new Date('2026-03-31'), ebit: null, interestExpense: 0.4e9 }),
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-31'), ebit: 6e9, interestExpense: 2e9 }),
        ];
        const { coverage, stmt: picked } = selectInterestCoverage(stmts, stmts.filter(s => s.fiscalPeriod === 'FY'), null);
        // The quarterly row is skipped (ebit null) — it must not supply only
        // the denominator. Selected row is FY2025, ratio = 6/2 = 3.
        expect(picked?.fiscalPeriod).toBe('FY');
        expect(coverage).toBe(3);
    });
});

describe('derivePillarInputs — KKR fixture', () => {
    const d = derivePillarInputs(KKR);

    it('interest coverage leg scores on the FY row (2.56x → 10 pts), not Finnhub', () => {
        const leg = d.pillars.health.legs.find(l => l.key === 'interestCoverage')!;
        expect(leg.points).toBe(10);
        expect(d.interestCoverage).toBeCloseTo(2.557, 2);
    });

    it('bsStmt is the FY row, not the income-only Q1 row', () => {
        expect(d.bsStmt?.fiscalPeriod).toBe('FY');
        expect(d.bsStmt?.fiscalYear).toBe(2025);
    });

    it('altmanZ is computed (documenting current industrial-model application)', () => {
        expect(d.altmanZ).not.toBeNull();
        expect(d.altmanZ).toBeGreaterThan(0);
    });
});

describe('derivePillarInputs — MSFT fixture sanity', () => {
    const d = derivePillarInputs(MSFT);

    it('coverage = ebit/|intExp| = 128/2.4 ≈ 53x → 25 pts', () => {
        expect(d.interestCoverage).toBeCloseTo(128e9 / 2.4e9, 2);
        expect(d.pillars.health.legs.find(l => l.key === 'interestCoverage')!.points).toBe(25);
    });

    it('net cash → balance leg 25; healthy profile stays high', () => {
        expect(d.pillars.health.legs.find(l => l.key === 'balance')!.points).toBe(25);
        expect(d.pillars.health.score).toBeGreaterThanOrEqual(75);
        expect(d.pillars.profitability.score).toBeGreaterThanOrEqual(75);
        expect(d.pillars.moat.score).toBeGreaterThanOrEqual(50);
    });
});

// ── Cold-cache vs warm-cache equivalence ────────────────────────────────────
// The read path must produce identical pillars whether AnalysisCache holds a
// fresh row or stale garbage — no cached metric may feed pillar inputs.

const analysisCacheFindUnique = jest.fn();
const statementFindMany = jest.fn();
const valuationFindMany = jest.fn();
const finnhubFindUnique = jest.fn();
const tickerFindUnique = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        analysisCache: { findUnique: (...a: unknown[]) => analysisCacheFindUnique(...a) },
        financialStatement: { findMany: (...a: unknown[]) => statementFindMany(...a) },
        dailyValuationHistory: { findMany: (...a: unknown[]) => valuationFindMany(...a) },
        finnhubMetrics: { findUnique: (...a: unknown[]) => finnhubFindUnique(...a) },
        ticker: { findUnique: (...a: unknown[]) => tickerFindUnique(...a) },
    },
}));

jest.mock('@/lib/utils/splitAdjustment', () => ({
    ...jest.requireActual('@/lib/utils/splitAdjustment'),
    applySplitAdjustments: jest.fn().mockResolvedValue([]),
    applyPostSplitAdjustment: jest.fn(),
}));

// eslint-disable-next-line import/first
import { computeMetrics } from '@/services/analysisCompute';

const KKR_VALUATION_ROWS = Array.from({ length: 300 }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 2) + i * 86400e3),
    closePrice: 100 + i * 0.1, marketCap: 100e9,
    peRatio: 40 + (i % 30), psRatio: 5 + (i % 5) * 0.1,
    evEbitda: 20 + (i % 10), fcfYield: 0.02 + (i % 4) * 0.002,
}));

const KKR_CACHE_FIELDS = {
    symbol: 'KKR', healthScore: 26, profitabilityScore: 60, valuationScore: 40,
    growthScore: 50, qualityScore: 45, moatScore: 0, overallScore: 44,
    altmanZ: 0.31, piotroskiScore: 6, beneishScore: -1.2,
    interestCoverage: -0.0142, revenueCagr: 12.4, netIncomeCagr: 8.1,
    debtRepaymentYears: 11.6, fcfConversion: 1.2, fcfMargin: 0.15,
    marginStability: 0.21, negativeNiYears: 1, epsCagr5y: 14,
    pePercentile: 30, peVsMedian3yPct: -5, roic: 8.4, priceToCash: 6.8,
};

describe('computeMetrics — cold vs warm AnalysisCache must not change pillars', () => {
    const ticker = { lastPrice: 130, lastMarketCap: 115.6, sharesOutstanding: 0.89e9 };
    beforeEach(() => {
        jest.clearAllMocks();
        statementFindMany.mockResolvedValue(KKR_STMTS);
        valuationFindMany.mockResolvedValue(KKR_VALUATION_ROWS);
        finnhubFindUnique.mockResolvedValue(KKR.finnhubMetrics);
        tickerFindUnique.mockResolvedValue(ticker);
    });

    it('stale cached metrics do not leak into the live snapshot', async () => {
        analysisCacheFindUnique.mockResolvedValue({ ...KKR_CACHE_FIELDS });
        const warm = await computeMetrics('KKR', ticker);

        // A stale row from months ago — radically different values everywhere.
        analysisCacheFindUnique.mockResolvedValue({
            ...KKR_CACHE_FIELDS,
            altmanZ: 9.9, piotroskiScore: 9, beneishScore: -4,
            interestCoverage: 55, revenueCagr: 99, netIncomeCagr: 88,
            debtRepaymentYears: 0.01, fcfConversion: 0.01, fcfMargin: 0.9,
            marginStability: 0.001, epsCagr5y: 99, healthScore: 99,
        });
        const cold = await computeMetrics('KKR', ticker);

        // Pillars, derived metrics, balance sheet and TTM are identical —
        // only the raw AnalysisCache columns (spread on top-level) may differ.
        expect(cold!.pillars).toEqual(warm!.pillars);
        expect(cold!.metrics).toEqual(warm!.metrics);
        expect(cold!.balanceSheet).toEqual(warm!.balanceSheet);
        expect(cold!.ttm).toEqual(warm!.ttm);
        // The KKR interest-coverage leg reflects the FY row, not the stale
        // cached 55x or Finnhub's -0.0142.
        expect(warm!.metrics.interestCoverage).toBeCloseTo(2.557, 2);
        expect(warm!.metrics.altmanZ).not.toBe(9.9);
    });
});
