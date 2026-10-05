import { buildVerdict, type VerdictTone } from '@/lib/analysis/verdict';
import type { PillarScores } from '@/services/analysis/pillars';

interface PmpVerdictProps {
    pillars?: PillarScores | null;
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

function MiniList({ title, items }: { title: string; items: { label: string; score?: number | null; note?: string }[] }) {
    if (!items.length) return null;
    return (
        <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">{title}</p>
            <ul className="space-y-0.5">
                {items.map((it, i) => (
                    <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-baseline justify-between gap-3">
                        <span>{it.label}</span>
                        {it.score != null && <span className="tabular-nums font-semibold">{it.score}</span>}
                        {it.note && <span className="text-xs text-gray-500">{it.note}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * "PMP Verdict" — the 3-second decision layer: headline + ≤2 strengths + ≤2
 * risks + evidence chips + one bottom-line sentence. Market context (today's
 * move/catalyst) is rendered separately below a divider — a mover is context,
 * not a fundamental quality signal. Fully deterministic: same data → same
 * verdict (see src/lib/analysis/verdict.ts).
 */
export function PmpVerdict(props: PmpVerdictProps) {
    const verdict = buildVerdict(props);
    if (!verdict) return null;

    const mc = verdict.marketContext;

    return (
        <section aria-label="PMP verdict" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-1">
                    PMP Verdict
                </h2>
                <p className={`flex items-center gap-2 text-base font-semibold leading-snug ${TONE_TEXT[verdict.tone]}`}>
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${TONE_DOT[verdict.tone]}`} aria-hidden="true" />
                    {verdict.headline}
                </p>
            </div>

            {(verdict.strengths.length > 0 || verdict.risks.length > 0) && (
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
                    <MiniList title="Strengths" items={verdict.strengths} />
                    <MiniList title="Risks" items={verdict.risks} />
                </div>
            )}

            {verdict.evidence.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {verdict.evidence.map((e, i) => (
                        <span key={i} className="text-[11px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full px-2.5 py-1">
                            {e}
                        </span>
                    ))}
                </div>
            )}

            {verdict.bottomLine && (
                <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white border-l-2 border-gray-300 dark:border-gray-600 pl-3">
                    {verdict.bottomLine}
                </p>
            )}

            {mc && (
                <div className="mt-3 pt-2.5 border-t border-dashed border-gray-200 dark:border-gray-700">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
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
