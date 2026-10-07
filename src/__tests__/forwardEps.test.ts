import { quarterlyEpsSeries, ntmEpsAt, type StmtSlice } from '@/lib/utils/forwardEps';
import { resolvePeForward } from '@/services/analysis/fillValuationDay';

// Finnhub reports cumulative-YTD income: Q1=3M, Q2=6M, Q3=9M, FY=12M.
function q(fiscalYear: number, fiscalPeriod: string, endDate: string, netIncome: number | null, shares = 1000): StmtSlice {
    return {
        fiscalYear, fiscalPeriod,
        endDate: new Date(endDate + 'T00:00:00Z'),
        netIncome,
        sharesOutstanding: shares,
    };
}

const D = (s: string) => new Date(s + 'T00:00:00Z').getTime();

// Two clean years, 100/quarter standalone NI in 2024, growing in 2025.
const stmts = [
    q(2024, 'Q1', '2024-03-31', 100), q(2024, 'Q2', '2024-06-30', 210),
    q(2024, 'Q3', '2024-09-30', 330), q(2024, 'FY', '2024-12-31', 460),
    q(2025, 'Q1', '2025-03-31', 120), q(2025, 'Q2', '2025-06-30', 250),
    q(2025, 'Q3', '2025-09-30', 390), q(2025, 'FY', '2025-12-31', 560),
];

describe('quarterlyEpsSeries — YTD diffs to per-quarter EPS', () => {
    const series = quarterlyEpsSeries(stmts);

    it('decomposes cumulative YTD into standalone quarters incl. implied Q4', () => {
        // 2024: 100, 110, 120, 130 — 2025: 120, 130, 140, 170 (FY 560 − Q3 390)
        expect(series.map(s => s.eps)).toEqual([
            0.1, 0.11, 0.12, 0.13,
            0.12, 0.13, 0.14, 0.17,
        ].map(v => expect.closeTo(v, 5)));
        expect(series.map(s => new Date(s.endMs).toISOString().slice(0, 10))).toEqual([
            '2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31',
            '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31',
        ]);
    });

    it('split-normalizes pre-split shares (2:1 jump → halves pre-split EPS)', () => {
        const splitStmts = [
            q(2024, 'Q1', '2024-03-31', 100, 500), q(2024, 'Q2', '2024-06-30', 210, 500),
            q(2024, 'Q3', '2024-09-30', 330, 500), q(2024, 'FY', '2024-12-31', 460, 500),
            // 2:1 split between periods — post-split shares ×2
            q(2025, 'Q1', '2025-03-31', 120, 1000), q(2025, 'Q2', '2025-06-30', 250, 1000),
            q(2025, 'Q3', '2025-09-30', 390, 1000), q(2025, 'FY', '2025-12-31', 560, 1000),
        ];
        const s = quarterlyEpsSeries(splitStmts);
        // Pre-split quarters: NI / (500 × 2) — same units as post-split.
        expect(s[0]!.eps).toBeCloseTo(100 / 1000, 5);
        expect(s[4]!.eps).toBeCloseTo(120 / 1000, 5);
    });

    it('ignores a one-quarter share-count spike (post-split units reported early)', () => {
        // NVDA-shaped glitch: Q1'24 filed with 24.73B (the future 10:1 count)
        // between 2.51B and 2.49B — then the real 10:1 split lands a year
        // later. Without the persistence guard, boundaries stack ×100.
        const nvda = [
            q(2024, 'Q1', '2024-03-31', 100, 2517),   // NI in $M-equivalents
            q(2024, 'Q2', '2024-06-30', 200, 2495),
            q(2024, 'Q3', '2024-09-30', 300, 2490),
            q(2024, 'FY', '2024-12-31', 400, 2473),
            q(2025, 'Q1', '2025-03-31', 110, 24730),  // ← spike: post-split units early
            q(2025, 'Q2', '2025-06-30', 230, 2495),
            q(2025, 'Q3', '2025-09-30', 360, 2490),
            q(2025, 'FY', '2025-12-31', 480, 2470),
            q(2026, 'Q1', '2026-03-31', 120, 24870),  // real 10:1 split
            q(2026, 'Q2', '2026-06-30', 250, 24840),
            q(2026, 'Q3', '2026-09-30', 390, 24810),
            q(2026, 'FY', '2026-12-31', 520, 24800),
        ];
        const s = quarterlyEpsSeries(nvda);
        // 2024 quarters: shares 2.5B ×10 → eps = NI/25B (today units)
        expect(s[0]!.eps).toBeCloseTo(100 / 25170, 6);
        // The spike row: raw 24.73B already equals the normalized level →
        // kept as-is, eps correct instead of ×10 too small.
        expect(s[4]!.eps).toBeCloseTo(110 / 24730, 6);
        // NTM window after Q3'25: Q4'25(120) + Q1'26 + Q2'26 + Q3'26 =
        // 120/24.7k + 120/24.87k + 130/24.84k + 120/24.81k ≈ 0.0204
        const ntm = ntmEpsAt(s, D('2025-09-30'));
        expect(ntm).toBeGreaterThan(0.018);
        expect(ntm).toBeLessThan(0.023);
    });

    it('keeps uncomputable quarters in the grid as eps=null', () => {
        const gap = stmts.map((s) =>
            s.fiscalYear === 2025 && s.fiscalPeriod === 'Q2' ? { ...s, netIncome: null } : s);
        const s = quarterlyEpsSeries(gap);
        // Q2'25 has no NI; Q3'25's YTD diff would span two quarters → null too.
        expect(s[5]!.eps).toBeNull();
        expect(s[6]!.eps).toBeNull();
        // Q4'25 = FY − Q3YTD is still computable from raw levels.
        expect(s[7]!.eps).toBeCloseTo(560 / 1000 - 390 / 1000, 5);
    });
});

describe('ntmEpsAt — next four reported quarters', () => {
    const series = quarterlyEpsSeries(stmts);

    it('sums the four quarter-ends strictly after the date', () => {
        // Between Q1'24 and Q2'24 ends: Q2+Q3+Q4 2024 + Q1 2025
        // = (0.11 + 0.12 + 0.13 + 0.12) = 0.48
        expect(ntmEpsAt(series, D('2024-04-15'))).toBeCloseTo(0.48, 5);
    });

    it('excludes a quarter whose end falls exactly on the date', () => {
        // On Q1'24's end date the window starts at Q2 — same as mid-quarter.
        expect(ntmEpsAt(series, D('2024-03-31'))).toBeCloseTo(0.48, 5);
    });

    it('returns null inside the last four reported quarters — series ends honestly', () => {
        expect(ntmEpsAt(series, D('2025-09-30'))).toBeNull(); // only Q4'25 remains
        expect(ntmEpsAt(series, D('2026-01-15'))).toBeNull(); // nothing left
    });

    it('returns null when a gap inside the 4-quarter window is unreported', () => {
        const gap = stmts.map((s) =>
            s.fiscalYear === 2025 && s.fiscalPeriod === 'Q1' ? { ...s, netIncome: null } : s);
        const s = quarterlyEpsSeries(gap);
        // After Q4'24: the window hits the null Q1'25 cell → null, not a
        // silently short window.
        expect(ntmEpsAt(s, D('2025-01-10'))).toBeNull();
        // Earlier windows that don't reach the hole still resolve.
        expect(ntmEpsAt(s, D('2024-01-15'))).toBeCloseTo(0.46, 5);
    });

    it('empty statements → empty series → always null', () => {
        expect(quarterlyEpsSeries([])).toEqual([]);
        expect(ntmEpsAt([], D('2025-01-01'))).toBeNull();
    });
});

describe('resolvePeForward — consensus snapshot stamping', () => {
    const day = D('2026-10-07');

    it('stamps the snapshot on its own fetch day', () => {
        expect(resolvePeForward({ pe: 35.3, fetchedMs: day + 20 * 3600_000 }, day, null)).toBe(35.3);
    });

    it('does not backdate today\'s estimate onto a historical repair fill', () => {
        expect(resolvePeForward({ pe: 35.3, fetchedMs: day }, D('2024-05-01'), null)).toBeNull();
    });

    it('keeps the stored snapshot when the metric row is stale relative to the day', () => {
        // Fetched 3d ago, today's row already holds a value → preserve.
        expect(resolvePeForward({ pe: 35.3, fetchedMs: day - 72 * 3600_000 }, day, 33.1)).toBe(33.1);
    });

    it('never erases an existing snapshot when none is available', () => {
        expect(resolvePeForward(undefined, day, 33.1)).toBe(33.1);
        expect(resolvePeForward(undefined, day, null)).toBeNull();
    });
});
