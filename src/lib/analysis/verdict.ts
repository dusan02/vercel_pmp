import type { PillarScores, PillarKey } from '@/services/analysis/pillars';
import { isPeDistorted } from '@/lib/analysis/peDistortion';

/**
 * PMP Verdict 2.0 — deterministic decision layer over data the page already
 * has (pillars, valuation percentiles, revenue growth, mover context).
 * Same input → same output, zero LLM tokens. The component consumes this
 * model, so the verdict can be reused on screener/movers/social surfaces.
 *
 * Structure:
 *   headline      — one-line fundamental × valuation state
 *   strengths     — ≤2 strongest pillars
 *   risks         — ≤2 weakest pillars (valuation counts as a risk)
 *   evidence      — ≤3 real data chips, no placeholders
 *   bottomLine    — one deterministic sentence
 *   marketContext — today's move/catalyst, visually separate: a mover is
 *                   context, not a fundamental quality signal
 */

export interface VerdictInput {
    pillars?: PillarScores | null;
    pePercentile?: number | null;   // 0–100 vs own history; low = cheap
    peCurrent?: number | null;
    peMedian?: number | null;
    peYears?: number | null;
    psPercentile?: number | null;   // fallback when P/E distorted/missing
    forwardPe?: number | null;
    revenueGrowthYoY?: number | null; // percent
    revenueCagr?: number | null;      // percent, 5Y
    changePct?: number | null;
    moversReason?: string | null;
    moversCategory?: string | null;
    moversZScore?: number | null;
    moversRvol?: number | null;
}

export type VerdictTone = 'pos' | 'warn' | 'neg' | 'neutral';

export interface VerdictItem {
    label: string;
    score?: number | null;
    note?: string;
}

export interface MarketContext {
    changePct: number;
    zScore?: number | null;
    rvol?: number | null;
    reason?: string | null;
}

export interface Verdict {
    tone: VerdictTone;
    headline: string;
    strengths: VerdictItem[];
    risks: VerdictItem[];
    evidence: string[];
    bottomLine: string | null;
    marketContext: MarketContext | null;
}

const FUND_KEYS: PillarKey[] = ['growth', 'profitability', 'health', 'quality'];

const STRONG = 75;
const WEAK = 40;
const STRONG_AVG = 68;
const WEAK_AVG = 45;

type FundLevel = 'strong' | 'mixed' | 'weak';
type ValLevel = 'cheap' | 'fair' | 'expensive' | 'unknown';

const HEADLINE: Record<FundLevel, Record<ValLevel, string>> = {
    strong: {
        cheap: 'Strong business, attractive price',
        fair: 'High quality, fairly valued',
        expensive: 'High quality, but expensive',
        unknown: 'High quality',
    },
    mixed: {
        cheap: 'Mixed fundamentals, cheap valuation',
        fair: 'Mixed fundamentals, fairly valued',
        expensive: 'Mixed fundamentals, expensive valuation',
        unknown: 'Mixed fundamentals',
    },
    weak: {
        cheap: 'Cheap for a reason — weak fundamentals',
        fair: 'Weak fundamentals',
        expensive: 'Weak fundamentals, expensive',
        unknown: 'Weak fundamentals',
    },
};

const BOTTOM_LINE: Record<FundLevel, Record<ValLevel, string>> = {
    strong: {
        cheap: 'High-quality business at an attractive price.',
        fair: 'Strong fundamentals at a reasonable valuation.',
        expensive: 'Excellent business. Weak entry price.',
        unknown: 'Strong fundamentals — valuation context unavailable.',
    },
    mixed: {
        cheap: 'Mixed business trading cheap — priced for skepticism.',
        fair: 'Mixed picture — no clear quality or value edge.',
        expensive: 'Mixed fundamentals at a demanding price.',
        unknown: 'Mixed fundamentals — valuation unclear.',
    },
    weak: {
        cheap: 'Cheap for a reason — fundamentals remain weak.',
        fair: 'Weak fundamentals — valuation is the only support.',
        expensive: 'Weak fundamentals at a demanding price.',
        unknown: 'Weak fundamentals — valuation context unavailable.',
    },
};

const TONE: Record<FundLevel, Record<ValLevel, VerdictTone>> = {
    strong: { cheap: 'pos', fair: 'pos', expensive: 'warn', unknown: 'pos' },
    mixed: { cheap: 'warn', fair: 'neutral', expensive: 'warn', unknown: 'neutral' },
    weak: { cheap: 'warn', fair: 'neg', expensive: 'neg', unknown: 'neg' },
};

function fundLevel(pillars: PillarScores | null): FundLevel | null {
    if (!pillars) return null;
    const scores = FUND_KEYS.map((k) => pillars[k]?.score).filter((s): s is number => s != null);
    if (!scores.length) return null;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg >= STRONG_AVG) return 'strong';
    if (avg <= WEAK_AVG) return 'weak';
    return 'mixed';
}

/** Valuation state from own-history percentile; falls back to pillar score. */
function valLevel(
    percentile: number | null,
    pillarScore: number | null | undefined,
): ValLevel {
    if (percentile != null) {
        if (percentile <= 25) return 'cheap';
        if (percentile >= 75) return 'expensive';
        return 'fair';
    }
    if (pillarScore != null) {
        if (pillarScore >= 70) return 'cheap';
        if (pillarScore <= 30) return 'expensive';
        return 'fair';
    }
    return 'unknown';
}

function fmtSigned(v: number, suffix = '%') {
    return `${v >= 0 ? '+' : ''}${v.toFixed(1)}${suffix}`;
}

function ordinal(n: number): string {
    const v = Math.round(n);
    const s = ['th', 'st', 'nd', 'rd'];
    const mod100 = v % 100;
    return `${v}${s[(mod100 - 20) % 10] || s[mod100] || s[0]}`;
}

export function buildVerdict(input: VerdictInput): Verdict | null {
    const p = input.pillars ?? null;
    const distorted = isPeDistorted(input.peCurrent, input.peMedian ?? null);

    // Valuation source: PE percentile unless distorted/missing → PS percentile
    // → valuation pillar score.
    const effectivePercentile =
        !distorted && input.pePercentile != null
            ? input.pePercentile
            : input.psPercentile ?? null;
    const valuation = valLevel(effectivePercentile, p?.valuation?.score ?? null);
    const fundamentals = fundLevel(p);

    // ── Strengths / Risks (max 2 each) ────────────────────────────────────
    const fundPillars = p
        ? FUND_KEYS.map((k) => p[k]).filter((x): x is NonNullable<typeof x> => x != null)
        : [];
    const strengths: VerdictItem[] = fundPillars
        .filter((pl) => pl.score >= 60)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((pl) => ({ label: pl.label, score: pl.score }));

    const risks: VerdictItem[] = [];
    if (valuation === 'expensive' && p?.valuation != null) {
        risks.push({ label: p.valuation.label, score: p.valuation.score });
    }
    for (const pl of [...fundPillars].sort((a, b) => a.score - b.score)) {
        if (risks.length >= 2) break;
        if (pl.score <= 50) risks.push({ label: pl.label, score: pl.score });
    }

    // ── Evidence (max 3, only real data) ─────────────────────────────────
    const evidence: string[] = [];
    const revYoY = input.revenueGrowthYoY ?? input.revenueCagr ?? null;
    if (revYoY != null && Math.abs(revYoY) >= 0.5) {
        evidence.push(`Revenue ${fmtSigned(revYoY)}${input.revenueGrowthYoY == null ? ' CAGR' : ' YoY'}`);
    }
    if (distorted) {
        // Never print the inflated multiple — say why instead
        evidence.push('EPS temporarily depressed');
        if (input.psPercentile != null) {
            evidence.push(`P/S ${ordinal(input.psPercentile)} percentile`);
        } else if (input.forwardPe != null) {
            evidence.push(`Forward P/E ${input.forwardPe.toFixed(0)}×`);
        }
    } else if (input.pePercentile != null && input.peCurrent != null) {
        evidence.push(`P/E ${input.peCurrent.toFixed(0)}× · ${ordinal(input.pePercentile)} pctl`);
    } else if (input.psPercentile != null) {
        evidence.push(`P/S ${ordinal(input.psPercentile)} percentile`);
    } else if (input.forwardPe != null) {
        evidence.push(`Forward P/E ${input.forwardPe.toFixed(0)}×`);
    }

    // ── Market context — separate from fundamentals ───────────────────────
    const pctChange = input.changePct ?? null;
    const z = input.moversZScore ?? null;
    const hasContext =
        (pctChange != null && Math.abs(pctChange) >= 2) ||
        (z != null && Math.abs(z) >= 2) ||
        !!input.moversReason;
    const marketContext: MarketContext | null = hasContext
        ? { changePct: pctChange ?? 0, zScore: z, rvol: input.moversRvol ?? null, reason: input.moversReason ?? null }
        : null;

    // ── Headline + bottom line ────────────────────────────────────────────
    if (fundamentals == null) {
        // No pillars — market context alone isn't a verdict
        if (!marketContext && evidence.length === 0) return null;
        const h = valuation !== 'unknown'
            ? { cheap: 'Cheap vs its own history', fair: 'Fairly valued vs history', expensive: 'Expensive vs its own history' }[valuation]
            : null;
        return {
            tone: valuation === 'cheap' ? 'pos' : valuation === 'expensive' ? 'warn' : 'neutral',
            headline: h ?? 'Insufficient data for a fundamental verdict',
            strengths,
            risks,
            evidence: evidence.slice(0, 3),
            bottomLine: null,
            marketContext,
        };
    }

    return {
        tone: TONE[fundamentals][valuation],
        headline: HEADLINE[fundamentals][valuation],
        strengths,
        risks,
        evidence: evidence.slice(0, 3),
        bottomLine: BOTTOM_LINE[fundamentals][valuation],
        marketContext,
    };
}
