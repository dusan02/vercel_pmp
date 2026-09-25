import type { AnalysisData } from '../types';

/**
 * Thesis on one screen — scannable bull/bear evidence summary under the hero.
 * Every chip is a threshold rule over data the page already renders deeper
 * down; this card just surfaces the verdict-relevant subset first.
 *
 * Server component — no interactivity, renders in SSR HTML for crawlers.
 */
interface ThesisCardProps {
    analysisData: AnalysisData | null;
    cache: {
        piotroskiScore: number | null;
        altmanZ: number | null;
        beneishScore: number | null;
        revenueCagr: number | null;
        negativeNiYears: number | null;
    } | null;
    roe: number | null;
}

const fmt = (v: number, d = 1) => v.toFixed(d);

export function ThesisCard({ analysisData, cache, roe }: ThesisCardProps) {
    const m = analysisData?.metrics ?? null;
    const peStat = analysisData?.valuationHistoryStats?.pe ?? null;
    // SBC as % of TTM revenue — BalanceSheetSummary only carries SBC/NI
    const ttm = analysisData?.ttm ?? null;
    const sbcRev = (ttm?.sbc != null && ttm?.revenue != null && ttm.revenue > 0)
        ? (ttm.sbc / ttm.revenue) * 100
        : null;
    const fcfMargin = m?.fcfMargin ?? null;
    const interestCoverage = m?.interestCoverage ?? null;
    const piotroski = cache?.piotroskiScore ?? null;
    const altmanZ = cache?.altmanZ ?? null;
    const beneish = cache?.beneishScore ?? null;
    const revCagr = cache?.revenueCagr ?? null;
    const lossYears = cache?.negativeNiYears ?? null;
    const pePct = peStat?.percentile ?? null;
    const peYears = peStat?.years ?? null;

    const strengths: string[] = [];
    const risks: string[] = [];

    // ── Strengths ──
    if (fcfMargin != null && fcfMargin >= 20) {
        strengths.push(`FCF margin ${fmt(fcfMargin)}% — strong cash conversion`);
    }
    if (piotroski != null && piotroski >= 7) {
        strengths.push(`Piotroski F-Score ${Math.round(piotroski)}/9 — high earnings quality`);
    }
    if (altmanZ != null && altmanZ >= 3) {
        strengths.push(`Altman Z ${fmt(altmanZ)} — safe-zone balance sheet`);
    }
    if (roe != null && roe >= 15) {
        strengths.push(`ROE ${fmt(roe)}% — efficient capital deployment`);
    }
    if (revCagr != null && revCagr >= 10) {
        strengths.push(`Revenue CAGR ${fmt(revCagr)}% — durable top-line growth`);
    }
    if (interestCoverage != null && interestCoverage >= 8) {
        strengths.push(`Interest coverage ${fmt(interestCoverage)}× — debt well covered`);
    }
    if (pePct != null && pePct <= 25 && peStat?.current != null) {
        strengths.push(`P/E ${fmt(peStat.current)}× at bottom ${Math.round(pePct)}% of ${peYears ? Math.round(peYears) : 'multi'}-year history`);
    }

    // ── Risks ──
    if (altmanZ != null && altmanZ < 1.8) {
        risks.push(`Altman Z ${fmt(altmanZ)} — distress-zone balance sheet`);
    }
    if (beneish != null && beneish > -1.78) {
        risks.push(`Beneish M ${fmt(beneish, 2)} — earnings-manipulation flag`);
    }
    if (fcfMargin != null && fcfMargin < 0) {
        risks.push(`Negative FCF margin (${fmt(fcfMargin)}%) — burning cash`);
    }
    if (sbcRev != null && sbcRev >= 5) {
        risks.push(`SBC ${fmt(sbcRev)}% of revenue — real dilution cost`);
    }
    if (lossYears != null && lossYears >= 2) {
        risks.push(`${Math.round(lossYears)} loss-making years in recent history`);
    }
    if (interestCoverage != null && interestCoverage < 3) {
        risks.push(`Interest coverage ${fmt(interestCoverage)}× — thin debt cushion`);
    }
    if (revCagr != null && revCagr < 0) {
        risks.push(`Revenue shrinking ${fmt(Math.abs(revCagr))}%/yr`);
    }
    if (pePct != null && pePct >= 80 && peStat?.current != null) {
        risks.push(`P/E ${fmt(peStat.current)}× at top ${Math.round(100 - pePct)}% of ${peYears ? Math.round(peYears) : 'multi'}-year history`);
    }

    if (strengths.length === 0 && risks.length === 0) return null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {strengths.length > 0 && (
                <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Strengths</p>
                    <ul className="space-y-1.5">
                        {strengths.slice(0, 5).map((s) => (
                            <li key={s} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300 leading-snug">
                                <span className="mt-0.5 shrink-0 text-emerald-500 font-bold">✓</span>
                                <span>{s}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {risks.length > 0 && (
                <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Risks</p>
                    <ul className="space-y-1.5">
                        {risks.slice(0, 5).map((r) => (
                            <li key={r} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300 leading-snug">
                                <span className="mt-0.5 shrink-0 text-amber-500 font-bold">⚠</span>
                                <span>{r}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
