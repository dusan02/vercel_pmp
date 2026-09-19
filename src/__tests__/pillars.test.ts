import { computePillars, type PillarInputs } from '@/services/analysis/pillars';

const base: PillarInputs = {
    pePercentile: null, fcfYield: null, psRatio: null, evEbit: null,
    revenueCagr: null, netIncomeCagr: null, epsCagr5y: null, forwardImpliedGrowth: null,
    roic: null, roe: null, netMargin: null, operatingMargin: null,
    altmanZ: null, currentRatio: null, interestCoverage: null, netCash: null, debtRatio: null,
    piotroski: null, beneish: null, fcfConversion: null, marginStability: null,
};

describe('computePillars — MU-like inputs (prod snapshot)', () => {
    const mu = computePillars({
        ...base,
        pePercentile: 15, fcfYield: 0.023, psRatio: 12.7, evEbit: 19,
        revenueCagr: 7.77, netIncomeCagr: 9.86, epsCagr5y: 69.3, forwardImpliedGrowth: 292,
        roic: 0.582, roe: 0.501, netMargin: 0.559, operatingMargin: 0.656,
        altmanZ: 10.2, currentRatio: 2.5, interestCoverage: null, netCash: true, debtRatio: null,
        piotroski: 7, beneish: -2.906, fcfConversion: 0.519, marginStability: 0.242,
    });

    it('Profitability = 100 (ROIC/ROE/NM/OM all top band)', () => {
        expect(mu.profitability.score).toBe(100);
        expect(mu.profitability.legs.map(l => l.points)).toEqual([25, 25, 25, 25]);
    });

    it('Growth = 74 (12 + 12 + 25 + 25)', () => {
        expect(mu.growth.score).toBe(74);
        expect(mu.growth.legs.map(l => l.points)).toEqual([12, 12, 25, 25]);
    });

    it('Quality = 68 (22 + 25 + 15 + 6)', () => {
        expect(mu.quality.score).toBe(68);
        expect(mu.quality.legs.map(l => l.points)).toEqual([22, 25, 15, 6]);
    });

    it('Valuation = 47 (pct 25 + fcfY 5 + ps 5 + evEbit 12)', () => {
        expect(mu.valuation.score).toBe(47);
        expect(mu.valuation.legs.map(l => l.points)).toEqual([25, 5, 5, 12]);
    });
});

describe('computePillars — real zero floor (no "else 5")', () => {
    const bad = computePillars({
        ...base,
        piotroski: 1, beneish: 0.5, fcfConversion: -0.3, marginStability: 0.4,
        roic: -0.1, roe: -0.2, netMargin: -0.05, operatingMargin: -0.1,
        revenueCagr: -10, netIncomeCagr: -20, epsCagr5y: -30, forwardImpliedGrowth: -50,
    });

    it('worst-case Quality = 0', () => {
        expect(bad.quality.score).toBe(0);
        expect(bad.quality.legs.every(l => l.points === 0)).toBe(true);
    });

    it('worst-case Profitability = 0 and Growth = 0', () => {
        expect(bad.profitability.score).toBe(0);
        expect(bad.growth.score).toBe(0);
    });
});

describe('computePillars — missing data handling', () => {
    it('all-null inputs: Valuation gets neutral 40 (4 × 10 legacy convention), others 0', () => {
        const p = computePillars(base);
        expect(p.valuation.score).toBe(40);
        expect(p.growth.score).toBe(0);
        expect(p.profitability.score).toBe(0);
        expect(p.quality.score).toBe(0);
    });

    it('interestCoverage null → +25 (no interest expense = fully covered)', () => {
        const p = computePillars({ ...base, altmanZ: 3.5, currentRatio: 2.5, netCash: true });
        // 25 (altman) + 25 (cr) + 25 (ic null) + 25 (net cash) = 100
        expect(p.health.score).toBe(100);
    });

    it('netDebtRatio used only when not net-cash', () => {
        const p = computePillars({ ...base, netCash: false, debtRatio: 0.2 });
        expect(p.health.legs.find(l => l.key === 'balance')!.points).toBe(12);
    });
});

describe('computePillars — leg metadata for "Why?" breakdowns', () => {
    it('every pillar exposes 4 legs with label/display/points/max', () => {
        const p = computePillars({ ...base, roic: 0.3, piotroski: 8 });
        for (const pillar of Object.values(p)) {
            expect(pillar.legs).toHaveLength(4);
            for (const l of pillar.legs) {
                expect(l.label).toBeTruthy();
                expect(l.display).toBeTruthy();
                expect(l.max).toBe(25);
                expect(l.points).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('boundary: ROE exactly 0.25 falls into the 20 band (strict >)', () => {
        const p = computePillars({ ...base, roe: 0.25 });
        expect(p.profitability.legs.find(l => l.key === 'roe')!.points).toBe(20);
    });
});
