'use client';

/**
 * EarningsDayExplorer — earningstable.com-style layout: month calendar rail on
 * the left, compact sortable day-table on the right with Daily Earnings
 * Scorecard, outcome filters, sigma-move badges, 4Q beat-streak dots, and an
 * expandable row detail drawer.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, X, Calendar as CalendarIcon } from 'lucide-react';
import MonthCalendar from '@/components/MonthCalendar';
import {
  parseDate,
  formatDayLong,
  isDoubleBeat,
  isEpsBeat,
  isAnyMiss,
  SESSION_FILTERS,
  STATUS_FILTERS,
  FilterChip,
  sortValue,
  type SessionFilter,
  type StatusFilter,
  type SortKey,
  type SortDir,
  type EarningsBucketCounts,
  type EarningsScorecardStats,
} from '@/components/earnings/EarningsDayPrimitives';
import {
  EarningsDailyScorecard,
  EarningsDayResultsView,
} from '@/components/earnings/EarningsDayTableAndCards';
import type { EarningsSSRRow } from '@/lib/seo/earningsSSR';
import type { EarningsTickerDetail } from '@/app/api/earnings/detail/route';

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
  const [showAllRows, setShowAllRows] = useState(false);

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
    setShowAllRows(false);
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

  // Live refresh: pull fresh rows on mount and every 60s while the tab is visible
  useEffect(() => {
    void fetchDay(selectedDate, true);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchDay(selectedDate, true);
    }, 60_000);
    return () => clearInterval(id);
  }, [selectedDate, fetchDay]);

  const allRows = useMemo(() => rowsByDate[selectedDate] ?? [], [rowsByDate, selectedDate]);

  // Prefetch 4Q beat-streak + news for the top 8 companies by market cap
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

  const { bucketCounts, scorecard, epsEstimateCount, revEstimateCount } = useMemo(() => {
    const c: EarningsBucketCounts = {
      bmo: 0, amc: 0, tbd: 0,
      reported: 0, upcoming: 0,
      doubleBeat: 0, epsBeat: 0, miss: 0,
    };
    let epsBeats = 0, epsTotal = 0;
    let revBeats = 0, revTotal = 0;
    let doubleMisses = 0;
    let epsEst = 0, revEst = 0;
    const epsSurprises: number[] = [];
    let bestMover: EarningsSSRRow | null = null;
    let worstMover: EarningsSSRRow | null = null;

    for (const r of allRows) {
      if (r.time === 'bmo') c.bmo++;
      else if (r.time === 'amc') c.amc++;
      else c.tbd++;

      if (r.epsEstimate != null) epsEst++;
      if (r.revenueEstimate != null) revEst++;

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

    const sc: EarningsScorecardStats = {
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
    };

    return { bucketCounts: c, scorecard: sc, epsEstimateCount: epsEst, revEstimateCount: revEst };
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

  const visibleRows = useMemo(
    () => (showAllRows || search.trim().length > 0 ? sortedRows : sortedRows.slice(0, 50)),
    [sortedRows, showAllRows, search],
  );
  const hiddenRowCount = sortedRows.length - visibleRows.length;

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
        {allRows.length > 0 && (
          <EarningsDailyScorecard
            reported={reported}
            totalCount={allRows.length}
            epsEstimateCount={epsEstimateCount}
            revEstimateCount={revEstimateCount}
            bucketCounts={bucketCounts}
            scorecard={scorecard}
            onToggleExpand={toggleExpand}
          />
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
          <EarningsDayResultsView
            visibleRows={visibleRows}
            sortedCount={sortedRows.length}
            hiddenRowCount={hiddenRowCount}
            sortKey={sortKey}
            sortDir={sortDir}
            expandedTicker={expandedTicker}
            detailsBySymbol={detailsBySymbol}
            loadingSymbol={loadingSymbol}
            eligibleTickers={eligibleTickers}
            onSort={handleSort}
            onToggleExpand={toggleExpand}
            onShowAll={() => setShowAllRows(true)}
          />
        )}
      </div>
    </div>
  );
}
