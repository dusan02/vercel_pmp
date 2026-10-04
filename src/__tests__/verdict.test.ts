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

describe('buildVerdict', () => {
    it('returns null when there is no data at all', () => {
        expect(buildVerdict({})).toBeNull();
    });

    it('headline: exceptional fundamentals + expensive valuation', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 90, profitability: 85, health: 80, quality: 78, valuation: 15 }),
            pePercentile: 92, peCurrent: 38, peYears: 10,
        });
        expect(v?.headline).toBe('Exceptional fundamentals, expensive vs its own history.');
        expect(v?.lines.some(l => l.tone === 'pos' && l.text.includes('Growth'))).toBe(true);
        expect(v?.lines.some(l => l.tone === 'neg' && l.text.includes('Valuation'))).toBe(true);
        expect(v?.lines.some(l => l.tone === 'warn' && l.text.includes('P/E 38.0'))).toBe(true);
    });

    it('headline: cheap percentile produces cheap clause', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 20, profitability: 30, health: 45, quality: 50, valuation: 80 }),
            pePercentile: 12,
        });
        expect(v?.headline).toContain('cheap vs its own history');
        expect(v?.headline).toContain('Weak fundamentals');
    });

    it('falls back to valuation pillar score when percentile is missing', () => {
        const v = buildVerdict({
            pillars: pillars({ growth: 50, profitability: 50, health: 50, quality: 50, valuation: 25 }),
            pePercentile: null,
        });
        expect(v?.headline).toBe('Mixed fundamentals, expensive.');
    });

    it('mixed fundamentals wording when neither strong nor weak dominates', () => {
        const v = buildVerdict({ pillars: pillars({ growth: 78, health: 55, valuation: 55 }) });
        expect(v?.headline).toMatch(/^Mixed fundamentals/);
    });

    it('adds mover context line for notable moves with a reason', () => {
        const v = buildVerdict({
            pillars: pillars({ valuation: 50 }),
            changePct: 6.2, moversReason: 'Analyst upgrade to Buy',
        });
        expect(v?.lines.some(l => l.tone === 'info' && l.text.includes('+6.2%') && l.text.includes('Analyst upgrade'))).toBe(true);
    });

    it('flags flow-driven move when no catalyst and move >= 5%', () => {
        const v = buildVerdict({ changePct: -7.4 });
        expect(v).not.toBeNull();
        expect(v?.lines[0]?.text).toContain('-7.4%');
        expect(v?.lines[0]?.text).toContain('flow-driven');
    });

    it('ignores small moves without a reason', () => {
        const v = buildVerdict({ changePct: 1.2 });
        expect(v).toBeNull();
    });
});
