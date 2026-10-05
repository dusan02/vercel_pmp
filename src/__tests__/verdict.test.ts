import { buildVerdict } from '@/lib/analysis/verdict';
import type { PillarScores, Pillar } from '@/services/analysis/pillars';

function pillar(key: string, label: string, score: number): Pillar {
    return { key: key as Pillar['key'], label, score, legs: [] };
}

function pillars(scores: Record<string, number>): PillarScores {
    const mk = (k: string) => pillar(k, {
        valuation: 'Valuation', growth: 'Growth', profitability: 'Profitability',
        health: 'Financial Health', quality: 'Quality',
    }[k] ?? k, scores[k] ?? 50);
    return {
        valuation: mk('valuation'), growth: mk('growth'),
        profitability: mk('profitability'), health: mk('health'), quality: mk('quality'),
    };
}

describe('buildVerdict (V2)', () => {
    it('returns null when there is no data at all', () => {
        expect(buildVerdict({})).toBeNull();
    });

    it('NVDA-style: high quality + expensive', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 56, profitability: 100, health: 71, quality: 90, valuation: 15 }),
            pePercentile: 94, peCurrent: 55, peMedian: 35, peYears: 5,
            revenueGrowthYoY: 62,
        });
        expect(v?.tone).toBe('warn');
        expect(v?.headline).toBe('High quality, but expensive');
        expect(v?.bottomLine).toBe('Excellent business. Weak entry price.');
        expect(v?.strengths[0]?.label).toBe('Profitability');
        expect(v?.risks[0]?.label).toBe('Valuation');
        expect(v?.evidence.some(e => e.includes('Revenue +62.0%'))).toBe(true);
        expect(v?.evidence.some(e => e.includes('P/E 55× · 94th pctl'))).toBe(true);
    });

    it('quality + cheap → attractive', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 78, profitability: 85, health: 80, quality: 82, valuation: 85 }),
            pePercentile: 12, peCurrent: 14, peMedian: 22, peYears: 8,
        });
        expect(v?.tone).toBe('pos');
        expect(v?.headline).toBe('Strong business, attractive price');
        expect(v?.bottomLine).toBe('High-quality business at an attractive price.');
    });

    it('weak + cheap → cheap for a reason', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 20, profitability: 30, health: 40, quality: 35, valuation: 80 }),
            pePercentile: 10, peCurrent: 8, peMedian: 18, peYears: 10,
        });
        expect(v?.headline).toBe('Cheap for a reason — weak fundamentals');
        expect(v?.bottomLine).toBe('Cheap for a reason — fundamentals remain weak.');
        expect(v?.risks.map(r => r.label)).toContain('Growth');
    });

    it('weak + expensive → weakest combination', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 20, profitability: 25, health: 35, quality: 30, valuation: 10 }),
            pePercentile: 90, peCurrent: 60, peMedian: 25, peYears: 10,
        });
        expect(v?.tone).toBe('neg');
        expect(v?.headline).toBe('Weak fundamentals, expensive');
        expect(v?.bottomLine).toBe('Weak fundamentals at a demanding price.');
    });

    it('STM: distorted P/E never leaks a fake percentile into evidence', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 30, profitability: 40, health: 60, quality: 55, valuation: 45 }),
            pePercentile: 99, peCurrent: 308, peMedian: 15, peYears: 5,
            psPercentile: 82,
            forwardPe: 22.6,
        });
        // EPS depression noted; P/S percentile used instead of P/E 308
        expect(v?.evidence).toContain('EPS temporarily depressed');
        expect(v?.evidence).toContain('P/S 82nd percentile');
        expect(v?.evidence.join(' ')).not.toContain('308');
        // Valuation reads from P/S (82nd pctl = expensive), not the inflated P/E
        expect(v?.headline).toContain('expensive');
    });

    it('distorted P/E without P/S stats falls back to forward P/E', () => {
        const v = buildVerdict({
            pePercentile: 99, peCurrent: 308, peMedian: 15,
            forwardPe: 22.6,
            revenueGrowthYoY: 12,
        });
        expect(v?.evidence).toContain('EPS temporarily depressed');
        expect(v?.evidence).toContain('Forward P/E 23×');
    });

    it('works with no mover event — marketContext is null', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 70, profitability: 80, health: 75, quality: 72 }),
            pePercentile: 50, peCurrent: 20, peMedian: 19,
            changePct: 0.4,
        });
        expect(v?.marketContext).toBeNull();
        expect(v?.headline).toBe('High quality, fairly valued');
    });

    it('no usable P/E → no fake percentile evidence', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 70, profitability: 80, health: 75, quality: 72 }),
            changePct: 1,
        });
        expect(v?.evidence.join(' ')).not.toMatch(/P\/E|pctl|percentile/);
    });

    it('market context carries z-score and reason separately from fundamentals', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 80, profitability: 85, health: 80, quality: 85 }),
            changePct: 8.4,
            moversZScore: 4.2,
            moversReason: 'Acquisition announcement',
        });
        expect(v?.marketContext?.zScore).toBe(4.2);
        expect(v?.marketContext?.reason).toBe('Acquisition announcement');
        // And the headline stays a fundamentals statement, not hype
        expect(v?.headline).not.toContain('8.4');
    });

    it('strengths/risks stay capped at 2 each', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 90, profitability: 88, health: 85, quality: 82, valuation: 20 }),
            pePercentile: 95, peCurrent: 70, peMedian: 30,
        });
        expect(v?.strengths.length).toBeLessThanOrEqual(2);
        expect(v?.risks.length).toBeLessThanOrEqual(2);
    });
});
