import { quarterlyDiffCorr } from '@/lib/utils/analysisMath';

// Quarter-end aligned pairs — the chart co-movement metric resamples the
// weekly aligned series to the last observation per calendar quarter.
function pairsFromQuarterEnds(qEnds: { price: number; implied: number }[]) {
    return qEnds.map((q, i) => {
        const year = 2021 + Math.floor(i / 4);
        const month = [2, 5, 8, 11][i % 4]!;
        return { date: `${year}-${String(month).padStart(2, '0')}-25`, price: q.price, implied: q.implied };
    });
}

// Grow both series by per-quarter multiplicative diffs
function buildFromDiffs(dImplied: number[], priceFactor: (d: number, i: number) => number) {
    let implied = 100, price = 100;
    const ends: { price: number; implied: number }[] = [{ price, implied }];
    dImplied.forEach((d, i) => {
        implied *= 1 + d;
        price *= 1 + priceFactor(d, i);
        ends.push({ price, implied });
    });
    return pairsFromQuarterEnds(ends);
}

describe('quarterlyDiffCorr — co-movement on quarterly changes', () => {
    const diffs = [0.05, 0.02, 0.08, 0.03, 0.10, 0.04, 0.06, 0.01];

    it('reports high correlation when price moves with implied updates', () => {
        const pairs = buildFromDiffs(diffs, (d) => d * 1.5);
        const c = quarterlyDiffCorr(pairs);
        expect(c).not.toBeNull();
        expect(c!).toBeGreaterThan(0.95);
    });

    it('reports negative correlation when price moves opposite to implied', () => {
        const pairs = buildFromDiffs(diffs, (d) => -d * 1.2);
        const c = quarterlyDiffCorr(pairs);
        expect(c).not.toBeNull();
        expect(c!).toBeLessThan(-0.9);
    });

    it('does NOT report high correlation for merely co-trending levels (the spurious-levels trap)', () => {
        // Both series trend strongly upward every quarter (Pearson on LEVELS
        // would read ~+0.95), but the per-quarter changes are anti-aligned —
        // price makes its biggest gains exactly when implied barely moves.
        const reversed = [...diffs].reverse();
        const pairs = buildFromDiffs(diffs, (_d, i) => reversed[i]!);
        const c = quarterlyDiffCorr(pairs);
        expect(c).not.toBeNull();
        expect(Math.abs(c!)).toBeLessThan(0.7);
    });

    it('returns null when fewer than 4 usable quarter diffs exist', () => {
        const pairs = pairsFromQuarterEnds([
            { price: 100, implied: 50 },
            { price: 105, implied: 52 },
            { price: 110, implied: 55 },
        ]);
        expect(quarterlyDiffCorr(pairs)).toBeNull();
    });

    it('skips diffs where the previous quarter had no positive implied value', () => {
        const ends = [
            { price: 100, implied: 50 },
            { price: 60, implied: 0 },   // loss quarter — next diff must be skipped
            { price: 80, implied: 45 },
            { price: 90, implied: 50 },
            { price: 95, implied: 53 },
            { price: 100, implied: 56 },
            { price: 110, implied: 60 },
        ];
        const c = quarterlyDiffCorr(pairsFromQuarterEnds(ends));
        // 6 quarter boundaries, one skipped → 5 usable diffs — must not crash
        expect(c).not.toBeNull();
        expect(Number.isFinite(c!)).toBe(true);
    });
});
