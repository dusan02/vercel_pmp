import { buildVerdict, type VerdictTone } from '@/lib/analysis/verdict';
import type { PillarScores } from '@/services/analysis/pillars';

interface PmpVerdictProps {
    pillars?: PillarScores | null;
    pePercentile?: number | null;
    peCurrent?: number | null;
    peYears?: number | null;
    changePct?: number | null;
    moversReason?: string | null;
    moversCategory?: string | null;
}

const TONE_STYLES: Record<VerdictTone, string> = {
    pos: 'bg-emerald-500',
    warn: 'bg-amber-500',
    neg: 'bg-red-500',
    info: 'bg-sky-500',
};

/**
 * "PMP Verdict" — deterministic one-glance summary above the fold.
 * Compresses pillars + valuation percentile + mover context into a headline
 * and ≤3 evidence lines. No LLM — pure template over existing page data.
 */
export function PmpVerdict(props: PmpVerdictProps) {
    const verdict = buildVerdict(props);
    if (!verdict) return null;

    return (
        <section aria-label="PMP verdict" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                PMP Verdict
            </h2>
            {verdict.headline && (
                <p className="text-base font-semibold text-gray-900 dark:text-white leading-snug">
                    {verdict.headline}
                </p>
            )}
            {verdict.lines.length > 0 && (
                <ul className={`space-y-1 ${verdict.headline ? 'mt-2' : ''}`}>
                    {verdict.lines.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                            <span className={`mt-[7px] h-1.5 w-1.5 rounded-full shrink-0 ${TONE_STYLES[line.tone]}`} aria-hidden="true" />
                            <span>{line.text}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
