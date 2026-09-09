import { formatPrice, formatPercent } from '@/lib/utils/format';

export interface PriceTargetData {
  targetHigh: number | null;
  targetLow: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  numberOfAnalysts: number | null;
  currentPrice: number | null;
  fetchedAt: Date | string | null;
}

export interface RecommendationData {
  period: string | null;
  strongBuy: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  strongSell: number | null;
  fetchedAt: Date | string | null;
}

interface AnalystConsensusSectionProps {
  priceTarget: PriceTargetData | null;
  recommendation: RecommendationData | null;
  /** Fallback price when priceTarget.currentPrice is missing */
  fallbackPrice: number | null;
}

/** Visual Low—Mean—High range bar with the current price marker. */
function TargetRangeBar({
  low,
  mean,
  high,
  current,
}: {
  low: number | null;
  mean: number;
  high: number | null;
  current: number | null;
}) {
  const values = [low, mean, high, current].filter((v): v is number => v != null && v > 0);
  if (values.length < 2) return null;

  const domainMin = Math.min(...values);
  const domainMax = Math.max(...values);
  const pad = (domainMax - domainMin) * 0.08 || domainMin * 0.02 || 1;
  const min = domainMin - pad;
  const max = domainMax + pad;
  const span = max - min || 1;
  const pos = (v: number) => ((v - min) / span) * 100;

  return (
    <div className="mt-2 mb-4" role="img" aria-label={`Price target range: low ${low ?? '—'}, mean ${mean}, high ${high ?? '—'}, current ${current ?? '—'}`}>
      <div className="relative h-12">
        {/* Range bar */}
        <div className="absolute top-5 left-0 right-0 h-2 rounded-full bg-gradient-to-r from-rose-300 via-yellow-200 to-emerald-300 dark:from-rose-900/60 dark:via-yellow-900/40 dark:to-emerald-900/60" />
        {/* Markers */}
        {low != null && (
          <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${pos(low)}%` }}>
            <div className="w-0.5 h-3 mx-auto bg-rose-500" />
            <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold tabular-nums whitespace-nowrap">{formatPrice(low)}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400">Low</div>
          </div>
        )}
        {high != null && (
          <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${pos(high)}%` }}>
            <div className="w-0.5 h-3 mx-auto bg-emerald-500" />
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums whitespace-nowrap">{formatPrice(high)}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400">High</div>
          </div>
        )}
        {/* Current price marker (diamond below the bar) */}
        {current != null && current > 0 && (
          <div className="absolute bottom-0 -translate-x-1/2 text-center" style={{ left: `${pos(current)}%` }}>
            <div className="w-2.5 h-2.5 mx-auto rotate-45 bg-gray-700 dark:bg-gray-300 border border-white dark:border-gray-900" />
            <div className="text-[10px] text-gray-600 dark:text-gray-300 font-semibold tabular-nums whitespace-nowrap">{formatPrice(current)}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400">Now</div>
          </div>
        )}
        {/* Mean marker on the bar */}
        <div
          className="absolute top-[15px] -translate-x-1/2 w-3 h-3 rounded-full bg-blue-600 border-2 border-white dark:border-gray-800"
          style={{ left: `${pos(mean)}%` }}
          title={`Consensus target: ${formatPrice(mean)}`}
        />
      </div>
      <div className="text-center text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
        52-wk analyst range · <span className="text-blue-600 dark:text-blue-400 font-semibold">Mean {formatPrice(mean)}</span>
      </div>
    </div>
  );
}

export function AnalystConsensusSection({ priceTarget, recommendation, fallbackPrice }: AnalystConsensusSectionProps) {
  const pt = priceTarget;
  const rec = recommendation;
  const hasPt = pt && (pt.targetMean != null || pt.targetMedian != null);
  const hasRec = rec && (rec.strongBuy != null || rec.buy != null || rec.hold != null);
  if (!hasPt && !hasRec) return null;

  const target = pt?.targetMean ?? pt?.targetMedian ?? null;
  const currentPrice = pt?.currentPrice ?? fallbackPrice ?? null;
  const upside =
    target != null && currentPrice != null && currentPrice > 0
      ? (target / currentPrice - 1) * 100
      : null;
  const freshness = pt?.fetchedAt ?? rec?.fetchedAt;
  const freshnessDate = freshness ? new Date(freshness) : null;
  const freshnessStr =
    freshnessDate && !isNaN(freshnessDate.getTime())
      ? freshnessDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

  // Recommendation consensus
  const sb = rec?.strongBuy ?? 0;
  const b = rec?.buy ?? 0;
  const h = rec?.hold ?? 0;
  const s = rec?.sell ?? 0;
  const ss = rec?.strongSell ?? 0;
  const totalAnalysts = sb + b + h + s + ss;
  const buyPct = totalAnalysts > 0 ? Math.round(((sb + b) / totalAnalysts) * 100) : null;
  // Consensus must consider the FULL distribution — a 100% Hold book was
  // previously labelled "Sell" because only the buy-side share was checked.
  const sellPct = totalAnalysts > 0 ? ((s + ss) / totalAnalysts) * 100 : null;
  const consensusLabel =
    totalAnalysts > 0
      ? buyPct != null && buyPct >= 70
        ? 'Strong Buy'
        : buyPct != null && buyPct >= 50
          ? 'Buy'
          : sellPct != null && sellPct >= 30
            ? 'Sell'
            : 'Hold'
      : null;

  return (
    <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Analyst Consensus</h2>
        {consensusLabel && (
          <span
            className={`px-3 py-1 rounded-full text-sm font-bold ${
              consensusLabel === 'Strong Buy'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : consensusLabel === 'Buy'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : consensusLabel === 'Hold'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
            }`}
          >
            {consensusLabel}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Wall Street consensus estimates — not a PMP forecast
        {freshnessStr ? ` · Updated ${freshnessStr}` : ''}
      </p>

      {/* Key numbers */}
      {hasPt && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
          {currentPrice != null && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Price</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{formatPrice(currentPrice)}</div>
            </div>
          )}
          {target != null && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Consensus Target</div>
              <div className="text-lg font-bold text-blue-700 dark:text-blue-300 tabular-nums">{formatPrice(target)}</div>
            </div>
          )}
          {upside != null && (
            <div className={`rounded-lg p-3 ${upside >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
              <div className={`text-xs mb-1 ${upside >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {upside >= 0 ? 'Upside' : 'Downside'}
              </div>
              <div className={`text-lg font-bold tabular-nums ${upside >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                {formatPercent(upside)}
              </div>
            </div>
          )}
          {pt?.numberOfAnalysts != null && pt.numberOfAnalysts > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Analysts</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{pt.numberOfAnalysts}</div>
            </div>
          )}
        </div>
      )}

      {/* Visual price target range */}
      {hasPt && target != null && (
        <TargetRangeBar low={pt?.targetLow ?? null} mean={target} high={pt?.targetHigh ?? null} current={currentPrice} />
      )}

      {/* Recommendation breakdown bar */}
      {hasRec && totalAnalysts > 0 && (
        <div className={hasPt ? 'pt-4 border-t border-gray-100 dark:border-gray-700' : ''}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Analyst Recommendations</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {totalAnalysts} analyst{totalAnalysts !== 1 ? 's' : ''}
              {rec?.period ? ` · ${rec.period}` : ''}
            </span>
          </div>
          <div
            className="flex h-6 rounded-lg overflow-hidden"
            role="progressbar"
            aria-valuenow={buyPct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${consensusLabel ?? 'Analyst'} consensus — ${totalAnalysts} analysts`}
          >
            {sb > 0 && <div className="bg-emerald-600 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(sb / totalAnalysts) * 100}%` }} title={`Strong Buy: ${sb}`}>{sb > 1 ? sb : ''}</div>}
            {b > 0 && <div className="bg-green-500 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(b / totalAnalysts) * 100}%` }} title={`Buy: ${b}`}>{b > 1 ? b : ''}</div>}
            {h > 0 && <div className="bg-yellow-500 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(h / totalAnalysts) * 100}%` }} title={`Hold: ${h}`}>{h > 1 ? h : ''}</div>}
            {s > 0 && <div className="bg-orange-500 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(s / totalAnalysts) * 100}%` }} title={`Sell: ${s}`}>{s > 1 ? s : ''}</div>}
            {ss > 0 && <div className="bg-rose-600 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(ss / totalAnalysts) * 100}%` }} title={`Strong Sell: ${ss}`}>{ss > 1 ? ss : ''}</div>}
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-600 mr-1" />Strong Buy {sb}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Buy {b}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />Hold {h}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />Sell {s}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-rose-600 mr-1"></span>Strong Sell {ss}</span>
          </div>
        </div>
      )}
    </div>
  );
}
