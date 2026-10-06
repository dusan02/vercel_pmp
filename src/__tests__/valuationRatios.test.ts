import type { FinancialStatement } from '@prisma/client';
import { computeDayRatios } from '@/services/analysis/fillValuationDay';

function stmt(partial: Partial<FinancialStatement>): FinancialStatement {
    return {
        id: 0,
        symbol: 'TEST',
        fiscalPeriod: 'Q1',
        fiscalYear: 2025,
        endDate: new Date('2025-03-31T00:00:00Z'),
        revenue: null,
        grossProfit: null,
        operatingIncome: null,
        netIncome: null,
        ebit: null,
        operatingCashFlow: null,
        capex: null,
        sbc: null,
        totalDebt: null,
        cashAndEquivalents: null,
        sharesOutstanding: null,
        ...partial,
    } as FinancialStatement;
}

// CMCSA-shaped data (prod 2026-04): Q1-2026 filing reports income but not
// sharesOutstanding; FY2025 reports both. TTM NI = latestQ + matchingFY −
// prevYearSameQ = 2.174 + 19.998 − 3.375 = 18.797B.
const cmcsaStatements = [
    stmt({ fiscalPeriod: 'Q1', fiscalYear: 2026, endDate: new Date('2026-03-28T00:00:00Z'), netIncome: 2.174e9, revenue: 30e9, sharesOutstanding: null }),
    stmt({ fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-31T00:00:00Z'), netIncome: 19.998e9, revenue: 121e9, sharesOutstanding: 3.9996e9, totalDebt: 90e9, cashAndEquivalents: 10e9, ebit: 22e9, operatingCashFlow: 25e9, capex: -12e9 }),
    stmt({ fiscalPeriod: 'Q3', fiscalYear: 2025, endDate: new Date('2025-09-30T00:00:00Z'), netIncome: 17.83e9 }),
    stmt({ fiscalPeriod: 'Q1', fiscalYear: 2025, endDate: new Date('2025-03-28T00:00:00Z'), netIncome: 3.375e9 }),
];

describe('computeDayRatios — share-count fallback', () => {
    const asOf = new Date('2026-04-10T04:00:00Z');

    it('uses the most recent statement WITH sharesOutstanding when the latest lacks it (CMCSA regression)', () => {
        const r = computeDayRatios(cmcsaStatements, 21.57, asOf);
        expect(r.marketCap).toBeCloseTo(21.57 * 3.9996e9, 0);
        // TTM NI 18.797B / 3.9996B shares ≈ 4.70 EPS → P/E ≈ 4.59
        expect(r.peRatio).toBeCloseTo(21.57 / (18.797e9 / 3.9996e9), 1);
        expect(r.psRatio).not.toBeNull();
    });

    it('produces all-null ratios when no statement reports shares', () => {
        const noShares = cmcsaStatements.map((s) => ({ ...s, sharesOutstanding: null }));
        const r = computeDayRatios(noShares, 21.57, asOf);
        expect(r).toEqual({
            marketCap: null, peRatio: null, psRatio: null, evEbitda: null, fcfYield: null,
            pbRatio: null, evFcf: null, evRevenue: null, roe: null, roic: null,
            currentRatio: null, debtToEquity: null,
        });
    });

    it('prefers latest-statement shares when present (no fallback used)', () => {
        const withShares = [
            stmt({ fiscalPeriod: 'Q1', fiscalYear: 2026, endDate: new Date('2026-03-28T00:00:00Z'), netIncome: 2.174e9, sharesOutstanding: 3.7e9 }),
            ...cmcsaStatements.slice(1),
        ];
        const r = computeDayRatios(withShares, 21.57, asOf);
        expect(r.marketCap).toBeCloseTo(21.57 * 3.7e9, 0);
    });

    it('computes EV/EBIT and FCF yield from latest balance sheet + TTM flows', () => {
        const r = computeDayRatios(cmcsaStatements, 21.57, asOf);
        // EV = mcap + debt − cash; EBIT TTM has only FY fallback → 22e9
        expect(r.evEbitda).toBeCloseTo((21.57 * 3.9996e9 + 90e9 - 10e9) / 22e9, 1);
        expect(r.fcfYield).not.toBeNull();
        expect(r.fcfYield!).toBeGreaterThan(0);
    });
});

// V-shaped regression (2026-10): statement shares 1.883B vs trusted ticker
// shares 1.867B — the ~0.9% drift surfaced as chart EPS $11.92 vs page
// EPS $12.02 on the same ticker. Rule: trusted basis for dates on/after the
// latest statement period end (the "current" point), statement shares before.
const vStatements = [
    stmt({ fiscalPeriod: 'Q3', fiscalYear: 2026, endDate: new Date('2026-03-28T00:00:00Z'), netIncome: 22.45e9, sharesOutstanding: 1.883e9 }),
];

describe('computeDayRatios — trusted share basis', () => {
    const asOf = new Date('2026-04-10T04:00:00Z'); // after latest stmt end

    it('uses trustedShares at the current point → implied EPS matches the page', () => {
        const r = computeDayRatios(vStatements, 369.71, asOf, 1.867e9);
        expect(r.marketCap).toBeCloseTo(369.71 * 1.867e9, -5);
        // implied EPS = 22.45/1.867 ≈ 12.02 → P/E ≈ 30.75 (page-canonical)
        expect(r.peRatio).toBeCloseTo(369.71 / (22.45e9 / 1.867e9), 1);
    });

    it('keeps statement shares for dates before the latest statement end', () => {
        const past = new Date('2026-03-01T00:00:00Z');
        const r = computeDayRatios(vStatements, 369.71, past, 1.867e9);
        expect(r.marketCap).toBeCloseTo(369.71 * 1.883e9, -5);
    });

    it('falls back to statement shares when trustedShares is null/absent', () => {
        const r = computeDayRatios(vStatements, 369.71, asOf);
        expect(r.marketCap).toBeCloseTo(369.71 * 1.883e9, -5);
    });
});

// NFLX-shaped regression (2026-10): ~10:1 split between the Sep-2025
// (435M shares) and Dec-2025 (4.34B) statements. closePrice is
// split-adjusted; raw pre-split share counts would understate mcap and
// every market multiple by ~10× (observed prod: mcap $27B, P/B 1.97 on a
// 2021 row that should read ~$265B / ~17×).
const nflxStatements = [
    stmt({ fiscalPeriod: 'Q2', fiscalYear: 2026, endDate: new Date('2026-06-30T00:00:00Z'), sharesOutstanding: 4.164e9 }),
    stmt({ fiscalPeriod: 'Q1', fiscalYear: 2026, endDate: new Date('2026-03-30T00:00:00Z'), sharesOutstanding: 4.298e9 }),
    stmt({ fiscalPeriod: 'Q4', fiscalYear: 2025, endDate: new Date('2025-12-30T00:00:00Z'), sharesOutstanding: 4.344e9, netIncome: 3.2e9, revenue: 12e9 }),
    stmt({ fiscalPeriod: 'Q3', fiscalYear: 2025, endDate: new Date('2025-09-29T00:00:00Z'), sharesOutstanding: 0.435e9, netIncome: 2.9e9, revenue: 11e9 }),
    stmt({ fiscalPeriod: 'Q2', fiscalYear: 2025, endDate: new Date('2025-06-30T00:00:00Z'), sharesOutstanding: 0.438e9, netIncome: 3.06e9, revenue: 11e9, totalEquity: 13.9e9 }),
    stmt({ fiscalPeriod: 'FY', fiscalYear: 2024, endDate: new Date('2024-12-31T00:00:00Z'), sharesOutstanding: 0.44e9, netIncome: 8.7e9 }),
];

describe('computeDayRatios — split-normalized shares', () => {
    it('normalizes pre-split statement shares by the detected split factor', () => {
        // asOf in the pre-split era, split-adjusted close
        const r = computeDayRatios(nflxStatements, 60, new Date('2025-08-01T04:00:00Z'), 4.164e9);
        // Q2'25 stmt shares 438M × 10 = 4.38B → mcap ≈ $262.8B (not $26B)
        expect(r.marketCap).toBeCloseTo(60 * 4.38e9, -9);
        // P/B uses normalized mcap: 262.8B / 13.9B equity ≈ 18.9
        expect(r.pbRatio).toBeCloseTo((60 * 4.38e9) / 13.9e9, 0);
    });

    it('keeps post-split statements unnormalized (factor 1)', () => {
        const r = computeDayRatios(nflxStatements, 68.69, new Date('2026-01-15T04:00:00Z'), 4.164e9);
        // latest stmt ≤ asOf is Q4'25 (4.344B, post-split)
        expect(r.marketCap).toBeCloseTo(68.69 * 4.344e9, -9);
    });

    it('still prefers trustedShares for dates after the latest statement', () => {
        const r = computeDayRatios(nflxStatements, 68.69, new Date('2026-10-06T04:00:00Z'), 4.164e9);
        expect(r.marketCap).toBeCloseTo(68.69 * 4.164e9, -9);
    });

    it('anchors a split newer than the latest statement on trustedShares', () => {
        // All statements pre-split (Finnhub not yet updated); ticker count
        // already reflects the split → anchor boundary after latest stmt.
        const preSplitOnly = nflxStatements.slice(3); // Q3'25 and older
        const r = computeDayRatios(preSplitOnly, 60, new Date('2025-08-01T04:00:00Z'), 4.35e9);
        expect(r.marketCap).toBeCloseTo(60 * 4.38e9, -9);
    });

    it('does not treat organic share growth (<1.5×) as a split', () => {
        const organic = [
            stmt({ fiscalPeriod: 'Q2', fiscalYear: 2026, endDate: new Date('2026-06-30T00:00:00Z'), sharesOutstanding: 1.12e9 }),
            stmt({ fiscalPeriod: 'Q1', fiscalYear: 2026, endDate: new Date('2026-03-30T00:00:00Z'), sharesOutstanding: 1.10e9 }),
            stmt({ fiscalPeriod: 'Q4', fiscalYear: 2025, endDate: new Date('2025-12-30T00:00:00Z'), sharesOutstanding: 1.08e9 }),
        ];
        const r = computeDayRatios(organic, 50, new Date('2026-04-01T04:00:00Z'), 1.12e9);
        // latest stmt ≤ asOf is Q1'26 (1.10e9) — unnormalized, factor 1
        expect(r.marketCap).toBeCloseTo(50 * 1.10e9, -9);
    });
});
