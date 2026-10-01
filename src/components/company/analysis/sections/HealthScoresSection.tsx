/** Score snapshot for the SSR Health Scores section (subset of AnalysisCache). */
export interface HealthScoresData {
  healthScore: number | null;
  profitabilityScore: number | null;
  valuationScore: number | null;
  verdictText: string | null;
  piotroskiScore: number | null;
  altmanZ: number | null;
  revenueCagr: number | null;
  netIncomeCagr: number | null;
  fcfMargin: number | null;
  debtRepaymentYears: number | null;
  humanDebtInfo: string | null;
  humanPeInfo: string | null;
  marginStability: number | null;
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return '—';
  if (score >= 75) return 'strong';
  if (score >= 50) return 'moderate';
  return 'weak';
}

/** Safe 0-decimal formatter for 0–100 scores (guards NaN/Infinity). */
function fmtScore(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(0);
}

/** Percent formatter for values already stored in percent (e.g. CAGRs from scoreCalculator). */
function fmtPctMetric(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}

/** Percent formatter for FRACTION values (0.15 → "15.00%") — fcfMargin, marginStability. */
function fmtPctFraction(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function fmtRatio(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(2);
}

export function HealthScoresSection({ cache }: { cache: HealthScoresData | null }) {
  if (!cache) return null;

  const hasSecondary =
    cache.revenueCagr != null ||
    cache.netIncomeCagr != null ||
    cache.fcfMargin != null ||
    cache.debtRepaymentYears != null ||
    cache.marginStability != null;

  return (
    <section className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Financial Health Scores
      </h2>
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
        {cache.healthScore != null && (
          <div>
            <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Health Score</dt>
            <dd className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
              {fmtScore(cache.healthScore)}
              <span className="text-sm text-gray-400">/100</span>
            </dd>
            <dd className="text-xs text-gray-500 dark:text-gray-400">{scoreLabel(cache.healthScore)}</dd>
          </div>
        )}
        {cache.profitabilityScore != null && (
          <div>
            <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Profitability</dt>
            <dd className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
              {fmtScore(cache.profitabilityScore)}
              <span className="text-sm text-gray-400">/100</span>
            </dd>
            <dd className="text-xs text-gray-500 dark:text-gray-400">{scoreLabel(cache.profitabilityScore)}</dd>
          </div>
        )}
        {cache.valuationScore != null && (
          <div>
            <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Valuation Score</dt>
            <dd className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
              {fmtScore(cache.valuationScore)}
              <span className="text-sm text-gray-400">/100</span>
            </dd>
            <dd className="text-xs text-gray-500 dark:text-gray-400">{scoreLabel(cache.valuationScore)}</dd>
          </div>
        )}
        {cache.piotroskiScore != null && (
          <div>
            <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Piotroski F-Score</dt>
            <dd className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
              {fmtScore(cache.piotroskiScore)}
              <span className="text-sm text-gray-400">/9</span>
            </dd>
          </div>
        )}
        {cache.altmanZ != null && (
          <div>
            <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Altman Z-Score</dt>
            <dd className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{fmtRatio(cache.altmanZ)}</dd>
            <dd className="text-xs text-gray-500 dark:text-gray-400">
              {cache.altmanZ > 3 ? 'Safe zone' : cache.altmanZ > 1.8 ? 'Grey zone' : 'Distressed'}
            </dd>
          </div>
        )}
      </dl>

      {hasSecondary && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          {cache.revenueCagr != null && (
            <div>
              <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Revenue CAGR</dt>
              <dd className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{fmtPctMetric(cache.revenueCagr)}</dd>
            </div>
          )}
          {cache.netIncomeCagr != null && (
            <div>
              <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Net Income CAGR</dt>
              <dd className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{fmtPctMetric(cache.netIncomeCagr)}</dd>
            </div>
          )}
          {cache.fcfMargin != null && (
            <div>
              <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">FCF Margin</dt>
              <dd className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{fmtPctFraction(cache.fcfMargin)}</dd>
            </div>
          )}
          {cache.debtRepaymentYears != null && (
            <div>
              <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Debt Repayment</dt>
              <dd className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{cache.debtRepaymentYears.toFixed(1)} yrs</dd>
            </div>
          )}
          {cache.marginStability != null && (
            <div>
              <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Margin Stability</dt>
              <dd className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums" title="Std deviation of EBIT margin — lower is more stable">{fmtPctFraction(cache.marginStability)}</dd>
            </div>
          )}
        </dl>
      )}

      {cache.verdictText && (
        <p className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          {cache.verdictText}
        </p>
      )}

      {(cache.humanDebtInfo || cache.humanPeInfo) && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
          {cache.humanDebtInfo && <span>{cache.humanDebtInfo}</span>}
          {cache.humanPeInfo && <span>· {cache.humanPeInfo}</span>}
        </div>
      )}
    </section>
  );
}
