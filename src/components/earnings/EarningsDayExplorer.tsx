'use client';

/**
 * EarningsDayExplorer — earningstable.com-style layout: month calendar rail on
 * the left, compact sortable day-table on the right with Daily Earnings
 * Scorecard, outcome filters, sigma-move badges, 4Q beat-streak dots, and an
 * expandable row detail drawer (Polygon news + Finnhub 4Q history + PMP
 * fundamental & analyst context).
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, X, ArrowUpDown, ArrowUp, ArrowDown, Calendar as CalendarIcon,
  ChevronDown, ChevronRight, ExternalLink, Sparkles,
} from 'lucide-react';
import MonthCalendar from '@/components/MonthCalendar';
import CompanyLogo from '@/components/CompanyLogo';
import {
  formatEps, formatRevenue, formatMcap, formatSignedMcap, capBadge, timeChip, PillarStrip,
} from '@/components/earnings/EarningsShared';
import type { EarningsSSRRow } from '@/lib/seo/earningsSSR';
import type { EarningsTickerDetail } from '@/app/api/earnings/detail/route';

const parseDate = (s: string) => new Date(`${s}T12:00:00Z`);
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const formatDayLong = (d: Date) => `${DAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

function formatPct(v: number | null): string {
  return v == null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
const deltaColor = (v: number | null | undefined) =>
  v == null ? '' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

function verdictBadge(score: number | null | undefined): { label: string; cls: string } | null {
  if (score == null) return null;
  if (score >= 65) return { label: `Strong ${Math.round(score)}`, cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };
  if (score >= 45) return { label: `Mixed ${Math.round(score)}`, cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
  return { label: `Weak ${Math.round(score)}`, cls: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' };
}

function sigmaMove(r: EarningsSSRRow): number | null {
  if (r.priceChangePct == null || r.stdDev20d == null || r.stdDev20d <= 0.1) return null;
  const s = Math.abs(r.priceChangePct) / r.stdDev20d;
  return Number.isFinite(s) && s >= 1.5 ? s : null;
}

function isDoubleBeat(r: EarningsSSRRow): boolean {
  return r.hasReported
    && r.epsSurprisePercent != null && r.epsSurprisePercent >= 0
    && r.revenueSurprisePercent != null && r.revenueSurprisePercent >= 0;
}

function isEpsBeat(r: EarningsSSRRow): boolean {
  return r.hasReported && r.epsSurprisePercent != null && r.epsSurprisePercent >= 0;
}

function isAnyMiss(r: EarningsSSRRow): boolean {
  return r.hasReported && (
    (r.epsSurprisePercent != null && r.epsSurprisePercent < 0)
    || (r.revenueSurprisePercent != null && r.revenueSurprisePercent < 0)
  );
}

// ─── Metric cells (value / sub / delta — earningstable.com convention) ───────

function TdMetric({
  value, sub, delta, deltaText, badge,
}: {
  value: string;
  sub?: string | undefined;
  delta?: number | null;
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

function CardMetric({ label, value, sub, delta, deltaText }: { label: string; value: string; sub?: string | undefined; delta?: number | null; deltaText?: string | undefined }) {
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

function BeatStreakDots({ detail }: { detail?: EarningsTickerDetail | undefined }) {
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

function RowDetailPanel({
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

// ─── Filtering ────────────────────────────────────────────────────────────────

type SessionFilter = 'all' | 'bmo' | 'amc' | 'tbd';
type StatusFilter = 'all' | 'reported' | 'upcoming' | 'doubleBeat' | 'epsBeat' | 'miss';

const SESSION_FILTERS: { key: SessionFilter; label: string; activeCls: string }[] = [
  { key: 'all', label: 'All', activeCls: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent' },
  { key: 'bmo', label: 'Pre', activeCls: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700' },
  { key: 'amc', label: 'After', activeCls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700' },
  { key: 'tbd', label: 'TBD', activeCls: 'bg-neutral-200 dark:bg-slate-600 text-neutral-700 dark:text-neutral-200 border-transparent' },
];

const STATUS_FILTERS: { key: StatusFilter; label: string; activeCls: string; requiresReported?: boolean }[] = [
  { key: 'all', label: 'All', activeCls: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent' },
  { key: 'reported', label: 'Reported', activeCls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' },
  { key: 'upcoming', label: 'Upcoming', activeCls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700' },
  { key: 'doubleBeat', label: 'Double Beat', activeCls: 'bg-emerald-600 text-white border-transparent', requiresReported: true },
  { key: 'epsBeat', label: 'EPS Beat', activeCls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700', requiresReported: true },
  { key: 'miss', label: 'Miss', activeCls: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700', requiresReported: true },
];

function FilterChip({ active, activeCls, onClick, children }: {
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

// ─── Sorting ─────────────────────────────────────────────────────────────────

type SortKey = 'ticker' | 'marketCap' | 'price' | 'eps' | 'revenue';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'ticker', label: 'Company' },
  { key: 'marketCap', label: 'Mkt Cap' },
  { key: 'price', label: 'Price' },
  { key: 'eps', label: 'EPS' },
  { key: 'revenue', label: 'Revenue' },
];

function sortValue(r: EarningsSSRRow, key: SortKey): string | number | null {
  switch (key) {
    case 'ticker': return r.ticker;
    case 'marketCap': return r.marketCap;
    case 'price': return r.priceChangePct;
    case 'eps': return r.epsSurprisePercent ?? r.epsActual ?? r.epsEstimate;
    case 'revenue': return r.revenueSurprisePercent ?? r.revenueActual ?? r.revenueEstimate;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EarningsDayExplorer({
  initialDate,
  initialRows,
  dateCounts,
  eligibleTickers,
}: {
  initialDate: string;
  initialRows: EarningsSSRRow[];
  dateCounts: { date: string; count: number }[] | null;
  eligibleTickers: Set<string>;
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [rowsByDate, setRowsByDate] = useState<Record<string, EarningsSSRRow[]>>({ [initialDate]: initialRows });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [session, setSession] = useState<SessionFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [detailsBySymbol, setDetailsBySymbol] = useState<Record<string, EarningsTickerDetail>>({});
  const [loadingSymbol, setLoadingSymbol] = useState<string | null>(null);

  const fetchDay = useCallback(async (date: string, silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const res = await fetch(`/api/earnings/day?date=${date}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setRowsByDate(prev => ({ ...prev, [date]: json.data.rows }));
      } else {
        throw new Error('API error');
      }
    } catch {
      if (!silent) setError('Failed to load earnings for this date');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Sync if SSR initialDate updates after an ISR refresh
  useEffect(() => {
    setSelectedDate(initialDate);
    setRowsByDate(prev => ({ ...prev, [initialDate]: initialRows }));
  }, [initialDate, initialRows]);

  // Collapse open row when switching date
  useEffect(() => {
    setExpandedTicker(null);
  }, [selectedDate]);

  // Fetch rows for non-SSR dates
  useEffect(() => {
    if (rowsByDate[selectedDate]) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/earnings/day?date=${selectedDate}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled && json.success) {
          setRowsByDate(prev => ({ ...prev, [selectedDate]: json.data.rows }));
        } else if (!cancelled) {
          throw new Error('API error');
        }
      } catch {
        if (!cancelled) setError('Failed to load earnings for this date');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, rowsByDate]);

  // Live refresh: pull fresh rows on mount and every 60s while the tab is
  // visible so prices and reported actuals never stay frozen at SSR time.
  useEffect(() => {
    void fetchDay(selectedDate, true);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchDay(selectedDate, true);
    }, 60_000);
    return () => clearInterval(id);
  }, [selectedDate, fetchDay]);

  const allRows = useMemo(() => rowsByDate[selectedDate] ?? [], [rowsByDate, selectedDate]);

  // Prefetch 4Q beat-streak + news for the top 8 companies by market cap on
  // the selected day so their 4Q dots appear immediately in the table.
  useEffect(() => {
    if (allRows.length === 0) return;
    const topSymbols = [...allRows]
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, 8)
      .map((r) => r.ticker)
      .filter((sym) => !detailsBySymbol[sym]);
    if (topSymbols.length === 0) return;
    let cancelled = false;
    fetch(`/api/earnings/detail?symbols=${encodeURIComponent(topSymbols.join(','))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.bySymbol) {
          setDetailsBySymbol((prev) => ({ ...prev, ...j.bySymbol }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [allRows, detailsBySymbol]);

  const toggleExpand = useCallback((symbol: string) => {
    setExpandedTicker((prev) => {
      const next = prev === symbol ? null : symbol;
      if (next && !detailsBySymbol[next]) {
        setLoadingSymbol(next);
        fetch(`/api/earnings/detail?symbol=${encodeURIComponent(next)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j?.bySymbol) {
              setDetailsBySymbol((d) => ({ ...d, ...j.bySymbol }));
            }
          })
          .catch(() => {})
          .finally(() => setLoadingSymbol((curr) => (curr === next ? null : curr)));
      }
      return next;
    });
  }, [detailsBySymbol]);

  // Per-day bucket counts & Daily Earnings Scorecard statistics
  const { bucketCounts, scorecard } = useMemo(() => {
    const c = {
      bmo: 0, amc: 0, tbd: 0,
      reported: 0, upcoming: 0,
      doubleBeat: 0, epsBeat: 0, miss: 0,
    };
    let epsBeats = 0, epsTotal = 0;
    let revBeats = 0, revTotal = 0;
    let doubleMisses = 0;
    const epsSurprises: number[] = [];
    let bestMover: EarningsSSRRow | null = null;
    let worstMover: EarningsSSRRow | null = null;

    for (const r of allRows) {
      if (r.time === 'bmo') c.bmo++;
      else if (r.time === 'amc') c.amc++;
      else c.tbd++;

      if (r.hasReported) {
        c.reported++;
        if (isDoubleBeat(r)) c.doubleBeat++;
        if (isEpsBeat(r)) c.epsBeat++;
        if (isAnyMiss(r)) c.miss++;

        if (r.epsSurprisePercent != null) {
          epsTotal++;
          if (r.epsSurprisePercent >= 0) epsBeats++;
          if (Number.isFinite(r.epsSurprisePercent)) epsSurprises.push(r.epsSurprisePercent);
        }
        if (r.revenueSurprisePercent != null) {
          revTotal++;
          if (r.revenueSurprisePercent >= 0) revBeats++;
        }
        if (
          r.epsSurprisePercent != null && r.epsSurprisePercent < 0
          && r.revenueSurprisePercent != null && r.revenueSurprisePercent < 0
        ) {
          doubleMisses++;
        }
      } else {
        c.upcoming++;
      }

      if (r.priceChangePct != null && Number.isFinite(r.priceChangePct)) {
        if (!bestMover || r.priceChangePct > (bestMover.priceChangePct ?? -Infinity)) bestMover = r;
        if (!worstMover || r.priceChangePct < (worstMover.priceChangePct ?? Infinity)) worstMover = r;
      }
    }

    epsSurprises.sort((a, b) => a - b);
    const medianEpsSurprise = epsSurprises.length > 0
      ? epsSurprises[Math.floor(epsSurprises.length / 2)] ?? null
      : null;

    return {
      bucketCounts: c,
      scorecard: {
        epsBeats,
        epsTotal,
        epsBeatPct: epsTotal > 0 ? Math.round((epsBeats / epsTotal) * 100) : null,
        revBeats,
        revTotal,
        revBeatPct: revTotal > 0 ? Math.round((revBeats / revTotal) * 100) : null,
        doubleBeats: c.doubleBeat,
        doubleMisses,
        medianEpsSurprise,
        bestMover,
        worstMover,
      },
    };
  }, [allRows]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (session !== 'all') rows = rows.filter(r => r.time === session);
    if (status === 'reported') rows = rows.filter(r => r.hasReported);
    else if (status === 'upcoming') rows = rows.filter(r => !r.hasReported);
    else if (status === 'doubleBeat') rows = rows.filter(isDoubleBeat);
    else if (status === 'epsBeat') rows = rows.filter(isEpsBeat);
    else if (status === 'miss') rows = rows.filter(isAnyMiss);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(r => r.ticker.toLowerCase().includes(q) || r.companyName.toLowerCase().includes(q));
    return rows;
  }, [allRows, session, status, search]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      const an = Number(av), bn = Number(bv);
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return sorted;
  }, [filteredRows, sortKey, sortDir]);

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }, [sortKey]);

  const reported = bucketCounts.reported;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[420px_1fr] gap-4 items-start">
      {/* Left rail: month calendar + selected date */}
      <div className="lg:sticky lg:top-4 space-y-3">
        <MonthCalendar
          onDateSelect={setSelectedDate}
          selectedDate={selectedDate}
          initialDateCounts={dateCounts}
        />
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-neutral-200 dark:border-slate-800 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Selected date</div>
          <div className="text-sm font-bold text-neutral-900 dark:text-white mt-0.5">
            {formatDayLong(parseDate(selectedDate))}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 tabular-nums">
            {loading ? 'Loading…' : `${allRows.length} earnings${reported > 0 ? ` · ${reported} reported` : ''}`}
          </div>
          <Link
            href={`/earnings/date/${selectedDate}`}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
          >
            Open date page →
          </Link>
        </div>
      </div>

      {/* Right: scorecard + search + filters + table */}
      <div className="min-w-0">
        {/* Daily Earnings Scorecard */}
        {allRows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
            <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 tabular-nums">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Day Progress
              </div>
              <div className="mt-0.5 text-sm font-bold text-neutral-900 dark:text-white">
                {reported} <span className="text-xs font-normal text-neutral-400">/ {allRows.length} reported</span>
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
                    {allRows.filter((r) => r.epsEstimate != null).length} with EPS est.
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
                    {allRows.filter((r) => r.revenueEstimate != null).length} with Rev est.
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
                    onClick={() => toggleExpand(scorecard.bestMover!.ticker)}
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
                    onClick={() => toggleExpand(scorecard.worstMover!.ticker)}
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
        )}

        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-xl">
          <Search size={14} className="text-neutral-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${allRows.length} companies...`}
            className="flex-1 text-sm bg-transparent text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none min-w-0"
          />
          {search && (
            <button onClick={() => setSearch('')} className="p-0.5 rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Clear search">
              <X size={14} />
            </button>
          )}
          <span className="text-xs text-neutral-400 whitespace-nowrap shrink-0 tabular-nums">
            {sortedRows.length} cos.
          </span>
        </div>

        {/* Filter chips: session (Pre/After/TBD) + report status & outcome */}
        {allRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Filter earnings">
            {SESSION_FILTERS.map(f => (
              <FilterChip
                key={f.key}
                active={session === f.key}
                activeCls={f.activeCls}
                onClick={() => setSession(f.key)}
              >
                {f.label} <span className="tabular-nums opacity-70">{f.key === 'all' ? allRows.length : bucketCounts[f.key]}</span>
              </FilterChip>
            ))}
            <span className="mx-0.5 h-3.5 w-px bg-neutral-200 dark:bg-slate-700" aria-hidden="true" />
            {STATUS_FILTERS.filter(f => !f.requiresReported || reported > 0).map(f => (
              <FilterChip
                key={f.key}
                active={status === f.key}
                activeCls={f.activeCls}
                onClick={() => setStatus(f.key)}
              >
                {f.label}{' '}
                <span className="tabular-nums opacity-70">
                  {f.key === 'all' ? allRows.length : bucketCounts[f.key]}
                </span>
              </FilterChip>
            ))}
          </div>
        )}

        {loading && (
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-8">
            <div className="space-y-2">{[0,1,2,3,4].map(i => <div key={i} className="h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse" />)}</div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-rose-500">{error}</div>
        )}

        {!loading && !error && allRows.length === 0 && (
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-8 text-center">
            <CalendarIcon size={32} className="mx-auto mb-3 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">No earnings scheduled</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Select another date on the calendar.</p>
          </div>
        )}

        {!loading && !error && allRows.length > 0 && sortedRows.length === 0 && (
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">No earnings match the current filters</p>
            <button
              type="button"
              onClick={() => { setSearch(''); setSession('all'); setStatus('all'); }}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {!loading && !error && sortedRows.length > 0 && (
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
                        onClick={() => handleSort(col.key)}
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
                  {sortedRows.map((r) => {
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
                          onClick={() => toggleExpand(r.ticker)}
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
              {sortedRows.map((r) => {
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
                      onClick={() => toggleExpand(r.ticker)}
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
          </div>
        )}
      </div>
    </div>
  );
}
