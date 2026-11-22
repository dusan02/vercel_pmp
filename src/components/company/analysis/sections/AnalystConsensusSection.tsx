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

const LABEL_BADGE: Record<string, string> = {
  'Strong Buy': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Buy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  Hold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  Sell: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

function computeConsensus(rec: RecommendationData | null) {
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
  return { sb, b, h, s, ss, totalAnalysts, buyPct, consensusLabel };
}

/** Compact one-line variant for the hero — sits right of the sector line. */
export function AnalystConsensusStrip({ priceTarget, recommendation, fallbackPrice }: AnalystConsensusSectionProps) {
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
  const { sb, b, h, s, ss, totalAnalysts, consensusLabel } = computeConsensus(rec);
  const analysts = (pt?.numberOfAnalysts ?? 0) > 0 ? pt!.numberOfAnalysts : totalAnalysts > 0 ? totalAnalysts : null;
  const segments: [number, string, string][] = [
    [sb, 'bg-emerald-600', `Strong Buy: ${sb}`],
    [b, 'bg-green-500', `Buy: ${b}`],
    [h, 'bg-yellow-500', `Hold: ${h}`],
    [s, 'bg-orange-500', `Sell: ${s}`],
    [ss, 'bg-rose-600', `Strong Sell: ${ss}`],
  ];

  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400"
      title="Wall Street consensus estimates — not a PMP forecast"
    >
      <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Analysts</span>
      {consensusLabel && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${LABEL_BADGE[consensusLabel] ?? LABEL_BADGE.Hold}`}>
          {consensusLabel}
        </span>
      )}
      {analysts != null && (
        <span className="tabular-nums">{analysts} analyst{analysts !== 1 ? 's' : ''}</span>
      )}
      {target != null && (
        <span className="tabular-nums">
          Target {formatPrice(target)}
          {upside != null && (
            <span className={upside >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
              {' '}({formatPercent(upside)})
            </span>
          )}
        </span>
      )}
      {totalAnalysts > 0 && (
        <span
          className="hidden sm:inline-flex h-1.5 w-16 rounded-full overflow-hidden"
          role="img"
          aria-label={`${consensusLabel ?? 'Analyst'} consensus — ${totalAnalysts} analysts`}
        >
          {segments.map(([count, color, title]) =>
            count > 0 ? (
              <span key={title} className={color} style={{ width: `${(count / totalAnalysts) * 100}%` }} title={title} />
            ) : null,
          )}
        </span>
      )}
    </span>
  );
}
