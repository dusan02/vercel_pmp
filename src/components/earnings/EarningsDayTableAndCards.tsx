'use client';

/**
 * Daily Earnings Scorecard strip + responsive desktop table / mobile cards
 * presentation for EarningsDayExplorer.
 */

import React from 'react';
import Link from 'next/link';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';
import CompanyLogo from '@/components/CompanyLogo';
import {
  formatEps, formatRevenue, formatMcap, formatSignedMcap, capBadge, timeChip,
} from '@/components/earnings/EarningsShared';
import {
  formatPct,
  verdictBadge,
  sigmaMove,
  COLUMNS,
  TdMetric,
  CardMetric,
  BeatStreakDots,
  RowDetailPanel,
  type EarningsBucketCounts,
  type EarningsScorecardStats,
  type SortKey,
  type SortDir,
} from '@/components/earnings/EarningsDayPrimitives';
import type { EarningsSSRRow } from '@/lib/seo/earningsSSR';
import type { EarningsTickerDetail } from '@/app/api/earnings/detail/route';

export function EarningsDailyScorecard({
  reported,
  totalCount,
  epsEstimateCount,
  revEstimateCount,
  bucketCounts,
  scorecard,
  onToggleExpand,
}: {
  reported: number;
  totalCount: number;
  epsEstimateCount: number;
  revEstimateCount: number;
  bucketCounts: EarningsBucketCounts;
  scorecard: EarningsScorecardStats;
  onToggleExpand: (symbol: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
      <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 tabular-nums">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Day Progress
        </div>
        <div className="mt-0.5 text-sm font-bold text-neutral-900 dark:text-white">
          {reported} <span className="text-xs font-normal text-neutral-400">/ {totalCount} reported</span>
        </div>
        <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          {bucketCounts.bmo} Pre · {bucketCounts.amc} After{bucketCounts.tbd > 0 ? ` · ${bucketCounts.tbd} TBD` : ''}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 tabular-nums">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          EPS Beat Rate
        </div>
        {scorecard.epsBeatPct != null ? (
          <>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className={`text-sm font-bold ${scorecard.epsBeatPct >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {scorecard.epsBeatPct}% beat
              </span>
              <span className="text-[11px] text-neutral-400">
                ({scorecard.epsBeats}/{scorecard.epsTotal})
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {scorecard.medianEpsSurprise != null
                ? `Median surprise ${formatPct(scorecard.medianEpsSurprise)}`
                : 'Awaiting estimates'}
            </div>
          </>
        ) : (
          <>
            <div className="mt-0.5 text-sm font-bold text-neutral-400">Upcoming</div>
            <div className="mt-0.5 text-[11px] text-neutral-400">
              {epsEstimateCount} with EPS est.
            </div>
          </>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 tabular-nums">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Rev Beat &amp; Double
        </div>
        {scorecard.revBeatPct != null ? (
          <>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className={`text-sm font-bold ${scorecard.revBeatPct >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {scorecard.revBeatPct}% rev beat
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{scorecard.doubleBeats} double beat</span>
              {' · '}
              <span className="text-rose-600 dark:text-rose-400 font-semibold">{scorecard.doubleMisses} double miss</span>
            </div>
          </>
        ) : (
          <>
            <div className="mt-0.5 text-sm font-bold text-neutral-400">—</div>
            <div className="mt-0.5 text-[11px] text-neutral-400">
              {revEstimateCount} with Rev est.
            </div>
          </>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 tabular-nums">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Biggest Reactions
        </div>
        <div className="mt-0.5 flex items-center justify-between text-xs">
          {scorecard.bestMover && (scorecard.bestMover.priceChangePct ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => onToggleExpand(scorecard.bestMover!.ticker)}
              className="font-bold text-neutral-900 dark:text-white hover:underline"
            >
              {scorecard.bestMover.ticker}{' '}
              <span className="text-emerald-600 dark:text-emerald-400">
                {formatPct(scorecard.bestMover.priceChangePct)}
              </span>
            </button>
          ) : <span className="text-neutral-400">—</span>}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-xs">
          {scorecard.worstMover && (scorecard.worstMover.priceChangePct ?? 0) < 0 ? (
            <button
              type="button"
              onClick={() => onToggleExpand(scorecard.worstMover!.ticker)}
              className="font-bold text-neutral-900 dark:text-white hover:underline"
            >
              {scorecard.worstMover.ticker}{' '}
              <span className="text-rose-600 dark:text-rose-400">
                {formatPct(scorecard.worstMover.priceChangePct)}
              </span>
            </button>
          ) : <span className="text-neutral-400">—</span>}
        </div>
      </div>
    </div>
  );
}

export function EarningsDayResultsView({
  visibleRows,
  sortedCount,
  hiddenRowCount,
  sortKey,
  sortDir,
  expandedTicker,
  detailsBySymbol,
  loadingSymbol,
  eligibleTickers,
  onSort,
  onToggleExpand,
  onShowAll,
}: {
  visibleRows: EarningsSSRRow[];
  sortedCount: number;
  hiddenRowCount: number;
  sortKey: SortKey;
  sortDir: SortDir;
  expandedTicker: string | null;
  detailsBySymbol: Record<string, EarningsTickerDetail>;
  loadingSymbol: string | null;
  eligibleTickers: Set<string>;
  onSort: (key: SortKey) => void;
  onToggleExpand: (symbol: string) => void;
  onShowAll: () => void;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-slate-800 overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-slate-800">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => onSort(col.key)}
                  className={`px-3 py-3 ${col.key === 'ticker' ? 'text-left' : 'text-right'} text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-50 dark:hover:bg-slate-800/50 transition-colors sticky top-0 bg-white dark:bg-slate-900 select-none`}
                >
                  <span className={`inline-flex items-center gap-0.5 ${col.key === 'ticker' ? '' : 'flex-row-reverse'}`}>
                    {col.label}
                    {sortKey === col.key
                      ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                      : <ArrowUpDown size={11} className="opacity-30" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
            {visibleRows.map((r) => {
              const badge = capBadge(r.marketCap);
              const chip = timeChip(r.time);
              const verdict = verdictBadge(r.overallScore);
              const sigma = sigmaMove(r);
              const linked = eligibleTickers.has(r.ticker);
              const isExpanded = expandedTicker === r.ticker;
              const detail = detailsBySymbol[r.ticker];
              return (
                <React.Fragment key={`${r.ticker}-${r.date}`}>
                  <tr
                    onClick={() => onToggleExpand(r.ticker)}
                    className={`cursor-pointer transition-colors ${
                      isExpanded
                        ? 'bg-neutral-50/80 dark:bg-slate-800/60'
                        : 'hover:bg-neutral-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400 dark:text-neutral-500 shrink-0">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <CompanyLogo ticker={r.ticker} size={28} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {linked ? (
                              <Link
                                href={`/analysis/${r.ticker}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-sm font-bold text-neutral-900 dark:text-white hover:underline"
                              >
                                {r.ticker}
                              </Link>
                            ) : (
                              <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{r.ticker}</span>
                            )}
                            {badge && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${badge.cls}`}>{badge.label}</span>}
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${chip.cls}`}>{chip.label}</span>
                            {verdict && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${verdict.cls}`} title="PMP Fundamental Score">{verdict.label}</span>}
                            <BeatStreakDots detail={detail} />
                          </div>
                          {r.companyName && r.companyName.toUpperCase() !== r.ticker.toUpperCase() && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[260px]">{r.companyName}</div>
                          )}
                          {r.moversReason && !isExpanded && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-400 truncate max-w-[320px] mt-0.5">
                              {r.moversReason}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <TdMetric
                      value={formatMcap(r.marketCap) || '-'}
                      delta={r.marketCapDiff}
                      deltaText={r.marketCapDiff != null ? formatSignedMcap(r.marketCapDiff) : undefined}
                    />
                    <TdMetric
                      value={r.price != null ? `$${r.price.toFixed(2)}` : '-'}
                      delta={r.priceChangePct}
                      badge={
                        sigma != null ? (
                          <div
                            className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 mt-0.5"
                            title={`Move is ${sigma.toFixed(1)}× the stock's typical 20-day daily move (±${r.stdDev20d?.toFixed(1)}%)`}
                          >
                            {sigma.toFixed(1)}× σ
                          </div>
                        ) : undefined
                      }
                    />
                    <TdMetric
                      value={r.epsActual != null ? formatEps(r.epsActual) : '-'}
                      sub={`Est: ${r.epsEstimate != null ? formatEps(r.epsEstimate) : '-'}`}
                      delta={r.epsSurprisePercent}
                    />
                    <TdMetric
                      value={r.revenueActual != null ? formatRevenue(r.revenueActual) : '-'}
                      sub={`Est: ${r.revenueEstimate != null ? formatRevenue(r.revenueEstimate) : '-'}`}
                      delta={r.revenueSurprisePercent}
                    />
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <RowDetailPanel
                          row={r}
                          detail={detail}
                          loadingDetail={loadingSymbol === r.ticker}
                          eligible={linked}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-neutral-100 dark:divide-slate-800">
        {visibleRows.map((r) => {
          const badge = capBadge(r.marketCap);
          const chip = timeChip(r.time);
          const verdict = verdictBadge(r.overallScore);
          const sigma = sigmaMove(r);
          const linked = eligibleTickers.has(r.ticker);
          const isExpanded = expandedTicker === r.ticker;
          const detail = detailsBySymbol[r.ticker];
          return (
            <div key={`${r.ticker}-${r.date}-m`}>
              <div
                onClick={() => onToggleExpand(r.ticker)}
                className="p-3 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 mb-2.5">
                  <CompanyLogo ticker={r.ticker} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {linked ? (
                        <Link
                          href={`/analysis/${r.ticker}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-bold text-neutral-900 dark:text-white hover:underline"
                        >
                          {r.ticker}
                        </Link>
                      ) : (
                        <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{r.ticker}</span>
                      )}
                      {badge && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${badge.cls}`}>{badge.label}</span>}
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${chip.cls}`}>{chip.label}</span>
                      {verdict && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${verdict.cls}`}>{verdict.label}</span>}
                      <BeatStreakDots detail={detail} />
                    </div>
                    {r.companyName && r.companyName.toUpperCase() !== r.ticker.toUpperCase() && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{r.companyName}</div>
                    )}
                  </div>
                  <span className="text-neutral-400">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <CardMetric
                    label={sigma != null ? `Price (${sigma.toFixed(1)}× σ)` : 'Price'}
                    value={r.price != null ? `$${r.price.toFixed(2)}` : '-'}
                    delta={r.priceChangePct}
                  />
                  <CardMetric label="Mkt Cap" value={formatMcap(r.marketCap) || '-'} delta={r.marketCapDiff} deltaText={r.marketCapDiff != null ? formatSignedMcap(r.marketCapDiff) : undefined} />
                  <CardMetric label="EPS" value={r.epsActual != null ? formatEps(r.epsActual) : '-'} sub={`Est ${r.epsEstimate != null ? formatEps(r.epsEstimate) : '-'}`} delta={r.epsSurprisePercent} />
                  <CardMetric label="Revenue" value={r.revenueActual != null ? formatRevenue(r.revenueActual) : '-'} sub={`Est ${r.revenueEstimate != null ? formatRevenue(r.revenueEstimate) : '-'}`} delta={r.revenueSurprisePercent} />
                </div>
              </div>
              {isExpanded && (
                <RowDetailPanel
                  row={r}
                  detail={detail}
                  loadingDetail={loadingSymbol === r.ticker}
                  eligible={linked}
                />
              )}
            </div>
          );
        })}
      </div>

      {hiddenRowCount > 0 && (
        <div className="border-t border-neutral-100 dark:border-slate-800 px-4 py-3 text-center bg-neutral-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onShowAll}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Show all {sortedCount} companies (+{hiddenRowCount} more)
          </button>
        </div>
      )}
    </div>
  );
}
