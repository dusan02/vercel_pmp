import type { FinancialStatement } from '@prisma/client';
import { computeDayRatios } from '@/services/analysis/fillValuationDay';
import { applySplitEventsToStatements } from '@/lib/utils/splitAdjustment';

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

    it('does not multiply a transient post-split count by the real split (NVDA Q1-24 glitch)', () => {
        // Finnhub filed NVDA's 10:1-adjusted count a year early (Apr'23:
        // 24.7B between 2.51B and 2.49B) — real split lands Jul'24.
        const nvda = [
            stmt({ fiscalPeriod: 'Q3', fiscalYear: 2025, endDate: new Date('2024-10-26T00:00:00Z'), sharesOutstanding: 24.84e9 }),
            stmt({ fiscalPeriod: 'Q2', fiscalYear: 2025, endDate: new Date('2024-07-27T00:00:00Z'), sharesOutstanding: 24.87e9 }),
            stmt({ fiscalPeriod: 'Q1', fiscalYear: 2025, endDate: new Date('2024-04-27T00:00:00Z'), sharesOutstanding: 2.489e9 }),
            stmt({ fiscalPeriod: 'Q3', fiscalYear: 2024, endDate: new Date('2023-10-28T00:00:00Z'), sharesOutstanding: 2.494e9 }),
            stmt({ fiscalPeriod: 'Q2', fiscalYear: 2024, endDate: new Date('2023-07-29T00:00:00Z'), sharesOutstanding: 2.495e9 }),
            stmt({ fiscalPeriod: 'Q1', fiscalYear: 2024, endDate: new Date('2023-04-30T00:00:00Z'), sharesOutstanding: 24.73e9, netIncome: 1.49e9, revenue: 7.2e9 }),
            stmt({ fiscalPeriod: 'Q4', fiscalYear: 2023, endDate: new Date('2023-01-28T00:00:00Z'), sharesOutstanding: 2.517e9 }),
            stmt({ fiscalPeriod: 'Q3', fiscalYear: 2023, endDate: new Date('2022-10-29T00:00:00Z'), sharesOutstanding: 2.517e9 }),
        ];
        // asOf lands while the corrupt Apr'23 row is still the latest
        // statement carrying shares — its raw count is already post-split
        // units, so the dated ×10 boundary must NOT double-apply.
        const r = computeDayRatios(nvda, 29, new Date('2023-05-15T04:00:00Z'));
        expect(r.marketCap).toBeCloseTo(29 * 24.73e9, -9); // ~$717B, not $7.2T
    });
});

// LRCX-shaped regression (2026-10): 10:1 split executed 2024-10-02, but the
// Q1'25 statement (period ended 2024-09-28, filed post-split) already reports
// the post-split 1.30B count. A blind "multiply every endDate < splitDate"
// rule produces 13B shares → 10× marketCap/P·S for the whole quarter where
// that row is the latest statement (prod DVH showed P/S ~68× Sep30–Dec27).
const lrcxStatements = [
    stmt({ fiscalPeriod: 'Q2', fiscalYear: 2025, endDate: new Date('2024-12-28T00:00:00Z'), sharesOutstanding: 1.297767e9 }),
    stmt({ fiscalPeriod: 'Q1', fiscalYear: 2025, endDate: new Date('2024-09-28T00:00:00Z'), sharesOutstanding: 1.304066e9 }),
    stmt({ fiscalPeriod: 'FY', fiscalYear: 2024, endDate: new Date('2024-06-29T00:00:00Z'), sharesOutstanding: 0.131995e9 }),
    stmt({ fiscalPeriod: 'Q3', fiscalYear: 2024, endDate: new Date('2024-03-30T00:00:00Z'), sharesOutstanding: 0.132282e9 }),
    stmt({ fiscalPeriod: 'Q2', fiscalYear: 2024, endDate: new Date('2023-12-23T00:00:00Z'), sharesOutstanding: 0.132693e9 }),
];

describe('applySplitEventsToStatements — post-split-level guard', () => {
    it('multiplies true pre-split statements but skips an already-adjusted one (LRCX 10:1)', () => {
        const stmts = lrcxStatements.map(s => ({ ...s }));
        applySplitEventsToStatements(stmts, [{ date: new Date('2024-10-02T00:00:00Z'), ratio: 10 }]);
        // Q1'25 ends before the split but already reports post-split shares → untouched
        expect(stmts[1]!.sharesOutstanding).toBeCloseTo(1.304066e9, 0);
        // FY'24 + earlier quarters are genuine pre-split counts → ×10
        expect(stmts[2]!.sharesOutstanding).toBeCloseTo(1.31995e9, -2);
        expect(stmts[3]!.sharesOutstanding).toBeCloseTo(1.32282e9, -2);
        expect(stmts[4]!.sharesOutstanding).toBeCloseTo(1.32693e9, -2);
        // Post-split statement untouched
        expect(stmts[0]!.sharesOutstanding).toBeCloseTo(1.297767e9, 0);
    });

    it('multiplies everything pre-date when no post-split statement exists', () => {
        const stmts = lrcxStatements.slice(2).map(s => ({ ...s })); // only pre-split statements
        applySplitEventsToStatements(stmts, [{ date: new Date('2024-10-02T00:00:00Z'), ratio: 10 }]);
        for (const s of stmts) expect(s.sharesOutstanding!).toBeGreaterThan(1e9);
    });
});

describe('computeDayRatios — Finnhub ×1000/÷1000 unit glitches & corrupt-row fallback', () => {
    it('rescales ×1000 share-count glitches (WAT Q1-Q2 2026: 82B/90B instead of 82M/90M)', () => {
        const wat = [
            stmt({ fiscalPeriod: 'Q2', fiscalYear: 2026, endDate: new Date('2026-07-03T00:00:00Z'), sharesOutstanding: 90.041e9, revenue: 1.5e9 }),
            stmt({ fiscalPeriod: 'Q1', fiscalYear: 2026, endDate: new Date('2026-04-03T00:00:00Z'), sharesOutstanding: 82.139e9, revenue: 0.7e9 }),
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-30T00:00:00Z'), sharesOutstanding: 59.706e6, revenue: 3.0e9 }),
            stmt({ fiscalPeriod: 'Q3', fiscalYear: 2025, endDate: new Date('2025-09-26T00:00:00Z'), sharesOutstanding: 59.656e6, revenue: 2.1e9 }),
            stmt({ fiscalPeriod: 'Q1', fiscalYear: 2025, endDate: new Date('2025-03-28T00:00:00Z'), sharesOutstanding: 59.711e6, revenue: 0.65e9 }),
        ];
        // Between Q1'26 and Q2'26 (before latest stmt endDate), Q1'26 82.139B must rescale to 82.139M
        const r = computeDayRatios(wat, 304, new Date('2026-04-06T04:00:00Z'), 98.248e6);
        expect(r.marketCap).toBeCloseTo(304 * 82.139e6, -6); // ~$25.0B, not $25.0T
        expect(r.psRatio).toBeLessThan(12);
    });

    it('rescales ÷1000 share-count glitches on both quarterly and FY filings (DLR / SWBI)', () => {
        const dlr = [
            stmt({ fiscalPeriod: 'Q2', fiscalYear: 2023, endDate: new Date('2023-06-29T00:00:00Z'), sharesOutstanding: 304.452e6, revenue: 2.7e9 }),
            stmt({ fiscalPeriod: 'Q1', fiscalYear: 2023, endDate: new Date('2023-03-30T00:00:00Z'), sharesOutstanding: 303_065, revenue: 1.34e9 }),
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2022, endDate: new Date('2022-12-30T00:00:00Z'), sharesOutstanding: 297_919, revenue: 4.69e9 }),
            stmt({ fiscalPeriod: 'Q3', fiscalYear: 2022, endDate: new Date('2022-09-29T00:00:00Z'), sharesOutstanding: 294.257e6, revenue: 3.47e9 }),
            stmt({ fiscalPeriod: 'Q1', fiscalYear: 2022, endDate: new Date('2022-03-30T00:00:00Z'), sharesOutstanding: 285_025, revenue: 1.13e9 }),
        ];
        const rFy = computeDayRatios(dlr, 100, new Date('2023-01-15T04:00:00Z'), 370.99e6);
        expect(rFy.marketCap).toBeCloseTo(100 * 297.919e6, -5);
        const rQ1 = computeDayRatios(dlr, 100, new Date('2023-04-15T04:00:00Z'), 370.99e6);
        expect(rQ1.marketCap).toBeCloseTo(100 * 303.065e6, -5);
    });

    it('falls back to the preceding valid statement when a filing has a non-1000× corrupt count (ERIE / BRK.B)', () => {
        const erie = [
            stmt({ fiscalPeriod: 'Q3', fiscalYear: 2021, endDate: new Date('2021-09-29T00:00:00Z'), sharesOutstanding: 52.310e6, revenue: 2.0e9 }),
            stmt({ fiscalPeriod: 'Q2', fiscalYear: 2021, endDate: new Date('2021-06-29T00:00:00Z'), sharesOutstanding: 2.542e9, revenue: 1.3e9 }),
            stmt({ fiscalPeriod: 'Q3', fiscalYear: 2020, endDate: new Date('2020-09-29T00:00:00Z'), sharesOutstanding: 52.315e6, revenue: 1.9e9 }),
        ];
        const r = computeDayRatios(erie, 178, new Date('2021-07-15T04:00:00Z'), 52.29e6);
        // Skips corrupt Q2'21 (2.542B) and uses Q3'20 (52.315M) → ~$9.3B, not $452B
        expect(r.marketCap).toBeCloseTo(178 * 52.315e6, -5);

        const brkB = [
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2024, endDate: new Date('2024-12-31T00:00:00Z'), sharesOutstanding: 2.15658e9, revenue: 371e9 }),
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2023, endDate: new Date('2023-12-31T00:00:00Z'), sharesOutstanding: 2.17332e9, revenue: 364e9 }),
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2022, endDate: new Date('2022-12-31T00:00:00Z'), sharesOutstanding: 1.44192e6, revenue: 302e9 }),
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2021, endDate: new Date('2021-12-31T00:00:00Z'), sharesOutstanding: 2.26527e9, revenue: 276e9 }),
        ];
        const rBrk = computeDayRatios(brkB, 310, new Date('2023-06-15T04:00:00Z'), 2.157e9);
        expect(rBrk.marketCap).toBeCloseTo(310 * 2.26527e9, -7); // ~$702B, not $0.45B
    });

    it('normalizes persistent ADR ordinary-share counts into ADR units (BP 6:1)', () => {
        const bp = [
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-12-31T00:00:00Z'), sharesOutstanding: 15.522e9, revenue: 187.6e9 }),
            stmt({ fiscalPeriod: 'FY', fiscalYear: 2024, endDate: new Date('2024-12-31T00:00:00Z'), sharesOutstanding: 15.377e9, revenue: 187.4e9 }),
        ];
        const rBefore = computeDayRatios(bp, 35, new Date('2025-06-15T04:00:00Z'), 2.575e9);
        const rAfter = computeDayRatios(bp, 35, new Date('2026-06-15T04:00:00Z'), 2.575e9);
        // No 6× cliff across 2025-12-31
        expect(rBefore.marketCap! / rAfter.marketCap!).toBeCloseTo(15.377 / 15.522, 2);
    });
});
