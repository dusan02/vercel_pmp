import { buildVerdict, type VerdictTone } from '@/lib/analysis/verdict';
import type { PillarScores } from '@/services/analysis/pillars';
import type { AnalysisData } from '../types';
import { computeThesisPoints } from './ThesisCard';

interface PmpVerdictProps {
    pillars?: PillarScores | null;
    insufficientData?: boolean | null;
    pePercentile?: number | null;
    peCurrent?: number | null;
    peMedian?: number | null;
    peYears?: number | null;
    psPercentile?: number | null;
    forwardPe?: number | null;
    revenueGrowthYoY?: number | null;
    revenueCagr?: number | null;
    changePct?: number | null;
    moversReason?: string | null;
    moversCategory?: string | null;
    moversZScore?: number | null;
    moversRvol?: number | null;
    /** Optional thesis inputs to render Bull Case & Risk Flags in the same unified card */
    analysisData?: AnalysisData | null;
    cache?: {
        piotroskiScore: number | null;
        altmanZ: number | null;
        beneishScore: number | null;
        revenueCagr: number | null;
        negativeNiYears: number | null;
    } | null;
    roe?: number | null;
}

const TONE_DOT: Record<VerdictTone, string> = {
    pos: 'bg-emerald-500',
    warn: 'bg-amber-500',
    neg: 'bg-red-500',
    neutral: 'bg-gray-400',
};

const TONE_TEXT: Record<VerdictTone, string> = {
    pos: 'text-emerald-700 dark:text-emerald-300',
    warn: 'text-amber-700 dark:text-amber-300',
    neg: 'text-red-700 dark:text-red-300',
    neutral: 'text-gray-700 dark:text-gray-300',
};

/**
 * Unified "PMP Verdict & Investment Thesis" card — headline + pillar score tiles +
 * bottom-line takeaway + Bull Case & Risk Flags in one dense, zero-dead-space card.
 */
export function PmpVerdict(props: PmpVerdictProps) {
    const verdict = buildVerdict(props);
    if (!verdict) return null;

    const mc = verdict.marketContext;
    const { strengths: bullPoints, risks: riskPoints } = computeThesisPoints({
        analysisData: props.analysisData ?? null,
        cache: props.cache ?? null,
        roe: props.roe ?? null,
    });

    const allPillarHighlights = [
        ...verdict.strengths.map((s) => ({ ...s, kind: 'strength' as const })),
        ...verdict.risks.map((r) => ({ ...r, kind: 'risk' as const })),
    ];

    return (
        <section
            aria-label="PMP verdict and investment thesis"
            className="h-full flex flex-col justify-between rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
        >
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-0.5">
                        PMP Verdict &amp; Thesis
                    </h2>
                    <p className={`flex items-center gap-1.5 text-sm sm:text-base font-bold leading-snug ${TONE_TEXT[verdict.tone]}`}>
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${TONE_DOT[verdict.tone]}`} aria-hidden="true" />
                        {verdict.headline}
                    </p>
                </div>

                {verdict.bottomLine && (
                    <p className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-100 border-l-2 border-emerald-500/70 dark:border-emerald-400/70 pl-2.5 leading-snug">
                        {verdict.bottomLine}
                    </p>
                )}

                {/* Full-width 2-col grid of top pillar highlights — never leaves a blank right column */}
                {allPillarHighlights.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                        {allPillarHighlights.map((it, i) => (
                            <div
                                key={i}
                                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                                    it.kind === 'strength'
                                        ? 'border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20'
                                        : 'border-amber-200/70 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20'
                                }`}
                            >
                                <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{it.label}</span>
                                {it.score != null && (
                                    <span
                                        className={`tabular-nums font-bold ${
                                            it.kind === 'strength'
                                                ? 'text-emerald-700 dark:text-emerald-400'
                                                : 'text-amber-700 dark:text-amber-400'
                                        }`}
                                    >
                                        {it.score}/100
                                    </span>
                                )}
                                {it.note && <span className="text-[11px] text-gray-500">{it.note}</span>}
                            </div>
                        ))}
                    </div>
                )}

                {verdict.evidence.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {verdict.evidence.map((e, i) => (
                            <span
                                key={i}
                                className="text-[11px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md px-2 py-0.5"
                            >
                                {e}
                            </span>
                        ))}
                    </div>
                )}

                {/* Integrated Bull Case & Risk Flags */}
                {(bullPoints.length > 0 || riskPoints.length > 0) && (
                    <div className="pt-2.5 border-t border-gray-100 dark:border-gray-800 space-y-2.5">
                        {bullPoints.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">
                                    Bull Case
                                </p>
                                <ul className="space-y-1">
                                    {bullPoints.slice(0, 4).map((s) => (
                                        <li key={s} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300 leading-snug">
                                            <span className="mt-0.5 shrink-0 font-bold text-emerald-500">✓</span>
                                            <span>{s}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {riskPoints.length > 0 ? (
                            <div className={bullPoints.length > 0 ? 'pt-2 border-t border-dashed border-gray-100 dark:border-gray-800' : ''}>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">
                                    Risk Flags
                                </p>
                                <ul className="space-y-1">
                                    {riskPoints.slice(0, 3).map((r) => (
                                        <li key={r} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300 leading-snug">
                                            <span className="mt-0.5 shrink-0 font-bold text-amber-500">⚠</span>
                                            <span>{r}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="pt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                <span>✓</span>
                                <span>No financial distress or accounting warning flags detected</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {mc && (
                <div className="mt-3 pt-2.5 border-t border-dashed border-gray-200 dark:border-gray-800">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5">
                        Market context
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-2">
                        <span className={`font-semibold tabular-nums ${mc.changePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {mc.changePct >= 0 ? '+' : ''}{mc.changePct.toFixed(1)}% today
                        </span>
                        {mc.zScore != null && <span>· Z {Math.abs(mc.zScore).toFixed(1)}σ</span>}
                        {mc.rvol != null && mc.rvol >= 1.5 && <span>· RVOL {mc.rvol.toFixed(1)}×</span>}
                        {mc.reason && <span className="text-gray-500 dark:text-gray-400">· {mc.reason}</span>}
                    </p>
                </div>
            )}
        </section>
    );
}

