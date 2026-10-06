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
