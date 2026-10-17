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
    /** No financial statements at all — distinguish "unavailable" from "weak". */
    insufficientData?: boolean | null;
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

export type FundLevel = 'strong' | 'mixed' | 'weak';
export type ValLevel = 'cheap' | 'fair' | 'expensive' | 'unknown';

/**
 * Normalized verdict identity persisted on AnalysisCache (drives the screener
 * fund/val/verdict enum filters). `none_<val>` = pillars exist but all four
 * fundamental scores are null — the page falls back to a valuation-only
 * headline; those tickers ARE filterable by valLevel.
 */
export type VerdictKey =
    | 'insufficient'
    | `none_${'cheap' | 'fair' | 'expensive'}`
    | `${FundLevel}_${ValLevel}`;

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

const NONE_VALUATION_HEADLINE: Record<'cheap' | 'fair' | 'expensive', string> = {
    cheap: 'Cheap vs its own history',
    fair: 'Fairly valued vs history',
    expensive: 'Expensive vs its own history',
};

/**
 * Every persisted verdictKey → the exact headline the verdict card renders.
 * Single source for the screener's Verdict select + result labels, so a
 * filter row always names the same text the page shows.
 */
export const VERDICT_LABELS: Record<VerdictKey, string> = {
    strong_cheap: HEADLINE.strong.cheap,
    strong_fair: HEADLINE.strong.fair,
    strong_expensive: HEADLINE.strong.expensive,
    strong_unknown: HEADLINE.strong.unknown,
    mixed_cheap: HEADLINE.mixed.cheap,
    mixed_fair: HEADLINE.mixed.fair,
    mixed_expensive: HEADLINE.mixed.expensive,
    mixed_unknown: HEADLINE.mixed.unknown,
    weak_cheap: HEADLINE.weak.cheap,
    weak_fair: HEADLINE.weak.fair,
    weak_expensive: HEADLINE.weak.expensive,
    weak_unknown: HEADLINE.weak.unknown,
    none_cheap: NONE_VALUATION_HEADLINE.cheap,
    none_fair: NONE_VALUATION_HEADLINE.fair,
    none_expensive: NONE_VALUATION_HEADLINE.expensive,
    insufficient: 'Insufficient financial data',
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

export interface VerdictClass {
    /** null = no usable pillar scores (valuation-only headline on the page). */
    fundLevel: FundLevel | null;
    valLevel: ValLevel;
    /** Persisted filter key — null when no verdict is renderable. */
    verdictKey: VerdictKey | null;
    /** Internal signals, exposed so evidence chips can explain the class. */
    distorted: boolean;
    cyclicalRecovery: boolean;
}

/**
 * Deterministic fundamental × valuation classification — the exact same grid
 * the headline table renders. Shared by buildVerdict (read path) and
 * scoreCalculator (write path persists it as fundLevel/valLevel/verdictKey so
 * the screener filters on the identical classification, not a re-derived proxy).
 */
export function classifyVerdict(input: VerdictInput): VerdictClass {
    const p = input.pillars ?? null;
    const distorted = isPeDistorted(input.peCurrent, input.peMedian ?? null);
    const effectivePercentile =
        !distorted && input.pePercentile != null
            ? input.pePercentile
            : input.psPercentile ?? null;
    const rawValuation = valLevel(effectivePercentile, p?.valuation?.score ?? null);
    const fundamentals = input.insufficientData ? null : fundLevel(p);

    const peDroveValuation = !distorted && input.pePercentile != null;
    const cyclicalRecovery =
        peDroveValuation &&
        input.forwardPe != null && input.forwardPe > 0 &&
        input.peCurrent != null && input.peCurrent > 0 &&
        input.peCurrent / input.forwardPe >= 2;
    const valuation: ValLevel = cyclicalRecovery && rawValuation === 'expensive' ? 'fair' : rawValuation;

    const verdictKey: VerdictKey | null = input.insufficientData
        ? 'insufficient'
        : fundamentals != null
            ? `${fundamentals}_${valuation}`
            : valuation !== 'unknown'
                ? `none_${valuation}`
                : null;
    return { fundLevel: fundamentals, valLevel: valuation, verdictKey, distorted, cyclicalRecovery };
}

export function buildVerdict(input: VerdictInput): Verdict | null {
    const p = input.pillars ?? null;
    const { fundLevel: fundamentals, valLevel: valuation, distorted, cyclicalRecovery } = classifyVerdict(input);

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
        if (cyclicalRecovery && input.forwardPe != null) {
            evidence.push(`Fwd P/E ${input.forwardPe.toFixed(1)}× — depressed TTM`);
        }
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

    // ── No fundamentals ≠ weak fundamentals ───────────────────────────────
    // ADR/foreign tickers with zero stored statements (TSM, NVO, BABA) used
    // to fall through pillar scoring as 0-scores → "Weak fundamentals".
    // That's a lie: we don't know the fundamentals, we don't have them.
    if (input.insufficientData) {
        return {
            tone: 'neutral',
            headline: 'Insufficient financial data',
            strengths: [],
            risks: [],
            evidence: [],
            bottomLine: 'No financial statements on file for this ticker — fundamental scores are not computed.',
            marketContext,
        };
    }

    // ── Headline + bottom line ────────────────────────────────────────────
    if (fundamentals == null) {
        // No pillars — market context alone isn't a verdict
        if (!marketContext && evidence.length === 0) return null;
        const h = valuation !== 'unknown' ? NONE_VALUATION_HEADLINE[valuation] : null;
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
