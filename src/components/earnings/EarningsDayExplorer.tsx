'use client';

/**
 * EarningsDayExplorer — earningstable.com-style layout: month calendar rail on
 * the left, compact sortable day-table on the right. Selecting a date fetches
 * /api/earnings/day (enriched rows: live price, mkt cap, surprises).
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, Calendar as CalendarIcon } from 'lucide-react';
import MonthCalendar from '@/components/MonthCalendar';
import CompanyLogo from '@/components/CompanyLogo';
import {
  formatEps, formatRevenue, formatMcap, formatSignedMcap, capBadge, timeChip,
} from '@/components/earnings/EarningsShared';
import type { EarningsSSRRow } from '@/lib/seo/earningsSSR';

const parseDate = (s: string) => new Date(`${s}T12:00:00Z`);
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const formatDayLong = (d: Date) => `${DAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

function formatPct(v: number | null): string {
  return v == null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
const deltaColor = (v: number | null | undefined) =>
  v == null ? '' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

// ─── Metric cells (value / sub / delta — earningstable.com convention) ───────

function TdMetric({ value, sub, delta, deltaText }: { value: string; sub?: string | undefined; delta?: number | null; deltaText?: string | undefined }) {
  const text = deltaText ?? formatPct(delta ?? null);
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      <div className="text-sm font-bold text-neutral-900 dark:text-white">{value}</div>
      {sub && <div className="text-[11px] text-neutral-400 dark:text-neutral-500">{sub}</div>}
      {text && <div className={`text-xs font-semibold ${deltaColor(delta)}`}>{text}</div>}
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

// ─── Filtering ────────────────────────────────────────────────────────────────

type SessionFilter = 'all' | 'bmo' | 'amc' | 'tbd';
type StatusFilter = 'all' | 'reported' | 'upcoming';

const SESSION_FILTERS: { key: SessionFilter; label: string; activeCls: string }[] = [
  { key: 'all', label: 'All', activeCls: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent' },
  { key: 'bmo', label: 'Pre', activeCls: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700' },
  { key: 'amc', label: 'After', activeCls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700' },
  { key: 'tbd', label: 'TBD', activeCls: 'bg-neutral-200 dark:bg-slate-600 text-neutral-700 dark:text-neutral-200 border-transparent' },
];

const STATUS_FILTERS: { key: StatusFilter; label: string; activeCls: string }[] = [
  { key: 'all', label: 'All', activeCls: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent' },
  { key: 'reported', label: 'Reported', activeCls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' },
  { key: 'upcoming', label: 'Upcoming', activeCls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700' },
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
    case 'price': return r.price;
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

  // Live refresh: the Price column should track the market — re-pull the
  // selected day every 60s while the tab is visible (today's prices drift
  // post-earnings; SSR rows would otherwise freeze at generation time).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchDay(selectedDate, true);
    }, 60_000);
    return () => clearInterval(id);
  }, [selectedDate, fetchDay]);

  const allRows = rowsByDate[selectedDate] ?? [];

  // Per-day bucket counts shown on the filter chips (computed on the full day
  // set so they reflect the day's composition, not the current search).
  const bucketCounts = useMemo(() => {
    const c = { bmo: 0, amc: 0, tbd: 0, reported: 0, upcoming: 0 };
    for (const r of allRows) {
      if (r.time === 'bmo') c.bmo++;
      else if (r.time === 'amc') c.amc++;
      else c.tbd++;
      if (r.hasReported) c.reported++; else c.upcoming++;
    }
    return c;
  }, [allRows]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (session !== 'all') rows = rows.filter(r => r.time === session);
    if (status !== 'all') rows = rows.filter(r => status === 'reported' ? r.hasReported : !r.hasReported);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(r => r.ticker.toLowerCase().includes(q) || r.companyName.toLowerCase().includes(q));
    return rows;
  }, [allRows, session, status, search]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
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

  const reported = allRows.filter(r => r.hasReported).length;

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

      {/* Right: table */}
      <div className="min-w-0">
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

        {/* Filter chips: session (Pre/After/TBD) + report status */}
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
            {STATUS_FILTERS.map(f => (
              <FilterChip
                key={f.key}
                active={status === f.key}
                activeCls={f.activeCls}
                onClick={() => setStatus(f.key)}
              >
                {f.label} <span className="tabular-nums opacity-70">{f.key === 'all' ? allRows.length : bucketCounts[f.key]}</span>
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
                    const linked = eligibleTickers.has(r.ticker);
                    return (
                      <tr key={`${r.ticker}-${r.date}`} className="hover:bg-neutral-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <CompanyLogo ticker={r.ticker} size={28} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {linked ? (
                                  <Link href={`/analysis/${r.ticker}`} className="text-sm font-bold text-neutral-900 dark:text-white hover:underline">{r.ticker}</Link>
                                ) : (
                                  <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{r.ticker}</span>
                                )}
                                {badge && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${badge.cls}`}>{badge.label}</span>}
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${chip.cls}`}>{chip.label}</span>
                              </div>
                              {r.companyName && r.companyName.toUpperCase() !== r.ticker.toUpperCase() && (
                                <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[220px]">{r.companyName}</div>
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
                        />
                        <TdMetric
                          value={r.hasReported ? formatEps(r.epsActual) : (r.epsEstimate != null ? formatEps(r.epsEstimate) : '-')}
                          sub={r.hasReported && r.epsEstimate != null ? `Est: ${formatEps(r.epsEstimate)}` : !r.hasReported && r.epsEstimate != null ? 'est.' : undefined}
                          delta={r.epsSurprisePercent}
                        />
                        <TdMetric
                          value={r.hasReported ? formatRevenue(r.revenueActual) : (r.revenueEstimate != null ? formatRevenue(r.revenueEstimate) : '-')}
                          sub={r.hasReported && r.revenueEstimate != null ? `Est: ${formatRevenue(r.revenueEstimate)}` : !r.hasReported && r.revenueEstimate != null ? 'est.' : undefined}
                          delta={r.revenueSurprisePercent}
                        />
                      </tr>
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
                const linked = eligibleTickers.has(r.ticker);
                return (
                  <div key={`${r.ticker}-${r.date}-m`} className="p-3">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <CompanyLogo ticker={r.ticker} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {linked ? (
                            <Link href={`/analysis/${r.ticker}`} className="text-sm font-bold text-neutral-900 dark:text-white hover:underline">{r.ticker}</Link>
                          ) : (
                            <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{r.ticker}</span>
                          )}
                          {badge && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${badge.cls}`}>{badge.label}</span>}
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${chip.cls}`}>{chip.label}</span>
                        </div>
                        {r.companyName && r.companyName.toUpperCase() !== r.ticker.toUpperCase() && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{r.companyName}</div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <CardMetric label="Price" value={r.price != null ? `$${r.price.toFixed(2)}` : '-'} delta={r.priceChangePct} />
                      <CardMetric label="Mkt Cap" value={formatMcap(r.marketCap) || '-'} delta={r.marketCapDiff} deltaText={r.marketCapDiff != null ? formatSignedMcap(r.marketCapDiff) : undefined} />
                      <CardMetric label="EPS" value={r.hasReported ? formatEps(r.epsActual) : formatEps(r.epsEstimate)} sub={r.hasReported && r.epsEstimate != null ? `Est ${formatEps(r.epsEstimate)}` : undefined} delta={r.epsSurprisePercent} />
                      <CardMetric label="Revenue" value={r.hasReported ? formatRevenue(r.revenueActual) : formatRevenue(r.revenueEstimate)} sub={r.hasReported && r.revenueEstimate != null ? `Est ${formatRevenue(r.revenueEstimate)}` : undefined} delta={r.revenueSurprisePercent} />
                    </div>
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
