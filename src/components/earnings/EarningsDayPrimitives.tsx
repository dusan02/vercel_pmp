'use client';

/**
 * Shared formatters, filter definitions, sort config, metric cells, and
 * expandable row detail panel for EarningsDayExplorer.
 */

import React from 'react';
import Link from 'next/link';
import { ExternalLink, Sparkles } from 'lucide-react';
import {
  formatEps, formatMcap, formatSignedMcap, PillarStrip,
} from '@/components/earnings/EarningsShared';
import type { EarningsSSRRow } from '@/lib/seo/earningsSSR';
import type { EarningsTickerDetail } from '@/app/api/earnings/detail/route';

export const parseDate = (s: string) => new Date(`${s}T12:00:00Z`);
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const formatDayLong = (d: Date) => `${DAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

export function formatPct(v: number | null): string {
  return v == null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export const deltaColor = (v: number | null | undefined) =>
  v == null ? '' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

export function verdictBadge(score: number | null | undefined): { label: string; cls: string } | null {
  if (score == null) return null;
  if (score >= 65) return { label: `Strong ${Math.round(score)}`, cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };
  if (score >= 45) return { label: `Mixed ${Math.round(score)}`, cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
  return { label: `Weak ${Math.round(score)}`, cls: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' };
}

export function sigmaMove(r: EarningsSSRRow): number | null {
  if (r.priceChangePct == null || r.stdDev20d == null || r.stdDev20d <= 0.1) return null;
  const s = Math.abs(r.priceChangePct) / r.stdDev20d;
  return Number.isFinite(s) && s >= 1.5 ? s : null;
}

export function isDoubleBeat(r: EarningsSSRRow): boolean {
  return r.hasReported
    && r.epsSurprisePercent != null && r.epsSurprisePercent >= 0
    && r.revenueSurprisePercent != null && r.revenueSurprisePercent >= 0;
}

export function isEpsBeat(r: EarningsSSRRow): boolean {
  return r.hasReported && r.epsSurprisePercent != null && r.epsSurprisePercent >= 0;
}

export function isAnyMiss(r: EarningsSSRRow): boolean {
  return r.hasReported && (
    (r.epsSurprisePercent != null && r.epsSurprisePercent < 0)
    || (r.revenueSurprisePercent != null && r.revenueSurprisePercent < 0)
  );
}

// ─── Filtering & Sorting Types ───────────────────────────────────────────────

export type SessionFilter = 'all' | 'bmo' | 'amc' | 'tbd';
export type StatusFilter = 'all' | 'reported' | 'upcoming' | 'doubleBeat' | 'epsBeat' | 'miss';

export interface EarningsBucketCounts {
  bmo: number;
  amc: number;
  tbd: number;
  reported: number;
  upcoming: number;
  doubleBeat: number;
  epsBeat: number;
  miss: number;
}

export interface EarningsScorecardStats {
  epsBeats: number;
  epsTotal: number;
  epsBeatPct: number | null;
  revBeats: number;
  revTotal: number;
  revBeatPct: number | null;
  doubleBeats: number;
  doubleMisses: number;
  medianEpsSurprise: number | null;
  bestMover: EarningsSSRRow | null;
  worstMover: EarningsSSRRow | null;
}

export const SESSION_FILTERS: { key: SessionFilter; label: string; activeCls: string }[] = [
  { key: 'all', label: 'All', activeCls: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent' },
  { key: 'bmo', label: 'Pre', activeCls: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700' },
  { key: 'amc', label: 'After', activeCls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700' },
  { key: 'tbd', label: 'TBD', activeCls: 'bg-neutral-200 dark:bg-slate-600 text-neutral-700 dark:text-neutral-200 border-transparent' },
];

export const STATUS_FILTERS: { key: StatusFilter; label: string; activeCls: string; requiresReported?: boolean }[] = [
  { key: 'all', label: 'All', activeCls: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent' },
  { key: 'reported', label: 'Reported', activeCls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' },
  { key: 'upcoming', label: 'Upcoming', activeCls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700' },
  { key: 'doubleBeat', label: 'Double Beat', activeCls: 'bg-emerald-600 text-white border-transparent', requiresReported: true },
  { key: 'epsBeat', label: 'EPS Beat', activeCls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700', requiresReported: true },
  { key: 'miss', label: 'Miss', activeCls: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700', requiresReported: true },
];

export function FilterChip({ active, activeCls, onClick, children }: {
  active: boolean;
  activeCls: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors whitespace-nowrap ${
        active
          ? activeCls
          : 'border-neutral-200 dark:border-slate-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

export type SortKey = 'ticker' | 'marketCap' | 'price' | 'eps' | 'revenue';
export type SortDir = 'asc' | 'desc';

export const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'ticker', label: 'Company' },
  { key: 'marketCap', label: 'Mkt Cap' },
  { key: 'price', label: 'Price' },
  { key: 'eps', label: 'EPS' },
  { key: 'revenue', label: 'Revenue' },
];

export function sortValue(r: EarningsSSRRow, key: SortKey): string | number | null {
  switch (key) {
    case 'ticker': return r.ticker;
    case 'marketCap': return r.marketCap;
    case 'price': return r.priceChangePct;
    case 'eps': return r.epsSurprisePercent ?? r.epsActual ?? r.epsEstimate;
    case 'revenue': return r.revenueSurprisePercent ?? r.revenueActual ?? r.revenueEstimate;
  }
}

// ─── Metric cells (value / sub / delta — earningstable.com convention) ───────

export function TdMetric({
  value, sub, delta, deltaText, badge,
}: {
  value: string;
  sub?: string | undefined;
  delta?: number | null | undefined;
  deltaText?: string | undefined;
  badge?: React.ReactNode;
}) {
  const text = deltaText ?? formatPct(delta ?? null);
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      <div className="text-sm font-bold text-neutral-900 dark:text-white">{value}</div>
      {sub && <div className="text-[11px] text-neutral-400 dark:text-neutral-500">{sub}</div>}
      {text && <div className={`text-xs font-semibold ${deltaColor(delta)}`}>{text}</div>}
      {badge}
    </td>
  );
}

export function CardMetric({ label, value, sub, delta, deltaText }: {
  label: string;
  value: string;
  sub?: string | undefined;
  delta?: number | null | undefined;
  deltaText?: string | undefined;
}) {
  const text = deltaText ?? formatPct(delta ?? null);
  return (
    <div className="bg-neutral-50 dark:bg-slate-800/50 rounded-lg p-2.5">
      <div className="text-[9px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm font-bold text-neutral-900 dark:text-white">{value}</div>
      {sub && <div className="text-[10px] text-neutral-400 dark:text-neutral-500">{sub}</div>}
      {text && <div className={`text-xs font-semibold mt-0.5 ${deltaColor(delta)}`}>{text}</div>}
    </div>
  );
}

// ─── 4-Quarter Beat Streak Mini Dots ─────────────────────────────────────────

export function BeatStreakDots({ detail }: { detail?: EarningsTickerDetail | undefined }) {
  if (!detail || detail.totalCount === 0) return null;
  const chrono = [...detail.quarters].reverse();
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-slate-800 text-[9px] font-semibold text-neutral-600 dark:text-neutral-300"
      title={`Last ${detail.totalCount} quarters EPS: ${detail.beatCount}/${detail.totalCount} beats${detail.avgSurprisePct != null ? ` (avg ${formatPct(detail.avgSurprisePct)})` : ''}`}
    >
      <span className="mr-0.5 opacity-75">4Q</span>
      {chrono.map((q, idx) => {
        if (q.actual == null || q.estimate == null) {
          return <span key={q.period || idx} className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-slate-600" />;
        }
        const beat = q.actual >= q.estimate;
        return (
          <span
            key={q.period || idx}
            className={`w-1.5 h-1.5 rounded-full ${beat ? 'bg-emerald-500' : 'bg-rose-500'}`}
          />
        );
      })}
    </span>
  );
}

// ─── Expandable Row Detail Drawer ─────────────────────────────────────────────

export function RowDetailPanel({
  row,
  detail,
  loadingDetail,
  eligible,
}: {
  row: EarningsSSRRow;
  detail?: EarningsTickerDetail | undefined;
  loadingDetail: boolean;
  eligible: boolean;
}) {
  const sigma = sigmaMove(row);
  const totalAnalysts = (row.analystBuy ?? 0) + (row.analystHold ?? 0) + (row.analystSell ?? 0);
  const buyPct = totalAnalysts > 0 ? Math.round(((row.analystBuy ?? 0) / totalAnalysts) * 100) : null;
  const w52 = row.week52Position != null ? Math.max(0, Math.min(100, row.week52Position)) : null;

  return (
    <div className="bg-neutral-50/90 dark:bg-slate-950/70 border-t border-neutral-200/80 dark:border-slate-800 px-4 py-3.5 text-left">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1: Why it moved + Polygon Earnings News */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1">
            <Sparkles size={11} className="text-amber-500" />
            Earnings &amp; Market Context
          </div>
          {row.moversReason && (
            <div className="text-xs text-neutral-800 dark:text-neutral-200 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 rounded-lg px-2.5 py-2 leading-relaxed">
              <span className="font-semibold text-amber-700 dark:text-amber-400 mr-1">
                {row.moversCategory || 'Mover'}:
              </span>
              {row.moversReason}
            </div>
          )}
          {loadingDetail && !detail && (
            <div className="space-y-1.5">
              <div className="h-4 w-3/4 rounded bg-neutral-200 dark:bg-slate-800 animate-pulse" />
              <div className="h-3 w-full rounded bg-neutral-200 dark:bg-slate-800 animate-pulse" />
            </div>
          )}
          {detail && detail.news.length > 0 ? (
            <div className="space-y-2">
              {detail.news.slice(0, 2).map((n, i) => (
                <a
                  key={i}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group rounded-lg bg-white dark:bg-slate-900 border border-neutral-200/80 dark:border-slate-800 p-2.5 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2 leading-snug">
                      {n.title}
                    </div>
                    <ExternalLink size={11} className="shrink-0 mt-0.5 text-neutral-400 group-hover:text-blue-500" />
                  </div>
                  {n.description && (
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                      {n.description}
                    </p>
                  )}
                  <div className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                    {n.publisher ?? 'News'}{n.publishedUtc ? ` · ${n.publishedUtc.slice(0, 10)}` : ''}
                  </div>
                </a>
              ))}
            </div>
          ) : !loadingDetail && !row.moversReason ? (
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              No recent earnings headlines available for {row.ticker}.
            </p>
          ) : null}
        </div>

        {/* Column 2: Last 4 Quarters EPS History (Finnhub) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Last 4 Quarters EPS (Finnhub)
            </span>
            {detail && detail.totalCount > 0 && (
              <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">
                Beat {detail.beatCount}/{detail.totalCount}
                {detail.avgSurprisePct != null && (
                  <span className={`ml-1 ${deltaColor(detail.avgSurprisePct)}`}>
                    (avg {formatPct(detail.avgSurprisePct)})
                  </span>
                )}
              </span>
            )}
          </div>
          {loadingDetail && !detail ? (
            <div className="grid grid-cols-2 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-neutral-200 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : detail && detail.quarters.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              {detail.quarters.map((q, idx) => {
                const label = q.quarter && q.year ? `Q${q.quarter} '${String(q.year).slice(-2)}` : q.period || `Q-${idx + 1}`;
                const beat = q.actual != null && q.estimate != null ? q.actual >= q.estimate : null;
                return (
                  <div
                    key={q.period || idx}
                    className="rounded-lg bg-white dark:bg-slate-900 border border-neutral-200/80 dark:border-slate-800 px-2.5 py-2 tabular-nums"
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 dark:text-neutral-500">
                      <span className="font-semibold">{label}</span>
                      {beat !== null && (
                        <span className={`font-bold ${beat ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {q.surprisePercent != null ? `${q.surprisePercent >= 0 ? '+' : ''}${q.surprisePercent.toFixed(1)}%` : beat ? 'Beat' : 'Miss'}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs font-bold text-neutral-900 dark:text-white">
                      {q.actual != null ? formatEps(q.actual) : '—'}
                      <span className="ml-1 text-[10px] font-normal text-neutral-400">
                        vs {q.estimate != null ? formatEps(q.estimate) : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              No quarterly EPS history available.
            </p>
          )}
        </div>

        {/* Column 3: Fundamental & Analyst Context */}
        <div className="space-y-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Valuation, Volatility &amp; Street
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-900 border border-neutral-200/80 dark:border-slate-800 p-2.5 space-y-2 text-xs tabular-nums">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {row.peRatio != null && row.peRatio > 0 && (
                <div>
                  <span className="text-neutral-400">TTM P/E </span>
                  <span className="font-bold text-neutral-900 dark:text-white">{row.peRatio.toFixed(1)}×</span>
                </div>
              )}
              {row.forwardPe != null && row.forwardPe > 0 && (
                <div>
                  <span className="text-neutral-400">Fwd P/E </span>
                  <span className="font-bold text-neutral-900 dark:text-white">{row.forwardPe.toFixed(1)}×</span>
                </div>
              )}
              {row.stdDev20d != null && (
                <div>
                  <span className="text-neutral-400">Typical 1d </span>
                  <span className="font-bold text-neutral-900 dark:text-white">±{row.stdDev20d.toFixed(1)}%</span>
                  {sigma != null && (
                    <span className="ml-1 text-[10px] font-bold text-violet-600 dark:text-violet-400">
                      ({sigma.toFixed(1)}× σ today)
                    </span>
                  )}
                </div>
              )}
            </div>

            {w52 != null && (
              <div>
                <div className="flex justify-between text-[10px] text-neutral-400 mb-0.5">
                  <span>52W Low {row.week52Low != null ? `$${row.week52Low.toFixed(0)}` : ''}</span>
                  <span className="font-semibold text-neutral-600 dark:text-neutral-300">{Math.round(w52)}% of 52W range</span>
                  <span>High {row.week52High != null ? `$${row.week52High.toFixed(0)}` : ''}</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${w52}%` }} />
                </div>
              </div>
            )}

            {totalAnalysts > 0 && (
              <div className="flex items-center justify-between text-[11px] pt-0.5">
                <span className="text-neutral-400">Analysts ({totalAnalysts})</span>
                <span className="font-semibold">
                  <span className="text-emerald-600 dark:text-emerald-400">{row.analystBuy ?? 0} Buy</span>
                  {' · '}
                  <span className="text-neutral-500">{row.analystHold ?? 0} Hold</span>
                  {' · '}
                  <span className="text-rose-600 dark:text-rose-400">{row.analystSell ?? 0} Sell</span>
                  {buyPct != null && <span className="ml-1 text-neutral-400">({buyPct}% Buy)</span>}
                </span>
              </div>
            )}

            <PillarStrip row={row} />

            {eligible && (
              <div className="pt-1 border-t border-neutral-100 dark:border-slate-800 flex items-center justify-between">
                <Link
                  href={`/analysis/${row.ticker}`}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Open full {row.ticker} analysis →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
