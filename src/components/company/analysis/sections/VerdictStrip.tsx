interface VerdictStripProps {
  /** Composite verdict label from AnalysisCache (e.g. "Neutral") */
  verdictText: string | null;
  /** 0–100 financial health score (fallback when pillars absent) */
  healthScore: number | null;
  /** Five-pillar profile — when present, compact V/G/P/H/Q chips replace
      the standalone health chip so the full profile is in the first
      viewport even on mobile (radar sits below the price chart there). */
  pillars?: {
    valuation: { score: number };
    growth: { score: number };
    profitability: { score: number };
    health: { score: number };
    quality: { score: number };
  } | null;
  /** Early Winners snapshot (totalScore/maxPossible + rank) */
  ewScore: {
    totalScore: number | null;
    maxPossible: number | null;
    rank: number | null;
  } | null;
  /** Finnhub analyst price target for the upside chip */
  priceTarget: {
    targetMean: number | null;
    targetMedian: number | null;
    numberOfAnalysts: number | null;
  } | null;
  currentPrice: number | null;
}

function healthLabel(score: number): string {
  if (score >= 75) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 45) return 'moderate';
  if (score >= 30) return 'weak';
  return 'poor';
}

function verdictClasses(verdict: string | null): string {
  const v = (verdict ?? '').toLowerCase();
  if (v.includes('attractive') || v.includes('buy') || v.includes('undervalued') || v.includes('strong'))
    return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
  if (v.includes('overvalued') || v.includes('sell') || v.includes('weak') || v.includes('avoid'))
    return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  return 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700';
}

function pillarChipClass(score: number): string {
  if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function verdictTextClasses(verdict: string | null): string {
  const v = (verdict ?? '').toLowerCase();
  if (v.includes('attractive') || v.includes('buy') || v.includes('undervalued') || v.includes('strong'))
    return 'text-emerald-700 dark:text-emerald-300';
  if (v.includes('overvalued') || v.includes('sell') || v.includes('weak') || v.includes('avoid'))
    return 'text-red-600 dark:text-red-400';
  return 'text-gray-800 dark:text-gray-200';
}

/**
 * One unified verdict card — merges the three scoring surfaces that used to
 * be scattered (composite verdict text, health score, EW score) plus the
 * analyst target upside into a single glanceable strip under the hero.
 */
export function VerdictStrip({ verdictText, healthScore, ewScore, priceTarget, currentPrice, pillars }: VerdictStripProps) {
  const target = priceTarget?.targetMean ?? priceTarget?.targetMedian ?? null;
  const upside =
    target != null && currentPrice != null && currentPrice > 0
      ? (target / currentPrice - 1) * 100
      : null;
  const hasEw = ewScore?.totalScore != null && ewScore?.maxPossible != null;

  if (!verdictText && healthScore == null && !hasEw && upside == null) return null;

  return (
    <section aria-label="Model verdict" className="mb-5">
      <div className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 ${verdictClasses(verdictText)}`}>
        {verdictText && (
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Verdict</span>
            <strong className={`text-lg font-bold ${verdictTextClasses(verdictText)}`}>
              {verdictText}
            </strong>
          </div>
        )}
        {pillars ? (
          <span className="flex items-center gap-x-2.5 text-sm" title="Five-pillar profile — Valuation, Growth, Profitability, Health, Quality">
            {([
              ['V', pillars.valuation.score, 'Valuation'],
              ['G', pillars.growth.score, 'Growth'],
              ['P', pillars.profitability.score, 'Profitability'],
              ['H', pillars.health.score, 'Financial Health'],
              ['Q', pillars.quality.score, 'Quality'],
            ] as const).map(([ch, score, name]) => (
              <span key={ch} title={`${name}: ${score}/100`} className="tabular-nums">
                <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{ch} </span>
                <strong className={`font-semibold ${pillarChipClass(score)}`}>{score}</strong>
              </span>
            ))}
          </span>
        ) : healthScore != null && (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Health </span>
            <strong className="font-semibold text-gray-900 dark:text-white tabular-nums">{Math.round(healthScore)}/100</strong>
            <span className="text-gray-500 dark:text-gray-400"> · {healthLabel(healthScore)}</span>
          </span>
        )}
        {hasEw && (
          <span className="text-sm text-gray-600 dark:text-gray-300" title="Early Winners composite score">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">EW Score </span>
            <strong className="font-semibold text-gray-900 dark:text-white tabular-nums">
              {ewScore!.totalScore!.toFixed(0)}/{ewScore!.maxPossible!.toFixed(0)}
            </strong>
            {ewScore!.rank != null && (
              <span className="text-gray-500 dark:text-gray-400"> · #{ewScore!.rank}</span>
            )}
          </span>
        )}
        {upside != null && (
          <span className="text-sm text-gray-600 dark:text-gray-300" title={`Analyst mean target $${target!.toFixed(2)}${priceTarget?.numberOfAnalysts ? ` (${priceTarget.numberOfAnalysts} analysts)` : ''}`}>
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Analysts </span>
            <strong className={`font-semibold tabular-nums ${upside >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {upside >= 0 ? '+' : ''}{upside.toFixed(0)}%
            </strong>
            <span className="text-gray-500 dark:text-gray-400"> to ${target!.toFixed(0)}</span>
          </span>
        )}
      </div>
    </section>
  );
}
