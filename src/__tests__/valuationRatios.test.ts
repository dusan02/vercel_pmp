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
        expect(r).toEqual({ marketCap: null, peRatio: null, psRatio: null, evEbitda: null, fcfYield: null });
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
