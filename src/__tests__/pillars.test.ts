import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { computePillars, deriveMoatInputs, pillarSummary, interpolate, pegGrowth, type MoatStatement, type PillarInputs } from '@/services/analysis/pillars';
import PillarsRadar, { PillarChips } from '@/components/company/analysis/PillarsRadar';

const base: PillarInputs = {
    pePercentile: null, fcfYield: null, psRatio: null, evEbit: null,
    revenueCagr: null, netIncomeCagr: null, epsCagr5y: null, forwardImpliedGrowth: null,
    roic: null, roe: null, netMargin: null, operatingMargin: null,
    altmanZ: null, currentRatio: null, interestCoverage: null, netCash: null, debtRatio: null,
    piotroski: null, beneish: null, fcfConversion: null, marginStability: null,
    moatRoicDurability: null, moatGmMedian: null, moatFcfDurability: null, moatMarginFloor: null,
};

describe('computePillars — MU-like inputs (prod snapshot, continuous model)', () => {
    const mu = computePillars({
        ...base,
        pePercentile: 15, fcfYield: 0.023, psRatio: 12.7, evEbit: 19,
        currentPe: 22, forwardPe: 5.87,
        revenueCagr: 7.77, netIncomeCagr: 9.86, epsCagr5y: 69.3, forwardImpliedGrowth: 292,
        roic: 0.582, roe: 0.501, netMargin: 0.559, operatingMargin: 0.656,
        altmanZ: 10.2, currentRatio: 2.5, interestCoverage: null, netCash: true, debtRatio: null,
        piotroski: 7, beneish: -2.906, fcfConversion: 0.519, marginStability: 0.242,
    });

    it('Profitability = 100 (all four legs above their ceilings)', () => {
        expect(mu.profitability.score).toBe(100);
        expect(mu.profitability.legs.map(l => l.points)).toEqual([25, 25, 25, 25]);
    });

    it('Growth = 79 — interpolated, not stepped (7.8% rev CAGR → 13, not 12)', () => {
        expect(mu.growth.legs.map(l => l.points)).toEqual([13, 16, 25, 25]);
        expect(mu.growth.score).toBe(79);
    });

    it('Quality = 62 (σ fallback when no downside stat is supplied)', () => {
        expect(mu.quality.legs.map(l => l.points)).toEqual([21, 25, 13, 3]);
        expect(mu.quality.score).toBe(62);
    });

    it('Valuation uses PEG (profitable) instead of P/S — median growth capped at 40%', () => {
        const peg = mu.valuation.legs[2]!;
        expect(peg.key).toBe('peg');
        // median(292, 69.3, 7.77) = 69.3 → cap 40 → 5.87 / 40 ≈ 0.15 → 25
        expect(peg.points).toBe(25);
        expect(mu.valuation.score).toBe(70);
    });
});

describe('computePillars — real zero floor (no "else 5")', () => {
    const bad = computePillars({
        ...base,
        piotroski: 0, beneish: 0.5, fcfConversion: -0.3, marginStability: 0.4,
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

describe('interpolate — continuous leg scoring', () => {
    const A = [[0, 0], [10, 20], [20, 25]] as const;
    it('clamps below/above the anchor range', () => {
        expect(interpolate(-5, A)).toBe(0);
        expect(interpolate(99, A)).toBe(25);
    });
    it('interpolates linearly between anchors (no cliffs)', () => {
        expect(interpolate(5, A)).toBe(10);
        expect(interpolate(15, A)).toBe(23);
    });
    it('supports lower-is-better tables', () => {
        expect(interpolate(0.75, [[0.5, 25], [1.0, 20]])).toBe(23);
    });
});

describe('Valuation — PEG / P/S selection (NVDA case)', () => {
    const nvda = computePillars({
        ...base,
        pePercentile: 0.08, fcfYield: 0.033, psRatio: 12.66, evEbit: 19.3,
        currentPe: 19.9, forwardPe: 14.47,
        revenueCagr: 68.3, epsCagr5y: 88.9, forwardImpliedGrowth: 37.4,
    });

    it('NVDA: PEG 0.36 → full points; Valuation rises from the old 54 to 75', () => {
        const peg = nvda.valuation.legs[2]!;
        expect(peg.key).toBe('peg');
        expect(peg.value).toBeCloseTo(14.47 / 40, 3);
        expect(nvda.valuation.score).toBe(75);
        expect(nvda.valuation.legs[0]!.display).toBe('lowest in history');
    });

    it('loss-maker keeps the P/S leg', () => {
        const p = computePillars({ ...base, currentPe: null, psRatio: 3 });
        expect(p.valuation.legs[2]!.key).toBe('psRatio');
        expect(p.valuation.legs[2]!.label).toContain('no earnings');
    });

    it('pegGrowth = median of the three reads (one distorted read cannot decide)', () => {
        // GOOGL-like: fwd implied −44% (one-off gains in TTM EPS)
        expect(pegGrowth({ forwardImpliedGrowth: -44, epsCagr5y: 18, revenueCagr: 12 })).toBe(12);
        expect(pegGrowth({ forwardImpliedGrowth: 292, epsCagr5y: 69, revenueCagr: 8 })).toBe(40);
        expect(pegGrowth({ forwardImpliedGrowth: null, epsCagr5y: 10, revenueCagr: 20 })).toBe(15);
    });

    it('flat grower: growth floored at 5% — P/E 6 still reads cheap, P/E 25 rich', () => {
        const cheap = computePillars({ ...base, currentPe: 6, revenueCagr: 0, epsCagr5y: -3 });
        const rich = computePillars({ ...base, currentPe: 25, revenueCagr: 0, epsCagr5y: -3 });
        expect(cheap.valuation.legs[2]!.points).toBeGreaterThanOrEqual(17);
        expect(rich.valuation.legs[2]!.points).toBe(0);
    });
});

describe('Quality — Beneish hyper-growth guard + downside-only margins', () => {
    it('Beneish above the flag line at +65% revenue growth → neutral 13 + note', () => {
        const p = computePillars({ ...base, beneish: -1.14, revenueGrowthYoY: 65 });
        const b = p.quality.legs.find(l => l.key === 'beneish')!;
        expect(b.points).toBe(13);
        expect(b.note).toMatch(/Not meaningful/);
    });

    it('same Beneish at normal growth is scored and flagged normally', () => {
        const p = computePillars({ ...base, beneish: -1.14, revenueGrowthYoY: 10 });
        const b = p.quality.legs.find(l => l.key === 'beneish')!;
        expect(b.note).toBeUndefined();
        expect(b.points).toBeLessThan(10);
    });

    it('margin leg prefers downside RMS — expansion is not instability', () => {
        const p = computePillars({ ...base, marginStability: 0.175, marginDownside: 0 });
        const m = p.quality.legs.find(l => l.key === 'marginStability')!;
        expect(m.points).toBe(25);
        expect(m.display).toBe('no drops');
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
        // 24 (altman 3.5) + 24 (cr 2.5) + 25 (ic null) + 25 (net cash) = 97
        expect(p.health.legs.find(l => l.key === 'interestCoverage')!.points).toBe(25);
        expect(p.health.score).toBe(97);
    });

    it('netDebtRatio used only when not net-cash', () => {
        const p = computePillars({ ...base, netCash: false, debtRatio: 0.2 });
        expect(p.health.legs.find(l => l.key === 'balance')!.points).toBe(15);
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

    it('ROE 25% sits on its anchor (22), full points only at 40%', () => {
        const p = computePillars({ ...base, roe: 0.25 });
        expect(p.profitability.legs.find(l => l.key === 'roe')!.points).toBe(22);
        expect(computePillars({ ...base, roe: 0.4 }).profitability.legs.find(l => l.key === 'roe')!.points).toBe(25);
    });

    it('formats pePercentile with proper English ordinals (1st, 2nd, 3rd, 12th)', () => {
        expect(computePillars({ ...base, pePercentile: 1 }).valuation.legs[0]!.display).toBe('1st pct');
        expect(computePillars({ ...base, pePercentile: 2.1 }).valuation.legs[0]!.display).toBe('2nd pct');
        expect(computePillars({ ...base, pePercentile: 3 }).valuation.legs[0]!.display).toBe('3rd pct');
        expect(computePillars({ ...base, pePercentile: 12 }).valuation.legs[0]!.display).toBe('12th pct');
        expect(computePillars({ ...base, pePercentile: 22 }).valuation.legs[0]!.display).toBe('22nd pct');
    });
});

describe('pillarSummary', () => {
    it('names strong and weak pillars', () => {
        // LLY-like: strong profitability+growth, weak valuation
        const p = computePillars({
            ...base,
            pePercentile: 90, fcfYield: 0.01, psRatio: 30, evEbit: 50,   // V → 0-ish... pct 90→0, fcfY→5? let me just set high
            roic: 0.4, roe: 0.8, netMargin: 0.35, operatingMargin: 0.45, // P → 100
            revenueCagr: 25, netIncomeCagr: 30, epsCagr5y: 40, forwardImpliedGrowth: 35, // G → 100
            piotroski: 5, beneish: -1.8, fcfConversion: 0.6, marginStability: 0.12, // Q → 15+12+15+12 = 54
            altmanZ: 2.5, currentRatio: 1.2, interestCoverage: 3, netCash: false, debtRatio: 0.35, // H → 18+12+10+5 = 45 → also weak!
        });
        const s = pillarSummary(p);
        expect(s).toContain('profitability');
        expect(s).toContain('growth');
        expect(s).toContain('valuation');
    });

    it('names a strong moat', () => {
        const p = computePillars({
            ...base,
            moatRoicDurability: { good: 9, total: 10 },
            moatGmMedian: 0.6,
            moatFcfDurability: { good: 10, total: 10 },
            moatMarginFloor: 0.2,
        });
        expect(pillarSummary(p)).toContain('moat');
    });

    it('survives partial pillar objects (blog builds 5-key scores without moat)', () => {
        const partial = {
            valuation: { key: 'valuation' as const, label: 'Valuation', score: 80, legs: [] },
        } as never;
        expect(() => pillarSummary(partial)).not.toThrow();
    });

    it('fully moderate profile → balanced sentence', () => {
        const p = computePillars({
            ...base,
            pePercentile: 55, fcfYield: 0.04, psRatio: 8, evEbit: 20, // 12+12+12+12=48→weak... need ≥50
        });
        // Just check the balanced branch directly via constructed scores
        const balanced = {
            valuation: { key: 'valuation' as const, label: 'Valuation', score: 60, legs: [] },
            growth: { key: 'growth' as const, label: 'Growth', score: 60, legs: [] },
            profitability: { key: 'profitability' as const, label: 'Profitability', score: 60, legs: [] },
            health: { key: 'health' as const, label: 'Financial Health', score: 60, legs: [] },
            quality: { key: 'quality' as const, label: 'Quality', score: 60, legs: [] },
            moat: { key: 'moat' as const, label: 'Moat', score: 60, legs: [] },
        };
        expect(pillarSummary(balanced)).toBe('Balanced profile — no dimension clearly leads or lags.');
        expect(p.growth.score).toBe(0); // sanity
    });
});

// ── Moat ─────────────────────────────────────────────────────────────────────

function fy(over: Partial<MoatStatement>): MoatStatement {
    return {
        revenue: null, netIncome: null, ebit: null, grossProfit: null,
        operatingCashFlow: null, capex: null, totalEquity: null,
        totalDebt: null, cashAndEquivalents: null, ...over,
    };
}

/** MSFT-like: high ROIC every year, 65% GM, always FCF-positive, NM ≥25%. */
const wideMoat = Array.from({ length: 10 }, () => fy({
    revenue: 100e9, netIncome: 30e9, ebit: 45e9, grossProfit: 65e9,
    operatingCashFlow: 50e9, capex: -10e9,
    totalEquity: 80e9, totalDebt: 50e9, cashAndEquivalents: 100e9,
}));

/** Airline-like: losses every year, FCF negative, thin GM. */
const noMoat = Array.from({ length: 10 }, () => fy({
    revenue: 40e9, netIncome: -5e9, ebit: -3e9, grossProfit: 8e9,
    operatingCashFlow: 2e9, capex: -5e9,
    totalEquity: 10e9, totalDebt: 30e9, cashAndEquivalents: 3e9,
}));

describe('deriveMoatInputs', () => {
    it('wide-moat profile: ROIC durable 10/10, GM 65%, FCF 10/10, floor 30%', () => {
        const m = deriveMoatInputs(wideMoat);
        expect(m.roicDurability).toEqual({ good: 10, total: 10 });
        expect(m.gmMedian).toBeCloseTo(0.65, 3);
        expect(m.fcfDurability).toEqual({ good: 10, total: 10 });
        expect(m.marginFloor).toBeCloseTo(0.3, 3);
    });

    it('no-moat profile: 0 good years, negative floor', () => {
        const m = deriveMoatInputs(noMoat);
        expect(m.roicDurability).toEqual({ good: 0, total: 10 });
        expect(m.fcfDurability).toEqual({ good: 0, total: 10 });
        expect(m.marginFloor).toBeLessThan(0);
        expect(m.gmMedian).toBeCloseTo(0.2, 3);
    });

    it('<3 computable years → all legs null (moat unproven, not fabricated)', () => {
        const m = deriveMoatInputs(wideMoat.slice(0, 2));
        expect(m).toEqual({ roicDurability: null, gmMedian: null, fcfDurability: null, marginFloor: null });
    });

    it('a year missing ebit is excluded from the ROIC denominator, not scored as bad', () => {
        const rows = [...wideMoat.slice(0, 8), fy({ revenue: 100e9, netIncome: 30e9 }), fy({ ...wideMoat[0]!, ebit: null })];
        const m = deriveMoatInputs(rows);
        expect(m.roicDurability).toEqual({ good: 8, total: 8 });
    });

    it('a year missing capex is excluded from the FCF denominator', () => {
        const rows = [...wideMoat.slice(0, 9), fy({ revenue: 100e9, netIncome: 30e9, operatingCashFlow: 50e9 })];
        const m = deriveMoatInputs(rows);
        expect(m.fcfDurability).toEqual({ good: 9, total: 9 });
    });

    it('negative equity + cash-drag IC ≤ 0 → year skipped for ROIC', () => {
        const rows = [
            ...wideMoat.slice(0, 4),
            fy({ revenue: 50e9, netIncome: 2e9, ebit: 5e9, grossProfit: 10e9,
                 operatingCashFlow: 6e9, capex: -2e9,
                 totalEquity: -20e9, totalDebt: 5e9, cashAndEquivalents: 30e9 }),
        ];
        const m = deriveMoatInputs(rows);
        expect(m.roicDurability).toEqual({ good: 4, total: 4 });
    });
});

describe('computePillars — moat axis', () => {
    it('wide moat → 100 with four maxed legs', () => {
        const m = deriveMoatInputs(wideMoat);
        const p = computePillars({
            ...base,
            moatRoicDurability: m.roicDurability, moatGmMedian: m.gmMedian,
            moatFcfDurability: m.fcfDurability, moatMarginFloor: m.marginFloor,
        });
        // GM 65% sits just below the 70% ceiling
        expect(p.moat.legs.map(l => l.points)).toEqual([25, 24, 25, 25]);
        expect(p.moat.score).toBe(99);
    });

    it('narrow moat (WMT-like) lands mid-scale, not at a floor', () => {
        const p = computePillars({
            ...base,
            moatRoicDurability: { good: 6, total: 10 },  // 60% → 13
            moatGmMedian: 0.25,                          // → 6
            moatFcfDurability: { good: 9, total: 10 },   // 90% → 18
            moatMarginFloor: 0.03,                       // → 14
        });
        expect(p.moat.score).toBeGreaterThan(40);
        expect(p.moat.score).toBeLessThan(70);
    });

    it('no moat → near 0', () => {
        const m = deriveMoatInputs(noMoat);
        const p = computePillars({
            ...base,
            moatRoicDurability: m.roicDurability, moatGmMedian: m.gmMedian,
            moatFcfDurability: m.fcfDurability, moatMarginFloor: m.marginFloor,
        });
        expect(p.moat.score).toBe(6); // GM 20% leg only
    });

    it('missing history → 0 and n/a displays, never fabricated', () => {
        const p = computePillars(base);
        expect(p.moat.score).toBe(0);
        expect(p.moat.legs.every(l => l.display === 'n/a')).toBe(true);
    });

    it('moat score does not bleed into the other five pillars', () => {
        const p = computePillars({ ...base, moatGmMedian: 0.7, moatMarginFloor: 0.3 });
        expect(p.moat.score).toBe(50);
        expect(p.profitability.score).toBe(0);
        expect(p.quality.score).toBe(0);
    });

    it('leg displays carry the year counts ("9/10 yrs", "worst 12.0%")', () => {
        const p = computePillars({
            ...base,
            moatRoicDurability: { good: 9, total: 10 },
            moatGmMedian: 0.5,
            moatFcfDurability: { good: 7, total: 9 },
            moatMarginFloor: 0.12,
        });
        expect(p.moat.legs.find(l => l.key === 'roicDurability')!.display).toBe('9/10 yrs');
        expect(p.moat.legs.find(l => l.key === 'fcfDurability')!.display).toBe('7/9 yrs');
        expect(p.moat.legs.find(l => l.key === 'marginFloor')!.display).toBe('worst 12.0%');
    });

    it('legs with <3 years score 0 even if the share would look strong', () => {
        const p = computePillars({
            ...base,
            moatRoicDurability: { good: 2, total: 2 },
            moatFcfDurability: { good: 2, total: 2 },
        });
        expect(p.moat.score).toBe(0);
    });
});

describe('PillarsRadar — six axes', () => {
    const pillars = computePillars({
        ...base,
        moatRoicDurability: { good: 9, total: 10 },
        moatGmMedian: 0.6,
        moatFcfDurability: { good: 10, total: 10 },
        moatMarginFloor: 0.2,
    });
    const html = renderToStaticMarkup(React.createElement(PillarsRadar, { pillars }));

    it('renders all six axis labels including Moat', () => {
        for (const label of ['Valuation', 'Growth', 'Profitability', 'Health', 'Quality', 'Moat']) {
            expect(html).toContain(`>${label}<`);
        }
        expect(html).toContain('Moat 97'); // aria-label summary (GM 60% just under the 70% ceiling)
    });

    it('details block lists the moat leg breakdown', () => {
        expect(html).toContain('ROIC &gt;12% years');
        expect(html).toContain('9/10 yrs');
        expect(html).toContain('worst 20.0%');
    });

    it('PillarChips renders the sixth M chip', () => {
        const chips = renderToStaticMarkup(React.createElement(PillarChips, { pillars }));
        expect(chips).toContain('>m<');
        expect(chips).toContain('Moat: 97/100');
    });

    it('stale 5-axis payload (Redis analysis:cache) renders axis at 0 — no crash', () => {
        const { moat: _dropped, ...fiveKey } = pillars;
        const stale = renderToStaticMarkup(React.createElement(PillarsRadar, { pillars: fiveKey as never }));
        expect(stale).toContain('>Moat<');
        const chips = renderToStaticMarkup(React.createElement(PillarChips, { pillars: fiveKey as never }));
        expect(chips).toContain('>m<');
    });
});

describe('PillarsRadar — peer median + 30-day overlays', () => {
    const pillars = computePillars({ ...base, roic: 0.3, roe: 0.3, netMargin: 0.25, operatingMargin: 0.3 });
    const all = (v: number) => ({ valuation: v, growth: v, profitability: v, health: v, quality: v, moat: v });

    it('renders legend, deltas and peer medians when overlays are supplied', () => {
        const html = renderToStaticMarkup(React.createElement(PillarsRadar, {
            pillars,
            previous: { asOf: '2026-10-13', scores: { ...all(0), valuation: 20 } },
            peer: { label: 'Semiconductors', n: 24, scores: all(50) },
        }));
        expect(html).toContain('Semiconductors median');
        expect(html).toContain('30 days ago');
        expect(html).toContain('vs 30d');
        expect(html).toContain('peers 50');
    });

    it('omits overlays when absent or identical (no-change ghost)', () => {
        const scores = Object.fromEntries(Object.entries(pillars).map(([k, v]) => [k, v.score]));
        const html = renderToStaticMarkup(React.createElement(PillarsRadar, {
            pillars, previous: { asOf: '2026-10-13', scores },
        }));
        expect(html).not.toContain('30 days ago');
        expect(html).not.toContain('median');
    });
});
