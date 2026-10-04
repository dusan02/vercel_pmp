import type { PillarScores, PillarKey } from '@/services/analysis/pillars';

/**
 * PMP Verdict — deterministic one-glance summary composed from data the page
 * already renders deeper down (pillars, valuation percentile, mover context).
 * Template-driven, zero LLM tokens — same philosophy as the daily report
 * "Market takeaway".
 */

export interface VerdictInput {
    pillars?: PillarScores | null;
    pePercentile?: number | null;   // 0–100 vs own history; low = cheap
    peCurrent?: number | null;
    peYears?: number | null;
    changePct?: number | null;
    moversReason?: string | null;
    moversCategory?: string | null;
}

export type VerdictTone = 'pos' | 'warn' | 'neg' | 'info';

export interface VerdictLine {
    tone: VerdictTone;
    text: string;
}

export interface Verdict {
    headline: string | null;
    lines: VerdictLine[];
}

// Growth/profitability/health/quality describe the business; valuation is the
// price paid for it — the verdict treats them as separate clauses.
const FUNDAMENTAL_KEYS: PillarKey[] = ['growth', 'profitability', 'health', 'quality'];

const STRONG = 75;
const WEAK = 40;

export function buildVerdict(input: VerdictInput): Verdict | null {
    const p = input.pillars ?? null;
    const lines: VerdictLine[] = [];

    const fundNames = (key: PillarKey) => p?.[key]?.label ?? key;

    const fundStrong = p
        ? FUNDAMENTAL_KEYS.filter((k) => (p[k]?.score ?? 0) >= STRONG)
        : [];
    const fundWeak = p
        ? FUNDAMENTAL_KEYS.filter((k) => (p[k]?.score ?? 100) <= WEAK)
        : [];

    // ── Headline ──────────────────────────────────────────────────────────
    let fundamentalsClause: string | null = null;
    if (p) {
        if (fundStrong.length >= 3) fundamentalsClause = 'Exceptional fundamentals';
        else if (fundStrong.length === 2) fundamentalsClause = 'Strong fundamentals';
        else if (fundWeak.length >= 2) fundamentalsClause = 'Weak fundamentals';
        else fundamentalsClause = 'Mixed fundamentals';
    }

    let valuationClause: string | null = null;
    const pct = input.pePercentile ?? null;
    if (pct != null) {
        if (pct <= 25) valuationClause = 'cheap vs its own history';
        else if (pct <= 40) valuationClause = 'below its historical range';
        else if (pct >= 80) valuationClause = 'expensive vs its own history';
        else if (pct >= 60) valuationClause = 'above its historical range';
        else valuationClause = 'fairly valued vs history';
    } else if (p?.valuation?.score != null) {
        const v = p.valuation.score;
        if (v >= 70) valuationClause = 'attractively valued';
        else if (v <= 30) valuationClause = 'expensive';
        else valuationClause = 'fairly valued';
    }

    const headline = [fundamentalsClause, valuationClause].filter(Boolean).join(', ');

    // ── Detail lines (max 3) ──────────────────────────────────────────────
    if (fundStrong.length > 0) {
        lines.push({
            tone: 'pos',
            text: `Strengths: ${fundStrong.slice(0, 4).map(fundNames).join(', ')}`,
        });
    }

    const weakNames = [...fundWeak.map(fundNames)];
    if (p && (p.valuation?.score ?? 100) <= WEAK) weakNames.push(p.valuation.label);
    if (weakNames.length > 0) {
        lines.push({
            tone: 'neg',
            text: `Weak spot${weakNames.length > 1 ? 's' : ''}: ${weakNames.join(', ')}`,
        });
    }

    if (pct != null && input.peCurrent != null && (pct <= 25 || pct >= 75)) {
        const side = pct <= 25 ? 'bottom' : 'top';
        const years = input.peYears ? `${Math.round(input.peYears)}-year` : 'multi-year';
        lines.push({
            tone: pct <= 25 ? 'pos' : 'warn',
            text: `P/E ${input.peCurrent.toFixed(1)}× at ${side} ${Math.round(Math.min(pct, 100 - pct))}% of ${years} history`,
        });
    }

    const pctChange = input.changePct ?? null;
    if (input.moversReason && pctChange != null && Math.abs(pctChange) >= 1) {
        lines.push({
            tone: 'info',
            text: `Moving ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}% — ${input.moversReason}`,
        });
    } else if (pctChange != null && Math.abs(pctChange) >= 5 && !input.moversReason) {
        lines.push({
            tone: 'info',
            text: `Moving ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}% today — no obvious catalyst (likely flow-driven)`,
        });
    }

    if (!headline && lines.length === 0) return null;
    return { headline: headline ? `${headline}.` : null, lines: lines.slice(0, 3) };
}
