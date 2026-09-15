'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { addDays, subWeeks, addWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Coffee, Search, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { isMarketHoliday } from '@/lib/utils/timeUtils';
import type { EarningsSSRRow, EarningsWeekDay } from '@/lib/seo/earningsSSR';

// Parse YYYY-MM-DD as noon-UTC — deterministic across server/client timezones
const parseDate = (s: string) => new Date(`${s}T12:00:00Z`);
const dateStr = (d: Date) => d.toISOString().split('T')[0] ?? '';

// Timezone-safe formatters — always read UTC fields of the noon-UTC instant
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const formatDayLong = (d: Date) => `${DAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;

interface WeeklyEarningsResponse {
  success: boolean;
  data: Record<string, EarningsWeekDay>;
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatEps(value: number | null): string {
  if (value == null) return '-';
  return `$${value.toFixed(2)}`;
}

function formatRevenue(value: number | null): string {
  if (value == null) return '-';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

function formatPercent(value: number | null): string {
  if (value == null) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function timeLabel(time: string): string {
  switch (time) {
    case 'bmo': case 'before': return 'Pre';
    case 'amc': case 'after': return 'After';
    case 'dmt': return 'During';
    default: return 'TBD';
  }
}

function timeColor(time: string): string {
  switch (time) {
    case 'bmo': case 'before': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
    case 'amc': case 'after': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
    default: return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400';
  }
}

function marketCapCategory(marketCap: number | null): string {
  if (marketCap == null) return '';
  if (marketCap >= 2e11) return 'Mega';
  if (marketCap >= 1e10) return 'Large';
  if (marketCap >= 2e9) return 'Mid';
  return 'Small';
}

function marketCapColor(category: string): string {
  switch (category) {
    case 'Mega': return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
    case 'Large': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    case 'Mid': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
    case 'Small': return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
    default: return '';
  }
}

// ─── Sortable columns ─────────────────────────────────────────────────────────

type SortKey = 'ticker' | 'companyName' | 'marketCap' | 'epsEstimate' | 'epsActual' | 'epsSurprisePercent' | 'revenueEstimate' | 'revenueActual' | 'time';
type SortDir = 'asc' | 'desc';

interface ColumnDef {
  key: SortKey;
  label: string;
  align: 'left' | 'right';
  className?: string;
}

// Compact columns — no horizontal scroll. EPS and Revenue each combine est+act in one cell.
const COLUMNS: ColumnDef[] = [
  { key: 'ticker', label: 'Ticker', align: 'left' },
  { key: 'companyName', label: 'Company', align: 'left', className: 'hidden lg:table-cell' },
  { key: 'time', label: 'Time', align: 'left' },
  { key: 'epsEstimate', label: 'EPS', align: 'right' },
  { key: 'epsSurprisePercent', label: 'Surprise', align: 'right' },
  { key: 'revenueEstimate', label: 'Revenue', align: 'right' },
  { key: 'marketCap', label: 'Mkt Cap', align: 'right', className: 'hidden md:table-cell' },
];

// ─── Table row ────────────────────────────────────────────────────────────────

function EarningsDetailRow({ row, eligible }: { row: EarningsSSRRow; eligible: Set<string> }) {
  const surprise = row.epsSurprisePercent;
  const surpriseClass =
    surprise != null
      ? surprise >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400'
      : '';
  const isEligible = eligible.has(row.ticker);
  const capCat = marketCapCategory(row.marketCap);

  return (
    <tr className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 shrink-0 flex items-center justify-center">
            <CompanyLogo ticker={row.ticker} size={26} />
          </div>
          <div className="min-w-0">
            {isEligible ? (
              <Link href={`/analysis/${row.ticker}`} className="font-semibold text-neutral-900 dark:text-white hover:underline text-sm">
                {row.ticker}
              </Link>
            ) : (
              <span className="font-semibold text-neutral-500 dark:text-neutral-400 text-sm">{row.ticker}</span>
            )}
            {capCat && (
              <span className={`ml-1 text-[9px] font-bold px-1 py-0.5 rounded ${marketCapColor(capCat)}`}>
                {capCat}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-neutral-700 dark:text-neutral-300 max-w-[180px] truncate hidden lg:table-cell">
        {row.companyName}
      </td>
      <td className="px-2 py-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${timeColor(row.time)}`}>
          {timeLabel(row.time)}
        </span>
      </td>
      {/* EPS: actual (reported) bold on top, estimate muted below */}
      <td className="px-2 py-1.5 text-right">
        <div className="tabular-nums text-xs font-semibold text-neutral-800 dark:text-neutral-200">
          {row.hasReported ? formatEps(row.epsActual) : '—'}
        </div>
        <div className="tabular-nums text-[10px] text-neutral-400 dark:text-neutral-500">
          est {formatEps(row.epsEstimate)}
        </div>
      </td>
      <td className={`px-2 py-2 text-right tabular-nums text-xs font-semibold ${surpriseClass}`}>
        {surprise != null ? formatPercent(surprise) : '-'}
      </td>
      {/* Revenue: actual bold on top, estimate muted below */}
      <td className="px-2 py-1.5 text-right">
        <div className="tabular-nums text-xs font-semibold text-neutral-800 dark:text-neutral-200">
          {row.hasReported ? formatRevenue(row.revenueActual) : '—'}
        </div>
        <div className="tabular-nums text-[10px] text-neutral-400 dark:text-neutral-500">
          est {formatRevenue(row.revenueEstimate)}
        </div>
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-xs text-neutral-600 dark:text-neutral-400 hidden md:table-cell">
        {row.marketCap != null ? formatRevenue(row.marketCap) : '-'}
      </td>
    </tr>
  );
}

// ─── Sortable header ─────────────────────────────────────────────────────────

function SortableHeader({
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  col: ColumnDef;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === col.key;
  const alignClass = col.align === 'right' ? 'text-right' : 'text-left';

  return (
    <th
      scope="col"
      onClick={() => onSort(col.key)}
      className={`px-2 py-2 ${alignClass} text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors select-none whitespace-nowrap ${col.className ?? ''}`}
    >
      <span className={`inline-flex items-center gap-0.5 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
        {col.label}
        {isActive ? (
          sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

// ─── Detail table for selected date ──────────────────────────────────────────

function EarningsDetailTable({
  day,
  eligible,
}: {
  day: EarningsWeekDay | undefined;
  eligible: Set<string>;
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  const allRows = useMemo(() => {
    if (!day) return [];
    return [...day.preMarket, ...day.afterMarket, ...day.timeTbd];
  }, [day]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter(r =>
      r.ticker.toLowerCase().includes(q) ||
      r.companyName.toLowerCase().includes(q)
    );
  }, [allRows, search]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
    return sorted;
  }, [filteredRows, sortKey, sortDir]);

  const total = allRows.length;

  if (!day || total === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 text-center">
        <CalendarIcon size={32} className="mx-auto mb-3 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">No earnings scheduled</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Select another date to view earnings reports.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-neutral-200 dark:border-neutral-800">
        <Search size={14} className="text-neutral-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${total} earnings...`}
          className="flex-1 text-sm bg-transparent text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none min-w-0"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="p-0.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
        <span className="text-xs text-neutral-400 whitespace-nowrap shrink-0 tabular-nums">
          {sortedRows.length} / {total}
        </span>
      </div>

      {/* Desktop table — compact, no horizontal scroll */}
      <div className="hidden sm:block">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="bg-neutral-50 dark:bg-neutral-950/50">
              {COLUMNS.map(col => (
                <SortableHeader
                  key={col.key}
                  col={col}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(r => (
              <EarningsDetailRow key={r.ticker} row={r} eligible={eligible} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden divide-y divide-neutral-100 dark:divide-neutral-800">
        {sortedRows.map(r => {
          const isEligible = eligible.has(r.ticker);
          const surprise = r.epsSurprisePercent;
          const surpriseClass = surprise != null
            ? surprise >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            : '';
          return (
            <div key={r.ticker} className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                  <CompanyLogo ticker={r.ticker} size={28} />
                </div>
                <div className="min-w-0 flex-1">
                  {isEligible ? (
                    <Link href={`/analysis/${r.ticker}`} className="font-semibold text-neutral-900 dark:text-white hover:underline text-sm">
                      {r.ticker}
                    </Link>
                  ) : (
                    <span className="font-semibold text-neutral-500 dark:text-neutral-400 text-sm">{r.ticker}</span>
                  )}
                  <span className={`ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded ${timeColor(r.time)}`}>
                    {timeLabel(r.time)}
                  </span>
                </div>
                {r.marketCap != null && (
                  <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                    {formatRevenue(r.marketCap)}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mb-2 pl-10">{r.companyName}</p>
              <div className="grid grid-cols-3 gap-2 pl-10">
                <div>
                  <div className="text-[9px] text-neutral-400 uppercase tracking-wider">EPS est / act</div>
                  <div className="tabular-nums text-xs text-neutral-700 dark:text-neutral-300">
                    {formatEps(r.epsEstimate)} <span className="text-neutral-300 dark:text-neutral-600">/</span> {r.hasReported ? formatEps(r.epsActual) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-neutral-400 uppercase tracking-wider">Surprise</div>
                  <div className={`tabular-nums text-xs font-semibold ${surpriseClass}`}>
                    {surprise != null ? formatPercent(surprise) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-neutral-400 uppercase tracking-wider">Rev est / act</div>
                  <div className="tabular-nums text-xs text-neutral-700 dark:text-neutral-300">
                    {formatRevenue(r.revenueEstimate)} <span className="text-neutral-300 dark:text-neutral-600">/</span> {r.hasReported ? formatRevenue(r.revenueActual) : '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Calendar day cell ────────────────────────────────────────────────────────

function CalendarDayCell({
  dayDateStr,
  date,
  dayData,
  isToday,
  isSelected,
  isHoliday,
  onClick,
}: {
  dayDateStr: string;
  date: Date;
  dayData: EarningsWeekDay | undefined;
  isToday: boolean;
  isSelected: boolean;
  isHoliday: boolean;
  onClick: () => void;
}) {
  const totalForDay = dayData ? (dayData.preMarket.length + dayData.afterMarket.length + dayData.timeTbd.length) : 0;
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center rounded-lg sm:rounded-xl py-1.5 sm:py-3 px-0.5 sm:px-2 transition-all min-h-[44px] sm:min-h-[72px] ${
        isSelected
          ? 'bg-blue-600 text-white shadow-md'
          : isToday
            ? 'bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500/40 text-blue-700 dark:text-blue-300'
            : isHoliday || weekend
              ? 'bg-neutral-50 dark:bg-neutral-900/50 text-neutral-300 dark:text-neutral-600'
              : totalForDay > 0
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-700'
                : 'bg-neutral-50 dark:bg-neutral-900/30 text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <span className="text-xs sm:text-sm font-semibold">
        {date.getUTCDate()}
      </span>
      {totalForDay > 0 && (
        <span className={`mt-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
          isSelected
            ? 'bg-white/20 text-white'
            : isToday
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
        }`}>
          {totalForDay}
        </span>
      )}
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function WeeklyEarningsCalendar({
  initialWeekData,
  todayStr,
  initialWeekStartStr,
  eligibleTickers = new Set(),
}: {
  initialWeekData?: Record<string, EarningsWeekDay> | null;
  todayStr: string;
  initialWeekStartStr: string;
  eligibleTickers?: Set<string>;
}) {
  // All dates handled as YYYY-MM-DD strings — deterministic SSR, no hydration mismatch
  const [weekStartStr, setWeekStartStr] = useState(initialWeekStartStr);
  const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
  const [weeklyData, setWeeklyData] = useState<Record<string, EarningsWeekDay>>(() => initialWeekData ?? {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 7 days of the selected week (Mon-Sun)
  const weekDays = useMemo(() => {
    const start = parseDate(weekStartStr);
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [weekStartStr]);

  const startLabel = weekStartStr;
  const endLabel = dateStr(weekDays[6]!);

  // Fetch week data when week changes (skip if it's the SSR-provided initial week)
  useEffect(() => {
    if (weekStartStr === initialWeekStartStr) return;

    let cancelled = false;
    const fetchWeekData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/earnings/week?start=${weekStartStr}`);
        if (!res.ok) throw new Error('Failed to fetch data');
        const json: WeeklyEarningsResponse = await res.json();
        if (cancelled) return;
        if (json.success) {
          setWeeklyData(json.data);
        } else {
          throw new Error('API returned unsuccessful response');
        }
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError('Failed to load weekly earnings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWeekData();
    return () => { cancelled = true; };
  }, [weekStartStr, initialWeekStartStr]);

  const handlePrevWeek = () => setWeekStartStr(prev => dateStr(subWeeks(parseDate(prev), 1)));
  const handleNextWeek = () => setWeekStartStr(prev => dateStr(addWeeks(parseDate(prev), 1)));
  const handleThisWeek = () => {
    setWeekStartStr(initialWeekStartStr);
    setSelectedDateStr(todayStr);
  };

  // Week totals
  const totals = useMemo(() => {
    let total = 0, pre = 0, after = 0;
    for (const day of Object.values(weeklyData)) {
      pre += day.preMarket.length;
      after += day.afterMarket.length;
      total += day.preMarket.length + day.afterMarket.length + day.timeTbd.length;
    }
    return { total, pre, after };
  }, [weeklyData]);

  const selectedDay = weeklyData[selectedDateStr];
  const selectedDateObj = parseDate(selectedDateStr);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Earnings Calendar</h2>
          <span className="text-sm text-neutral-500 dark:text-neutral-400 tabular-nums">
            {startLabel} — {endLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 rounded-md tabular-nums">
              {totals.total} total
            </span>
            <span className="px-2 py-1 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 rounded-md tabular-nums">
              {totals.pre} pre
            </span>
            <span className="px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-md tabular-nums">
              {totals.after} after
            </span>
          </div>

          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleThisWeek}
              className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              This Week
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
              aria-label="Next week"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Two-column layout: calendar left, table right */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Calendar sidebar */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 p-3 self-start">
          <div className="grid grid-cols-7 gap-1 mb-1.5">
            {dayNames.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="min-h-[44px] sm:min-h-[72px] rounded-lg sm:rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="py-8 text-center text-red-500 text-sm">{error}</div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((date) => {
                const ds = dateStr(date);
                const isToday = ds === todayStr;
                const isSelected = ds === selectedDateStr;
                const isHoliday = isMarketHoliday(date);

                return (
                  <CalendarDayCell
                    key={ds}
                    dayDateStr={ds}
                    date={date}
                    dayData={weeklyData[ds]}
                    isToday={isToday}
                    isSelected={isSelected}
                    isHoliday={isHoliday}
                    onClick={() => setSelectedDateStr(ds)}
                  />
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-400 dark:text-neutral-500">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>Selected</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500/40" />
              <span>Today</span>
            </div>
          </div>

          {/* Selected date info */}
          <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 uppercase tracking-wider font-semibold mb-0.5">
              Selected Date
            </div>
            <div className="text-sm font-bold text-neutral-900 dark:text-white">
              {formatDayLong(selectedDateObj)}
            </div>
            {selectedDay && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 tabular-nums">
                {selectedDay.preMarket.length + selectedDay.afterMarket.length + selectedDay.timeTbd.length} earnings scheduled
              </div>
            )}
          </div>
        </div>

        {/* Detail table — updates with selected calendar day */}
        <div className="min-w-0">
          <EarningsDetailTable day={selectedDay} eligible={eligibleTickers} />
        </div>
      </div>
    </div>
  );
}
