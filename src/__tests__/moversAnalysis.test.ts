/**
 * Movers 2.0 — deterministic classification tests.
 *
 * Covers the spec's test matrix:
 *  - sigma levels: normal / 2σ / 5σ / missing / extreme
 *  - attribution: stock-specific vs sector-driven vs market-driven
 *  - headline keyword taxonomy
 *  - catalyst ranking: proximity, direction mismatch, sector-vs-company
 *  - 'none' vs 'unavailable' stays distinct
 *  - interpretation templates never overclaim causality
 */
import {
    sigmaLevel, attributeMove, classifyHeadline, rankCatalysts,
    confidenceFor, buildInterpretation, catalystLabel,
    CatalystCandidate, CatalystResult,
} from '@/services/movers/classify';

describe('sigmaLevel', () => {
    it('classifies normal moves', () => {
        expect(sigmaLevel(0)).toBe('normal');
        expect(sigmaLevel(1.9)).toBe('normal');
        expect(sigmaLevel(-1.5)).toBe('normal');
    });
    it('classifies unusual (2σ) boundary', () => {
        expect(sigmaLevel(2.0)).toBe('unusual');
        expect(sigmaLevel(-2.7)).toBe('unusual');
    });
    it('classifies very unusual (3σ)', () => {
        expect(sigmaLevel(3.0)).toBe('very_unusual');
        expect(sigmaLevel(-4.9)).toBe('very_unusual');
    });
    it('classifies extreme (5σ)', () => {
        expect(sigmaLevel(5.0)).toBe('extreme');
        expect(sigmaLevel(-12)).toBe('extreme');
    });
    it('treats missing/invalid data as normal', () => {
        expect(sigmaLevel(null)).toBe('normal');
        expect(sigmaLevel(undefined)).toBe('normal');
        expect(sigmaLevel(NaN)).toBe('normal');
    });
});

describe('attributeMove', () => {
    it('stock riding a hot sector → sector attribution', () => {
        const r = attributeMove(5.2, 5.0, 1.5);
        expect(r.attribution).toBe('sector');
        expect(r.excessMovePct).toBeCloseTo(0.2);
    });
    it('stock tracking the market → market attribution', () => {
        const r = attributeMove(1.4, 1.3, 1.5);
        expect(r.attribution).toBe('market');
    });
    it('large move with flat sector/market → stock-specific', () => {
        const r = attributeMove(8.4, 1.7, 0.5);
        expect(r.attribution).toBe('stock');
        expect(r.excessMovePct).toBeCloseTo(6.7);
    });
    it('bigger stock move on top of a moving sector → mixed', () => {
        const r = attributeMove(9.0, 4.0, 0.8);
        expect(r.attribution).toBe('mixed');
        expect(r.excessMovePct).toBeCloseTo(5.0);
    });
    it('falls back to market comp when sector is missing', () => {
        const r = attributeMove(7.0, null, 0.4);
        expect(r.attribution).toBe('stock');
        expect(r.excessMovePct).toBeCloseTo(6.6);
    });
    it('no sector/market comp at all → unknown, not claimed stock-specific', () => {
        const r = attributeMove(7.0, null, null);
        expect(r.attribution).toBe('unknown');
        expect(r.excessMovePct).toBeNull();
    });
    it('handles null inputs without crashing', () => {
        expect(attributeMove(null, null, null).excessMovePct).toBeNull();
        expect(attributeMove(undefined, 1, 0.5).attribution).toBe('mixed');
    });
});

describe('classifyHeadline', () => {
    it('earnings beats/misses', () => {
        expect(classifyHeadline('Acme Q3 earnings beat estimates')).toBe('earnings_beat');
        expect(classifyHeadline('Acme profit falls short of expectations')).toBe('earnings_miss');
    });
    it('guidance direction', () => {
        expect(classifyHeadline('Acme raises full-year guidance')).toBe('guidance_raised');
        expect(classifyHeadline('Acme cuts revenue outlook')).toBe('guidance_lowered');
    });
    it('analyst actions', () => {
        expect(classifyHeadline('Goldman upgrades Acme to Buy')).toBe('analyst_upgrade');
        expect(classifyHeadline('Acme downgraded at Morgan Stanley')).toBe('analyst_downgrade');
        expect(classifyHeadline('Acme price target raised to $200 at Barclays')).toBe('analyst_upgrade');
    });
    it('company news taxonomy', () => {
        expect(classifyHeadline('Acme to acquire RivalCo for $2 billion')).toBe('acquisition');
        expect(classifyHeadline('Acme announces partnership with BigCo')).toBe('partnership');
        expect(classifyHeadline('SEC opens probe into Acme accounting')).toBe('legal');
        expect(classifyHeadline('Acme CEO steps down')).toBe('management');
        expect(classifyHeadline('Acme launches new AI chip platform')).toBe('product');
    });
    it('generic headlines fall to news_other', () => {
        expect(classifyHeadline('Five things to watch this week')).toBe('news_other');
        expect(classifyHeadline(null)).toBe('news_other');
    });
});

const ev = (type: any, headline = 'h'): CatalystCandidate['evidence'] => ({
    source: 'finnhub-news', headline, publishedAt: new Date().toISOString(), catalystType: type,
});

describe('rankCatalysts', () => {
    it('company earnings beats generic sector move', () => {
        const ranked = rankCatalysts([
            { type: 'sector_move', evidence: ev('sector_move'), ageSeconds: 0, companySpecific: false },
            { type: 'earnings_beat', evidence: ev('earnings_beat'), ageSeconds: 1800, companySpecific: true },
        ], 'up');
        expect(ranked[0]!.type).toBe('earnings_beat');
    });
    it('recent analyst upgrade outranks stale earnings', () => {
        const ranked = rankCatalysts([
            { type: 'earnings_release', evidence: ev('earnings_release'), ageSeconds: 2 * 86400, companySpecific: true },
            { type: 'analyst_upgrade', evidence: ev('analyst_upgrade'), ageSeconds: 600, companySpecific: true },
        ], 'up');
        expect(ranked[0]!.type).toBe('analyst_upgrade');
    });
    it('direction mismatch is penalized (stale upgrade on a down move)', () => {
        const up = rankCatalysts([
            { type: 'analyst_upgrade', evidence: ev('analyst_upgrade'), ageSeconds: 3600, companySpecific: true },
            { type: 'unusual_volume', evidence: ev('unusual_volume'), ageSeconds: 0, companySpecific: false },
        ], 'up');
        const down = rankCatalysts([
            { type: 'analyst_upgrade', evidence: ev('analyst_upgrade'), ageSeconds: 3600, companySpecific: true },
            { type: 'unusual_volume', evidence: ev('unusual_volume'), ageSeconds: 0, companySpecific: false },
        ], 'down');
        expect(up[0]!.type).toBe('analyst_upgrade');
        // mismatched direction drops the upgrade below the volume signal
        expect(down[0]!.type).toBe('unusual_volume');
    });
    it('confidence scales with score + company specificity', () => {
        expect(confidenceFor(120, true)).toBe('high');
        expect(confidenceFor(120, false)).toBe('medium');
        expect(confidenceFor(70, true)).toBe('medium');
        expect(confidenceFor(30, true)).toBe('low');
    });
});

describe('buildInterpretation', () => {
    const base: Omit<Parameters<typeof buildInterpretation>[0], 'catalyst'> = {
        changePct: 6.2, zScore: 4.7, rvol: 4.2,
        attribution: 'stock', excessMovePct: 5.5,
        sectorChangePct: 0.7, marketChangePct: 0.3,
    };
    const cat = (partial: Partial<CatalystResult>): CatalystResult => ({
        type: 'earnings_beat', status: 'found', confidence: 'high',
        label: 'Earnings beat', explanation: '', evidence: [], ...partial,
    });

    it('explained move names the catalyst, not causality', () => {
        const s = buildInterpretation({ ...base, catalyst: cat({}) });
        expect(s).toContain('Likely catalyst');
        expect(s).toContain('earnings beat');
        expect(s).not.toMatch(/because/i);
    });
    it('unexplained move says so plainly', () => {
        const s = buildInterpretation({ ...base, catalyst: cat({ type: 'none', status: 'none' }) });
        expect(s).toContain('no obvious company-specific catalyst');
    });
    it('unavailable is distinct from none', () => {
        const s = buildInterpretation({ ...base, catalyst: cat({ type: 'unavailable', status: 'unavailable' }) });
        expect(s).toContain('unavailable');
        expect(s).not.toContain('no obvious');
    });
    it('sector move explains via sector', () => {
        const s = buildInterpretation({
            ...base, attribution: 'sector',
            catalyst: cat({ type: 'sector_move', label: 'Sector-wide move', confidence: 'medium' }),
        });
        expect(s).toContain('Sector-driven');
    });
    it('weak catalyst is hedged', () => {
        const s = buildInterpretation({ ...base, catalyst: cat({ confidence: 'low', type: 'news_other' }) });
        expect(s).toContain('Weak signal');
    });
    it('labels exist for every type', () => {
        for (const t of ['none', 'unavailable', 'earnings_beat', 'sector_move'] as const) {
            expect(catalystLabel(t).length).toBeGreaterThan(3);
        }
    });
});
