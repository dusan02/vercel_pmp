import Link from 'next/link';
import { formatPrice, formatPercent, formatMarketCap } from '@/lib/utils/format';
import { AddToWatchlist } from '@/components/company/AddToWatchlist';
import { MoveAlertButton } from '@/components/notifications/MoveAlertButton';
import { AnalystConsensusStrip } from '@/components/company/analysis/sections/AnalystConsensusSection';
import type { PriceTargetData, RecommendationData } from '@/components/company/analysis/sections/AnalystConsensusSection';

interface AnalysisHeroProps {
  ticker: string;
  companyName: string;
  price: number | null;
  /** Live % change (meaningful only while a session is open) */
  changePct: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  /** 'closed' = weekend/holiday — live changePct is a frozen 0.00 in that case */
  marketSession: 'pre' | 'live' | 'after' | 'closed';
  /** Close of the session before the last one — used to compute the last real move when closed */
  prevClose: number | null;
  /** Key ratios for the hero stat strip (from finnhubMetrics) */
  peRatio?: number | null;
  dividendYield?: number | null;
  roe?: number | null;
  /** 52-week closing range (daily regularClose min/max) */
  week52Low?: number | null;
  week52High?: number | null;
  /** Next earnings date (YYYY-MM-DD) + days until it */
  earningsDate?: string | null;
  earningsDays?: number | null;
  /** Composite model verdict label (e.g. "Neutral") from AnalysisCache */
  verdict?: string | null;
  /** Early Winners composite snapshot — compact cell in the stats strip */
  ewScore?: {
    totalScore: number | null;
    maxPossible: number | null;
    rank: number | null;
  } | null;
  /** Analyst consensus — rendered as a compact strip right of the sector line */
  priceTarget?: PriceTargetData | null;
  recommendation?: RecommendationData | null;
}

function verdictColor(v: string): string {
  const s = v.toLowerCase();
  if (s.includes('attractive') || s.includes('buy') || s.includes('undervalued') || s.includes('strong'))
    return 'text-emerald-600 dark:text-emerald-400';
  if (s.includes('overvalued') || s.includes('sell') || s.includes('weak') || s.includes('avoid'))
    return 'text-red-600 dark:text-red-400';
  return 'text-gray-800 dark:text-gray-200';
}

export function AnalysisHero({
  ticker,
  companyName,
  price,
  changePct,
  marketCap,
  sector,
  industry,
  marketSession,
  prevClose,
  peRatio,
  dividendYield,
  roe,
  week52Low,
  week52High,
  earningsDate,
  earningsDays,
  verdict,
  ewScore,
  priceTarget,
  recommendation,
}: AnalysisHeroProps) {
  const isClosed = marketSession === 'closed';
  const earningsLabel =
    earningsDate && earningsDays != null
      ? earningsDays === 0
        ? 'today'
        : earningsDays === 1
          ? 'tomorrow'
          : `in ${earningsDays}d`
      : earningsDate
        ? new Date(earningsDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
        : null;

  // When the market is closed the API freezes changePct at 0.00 — compute the
  // last session's real move from the previous close instead. Without a
  // prevClose there is NO honest number to show (the frozen 0.00 would lie).
  const lastSessionPct =
    isClosed && price != null && price > 0 && prevClose != null && prevClose > 0
      ? (price / prevClose - 1) * 100
      : null;
  const displayPct = isClosed ? lastSessionPct : changePct;
  const hasStats = verdict != null
    || (ewScore?.totalScore != null && ewScore?.maxPossible != null)
    || marketCap != null || peRatio != null
    || (dividendYield != null && dividendYield > 0) || roe != null
    || (week52Low != null && week52High != null) || earningsLabel != null;

  return (
    <div className="mb-4 lg:mb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src={`/api/logo/${encodeURIComponent(ticker)}?s=64&prefer=icon`}
            alt={`${companyName} (${ticker}) logo`}
            width={48}
            height={48}
            className="rounded shrink-0 bg-gray-100 dark:bg-gray-800"
            style={{ objectFit: 'contain' }}
            loading="eager"
          />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              {companyName} ({ticker})<span className="hidden sm:inline"> Stock Analysis</span>
            </h1>
          </div>
          <AddToWatchlist ticker={ticker} />
          <MoveAlertButton symbol={ticker} />
        </div>
      </div>
      {/* Price line — separate row */}
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-1">
        {price != null && (
          <>
            Price: ${formatPrice(price)}
          </>
        )}
        {isClosed && (
          <span
            className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            title="Market is closed — showing the last completed session"
          >
            Market Closed
          </span>
        )}
        {displayPct != null && (
          <>
            {' · '}
            <span
              className={
                displayPct > 0
                  ? 'text-green-600 dark:text-green-400'
                  : displayPct < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-400'
              }
            >
              {formatPercent(displayPct)}
              {isClosed && <span className="text-gray-500 dark:text-gray-500"> at last close</span>}
            </span>
          </>
        )}
      </p>
      {/* Sector + Industry + analyst consensus strip — one row; the strip
          fills the empty space right of the sector line. */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {sector && (
            <>
              Sector:{' '}
              <Link
                href={`/sectors/${encodeURIComponent(sector)}`}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {sector}
              </Link>
            </>
          )}
          {industry && <> · Industry: {industry}</>}
        </p>
        <AnalystConsensusStrip
          priceTarget={priceTarget ?? null}
          recommendation={recommendation ?? null}
          fallbackPrice={price}
        />
      </div>
      {/* Key stats strip — bordered band so the header reads as one
          structured unit, not loose text under the title. Hidden entirely
          when the ticker has no stats (otherwise an empty bordered box). */}
      {hasStats && (
      <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 px-3 py-2 grid grid-cols-2 gap-x-5 gap-y-1.5 text-sm sm:flex sm:flex-wrap sm:gap-y-1">
        {verdict && (
          <span className="text-gray-600 dark:text-gray-400">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-500">Verdict </span>
            <strong className={`font-semibold ${verdictColor(verdict)}`}>{verdict}</strong>
          </span>
        )}
        {ewScore?.totalScore != null && ewScore?.maxPossible != null && (
          <span className="text-gray-600 dark:text-gray-400" title="Early Winners composite score (V5-B, current data) — fundamentals + momentum + quality">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-500">EW Score </span>
            <strong className="font-semibold text-gray-900 dark:text-white tabular-nums">
              {ewScore.totalScore.toFixed(0)}/{ewScore.maxPossible.toFixed(0)}
            </strong>
            {ewScore.rank != null && (
              <span className="text-gray-500 dark:text-gray-400"> · #{ewScore.rank}</span>
            )}
          </span>
        )}
        {marketCap != null && (
          <span className="text-gray-600 dark:text-gray-400">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-500">Mkt Cap </span>
            <strong className="font-semibold text-gray-900 dark:text-white">{formatMarketCap(marketCap)}</strong>
          </span>
        )}
        {peRatio != null && (
          <span className="text-gray-600 dark:text-gray-400">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-500">P/E </span>
            <strong className="font-semibold text-gray-900 dark:text-white">{peRatio.toFixed(1)}</strong>
          </span>
        )}
        {dividendYield != null && dividendYield > 0 && (
          <span className="text-gray-600 dark:text-gray-400">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-500">Div Yield </span>
            <strong className="font-semibold text-gray-900 dark:text-white">{dividendYield.toFixed(2)}%</strong>
          </span>
        )}
        {roe != null && (
          <span className="text-gray-600 dark:text-gray-400">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-500">ROE </span>
            <strong className="font-semibold text-gray-900 dark:text-white">{roe.toFixed(1)}%</strong>
          </span>
        )}
        {week52Low != null && week52High != null && (
          <span className="text-gray-600 dark:text-gray-400" title="52-week range over daily closes">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-500">52wk </span>
            <strong className="font-semibold text-gray-900 dark:text-white tabular-nums">
              {week52Low === week52High
                ? `$${formatPrice(week52Low)}`
                : `$${formatPrice(week52Low)}–$${formatPrice(week52High)}`}
            </strong>
          </span>
        )}
        {earningsLabel && (
          <span className="text-gray-600 dark:text-gray-400" title={earningsDate ? `Next earnings report: ${earningsDate}` : undefined}>
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-500">Earnings </span>
            <strong className="font-semibold text-indigo-600 dark:text-indigo-400">{earningsLabel}</strong>
          </span>
        )}
      </div>
      )}
    </div>
  );
}
