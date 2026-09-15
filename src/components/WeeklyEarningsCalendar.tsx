'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { format, addDays, subWeeks, addWeeks, startOfWeek, isSameDay, isWeekend } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Coffee, Search, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { isMarketHoliday } from '@/lib/utils/timeUtils';
import type { EarningsSSRRow, EarningsSSRGroup } from '@/lib/seo/earningsSSR';

// Helper to get ET current date
const getETDate = () => {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
};

interface EarningsData {
  ticker: string;
  companyName: string;
  time: string;
}

interface DayEarnings {
  date: string;
  preMarket: EarningsData[];
  afterMarket: EarningsData[];
  timeTbd: EarningsData[];
}

interface WeeklyEarningsResponse {
  success: boolean;
  data: Record<string, DayEarnings>;
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
    case 'bmo': return 'Pre';
    case 'amc': return 'After';
    case 'dmt': return 'During';
    default: return 'TBD';
  }
}

function timeColor(time: string): string {
  switch (time) {
    case 'bmo': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
    case 'amc': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
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

// ─── Sortable column definition ──────────────────────────────────────────────

type SortKey = 'ticker' | 'companyName' | 'marketCap' | 'epsEstimate' | 'epsActual' | 'epsSurprisePercent' | 'revenueEstimate' | 'revenueActual' | 'time';
type SortDir = 'asc' | 'desc';

interface ColumnDef {
  key: SortKey;
  label: string;
  align: 'left' | 'right';
  className?: string;
  mobileHidden?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'ticker', label: 'Ticker', align: 'left' },
  { key: 'companyName', label: 'Company', align: 'left', className: 'hidden md:table-cell' },
  { key: 'time', label: 'Time', align: 'left' },
  { key: 'epsEstimate', label: 'EPS Est.', align: 'right' },
  { key: 'epsActual', label: 'EPS Act.', align: 'right' },
  { key: 'epsSurprisePercent', label: 'Surprise', align: 'right' },
  { key: 'revenueEstimate', label: 'Rev Est.', align: 'right', className: 'hidden lg:table-cell' },
  { key: 'revenueActual', label: 'Rev Act.', align: 'right', className: 'hidden lg:table-cell' },
  { key: 'marketCap', label: 'Mkt Cap', align: 'right', className: 'hidden sm:table-cell' },
];

// ─── Earnings detail table row ───────────────────────────────────────────────

function EarningsDetailRow({
  row,
  eligible,
  marketCap,
}: {
  row: EarningsSSRRow;
  eligible: Set<string>;
  marketCap?: number | null;
}) {
  const surprise = row.epsSurprisePercent;
  const surpriseClass =
    surprise != null
      ? surprise >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400'
      : '';
  const isEligible = eligible.has(row.ticker);
  const capCat = marketCapCategory(marketCap ?? null);

  return (
    <tr className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 shrink-0 flex items-center justify-center">
            <CompanyLogo ticker={row.ticker} size={28} />
          </div>
          <div className="min-w-0">
            {isEligible ? (
              <Link href={`/analysis/${row.ticker}`} className="font-semibold text-neutral-900 dark:text-white hover:underline">
                {row.ticker}
              </Link>
            ) : (
              <span className="font-semibold text-neutral-500 dark:text-neutral-400">{row.ticker}</span>
            )}
            {capCat && (
              <span className={`ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded ${marketCapColor(capCat)}`}>
                {capCat}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-neutral-700 dark:text-neutral-300 max-w-[200px] truncate hidden md:table-cell">
        {row.companyName}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${timeColor(row.time)}`}>
          {timeLabel(row.time)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
        {formatEps(row.epsEstimate)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
        {row.hasReported ? formatEps(row.epsActual) : '-'}
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${surpriseClass}`}>
        {surprise != null ? formatPercent(surprise) : '-'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400 hidden lg:table-cell">
        {formatRevenue(row.revenueEstimate)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-700 dark:text-neutral-300 hidden lg:table-cell">
        {row.hasReported ? formatRevenue(row.revenueActual) : '-'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">
        {marketCap != null ? formatRevenue(marketCap) : '-'}
      </td>
    </tr>
  );
}

// ─── Sortable header cell ────────────────────────────────────────────────────

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
      className={`px-3 py-2.5 ${alignClass} text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors select-none ${col.className ?? ''}`}
    >
      <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
        {col.label}
        {isActive ? (
          sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
        ) : (
          <ArrowUpDown size={11} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

// ─── Earnings detail table with search + sort ────────────────────────────────

function EarningsDetailTable({
  group,
  eligible,
  marketCapMap,
}: {
  group: EarningsSSRGroup | null;
  eligible: Set<string>;
  marketCapMap: Map<string, number | null>;
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
    if (!group) return [];
    return [...group.preMarket, ...group.afterMarket, ...group.timeTbd];
  }, [group]);

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
      let aVal: any;
      let bVal: any;

      // For marketCap, use the map
      if (sortKey === 'marketCap') {
        aVal = marketCapMap.get(a.ticker) ?? null;
        bVal = marketCapMap.get(b.ticker) ?? null;
      } else {
        aVal = a[sortKey as keyof EarningsSSRRow];
        bVal = b[sortKey as keyof EarningsSSRRow];
      }

      // Nulls always go to the end
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
  }, [filteredRows, sortKey, sortDir, marketCapMap]);

  if (!group || group.total === 0) {
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
      {/* Search bar — sticky */}
      <div className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
        <Search size={14} className="text-neutral-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${group.total} earnings...`}
          className="flex-1 text-sm bg-transparent text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none"
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
        <span className="text-xs text-neutral-400 whitespace-nowrap shrink-0">
          {sortedRows.length} / {group.total}
        </span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-auto max-h-[calc(100vh-280px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
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
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {sortedRows.map(r => (
              <EarningsDetailRow
                key={`${r.ticker}-${r.date}`}
                row={r}
                eligible={eligible}
                marketCap={marketCapMap.get(r.ticker) ?? null}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-neutral-100 dark:divide-neutral-800">
        {sortedRows.map(r => {
          const isEligible = eligible.has(r.ticker);
          const surprise = r.epsSurprisePercent;
          const surpriseClass = surprise != null
            ? surprise >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            : '';
          return (
            <div key={`${r.ticker}-${r.date}`} className="p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                  <CompanyLogo ticker={r.ticker} size={28} />
                </div>
                <div className="min-w-0 flex-1">
                  {isEligible ? (
                    <Link href={`/analysis/${r.ticker}`} className="font-semibold text-neutral-900 dark:text-white hover:underline">
                      {r.ticker}
                    </Link>
                  ) : (
                    <span className="font-semibold text-neutral-500 dark:text-neutral-400">{r.ticker}</span>
                  )}
                  <span className={`ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded ${timeColor(r.time)}`}>
                    {timeLabel(r.time)}
                  </span>
                </div>
                {marketCapMap.get(r.ticker) != null && (
                  <span className="text-xs font-medium tabular-nums text-neutral-600 dark:text-neutral-400">
                    {formatRevenue(marketCapMap.get(r.ticker) ?? null)}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mb-2">{r.companyName}</p>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase">EPS Est</div>
                  <div className="tabular-nums text-neutral-700 dark:text-neutral-300">{formatEps(r.epsEstimate)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase">EPS Act</div>
                  <div className="tabular-nums text-neutral-700 dark:text-neutral-300">{r.hasReported ? formatEps(r.epsActual) : '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase">Surprise</div>
                  <div className={`tabular-nums font-semibold ${surpriseClass}`}>
                    {surprise != null ? formatPercent(surprise) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase">Rev Est</div>
                  <div className="tabular-nums text-neutral-700 dark:text-neutral-300">{formatRevenue(r.revenueEstimate)}</div>
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
  date,
  dayData,
  isToday,
  isSelected,
  isHoliday,
  onClick,
}: {
  date: Date;
  dayData: DayEarnings | undefined;
  isToday: boolean;
  isSelected: boolean;
  isHoliday: boolean;
  onClick: () => void;
}) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const totalForDay = dayData ? (dayData.preMarket?.length + dayData.afterMarket?.length + dayData.timeTbd?.length) : 0;
  const weekend = isWeekend(date);

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center rounded-lg sm:rounded-xl py-1.5 sm:py-3 px-0.5 sm:px-2 transition-all min-h-[40px] sm:min-h-[72px] ${
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
        {format(date, 'd')}
      </span>
      {totalForDay > 0 && (
        <span className={`mt-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
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
  initialWeeklyData,
  initialEarningsGroups,
  eligibleTickers = new Set(),
  marketCapMap: initialMarketCapMap,
}: {
  initialWeeklyData?: Record<string, DayEarnings> | null;
  initialEarningsGroups?: EarningsSSRGroup[] | null;
  eligibleTickers?: Set<string>;
  marketCapMap?: Map<string, number | null>;
}) {
  const [currentDate, setCurrentDate] = useState(() => {
    const et = getETDate();
    return startOfWeek(et, { weekStartsOn: 1 });
  });

  const [selectedDate, setSelectedDate] = useState<Date>(getETDate());
  const [weeklyData, setWeeklyData] = useState<Record<string, DayEarnings>>(() => initialWeeklyData ?? {});
  const [loading, setLoading] = useState(() => !initialWeeklyData);
  const [error, setError] = useState<string | null>(null);

  // SSR earnings groups — keyed by date for O(1) lookup
  const [earningsGroupsMap, setEarningsGroupsMap] = useState<Record<string, EarningsSSRGroup>>(() => {
    const map: Record<string, EarningsSSRGroup> = {};
    if (initialEarningsGroups) {
      for (const g of initialEarningsGroups) {
        map[g.date] = g;
      }
    }
    return map;
  });

  // Market cap map (passed from SSR or empty)
  const [marketCapMap] = useState<Map<string, number | null>>(() => initialMarketCapMap ?? new Map());

  // 7 days of the selected week (Mon-Sun, includes weekends like earningstable.com)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(currentDate, i));
  }, [currentDate]);

  const startDateStr = format(weekDays[0]!, 'yyyy-MM-dd');
  const endDateStr = format(weekDays[6]!, 'yyyy-MM-dd');

  // Track if initial SSR data was for this week
  const ssrWeekStart = useMemo(() => {
    if (!initialWeeklyData) return null;
    const et = getETDate();
    return format(startOfWeek(et, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }, [initialWeeklyData]);

  useEffect(() => {
    if (ssrWeekStart === startDateStr && initialWeeklyData) return;

    const fetchWeekData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/earnings/week?start=${startDateStr}`);
        if (!res.ok) throw new Error('Failed to fetch data');
        const json: WeeklyEarningsResponse = await res.json();
        if (json.success) {
          setWeeklyData(json.data);
        } else {
          throw new Error('API returned unsuccessful response');
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load weekly earnings');
      } finally {
        setLoading(false);
      }
    };

    fetchWeekData();
  }, [startDateStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrevWeek = () => setCurrentDate(prev => subWeeks(prev, 1));
  const handleNextWeek = () => setCurrentDate(prev => addWeeks(prev, 1));
  const handleThisWeek = () => setCurrentDate(startOfWeek(getETDate(), { weekStartsOn: 1 }));

  // Calculate totals
  const totals = useMemo(() => {
    let total = 0;
    let pre = 0;
    let after = 0;

    Object.values(weeklyData).forEach(day => {
      pre += day.preMarket?.length || 0;
      after += day.afterMarket?.length || 0;
      total += (day.preMarket?.length || 0) + (day.afterMarket?.length || 0) + (day.timeTbd?.length || 0);
    });

    return { total, pre, after };
  }, [weeklyData]);

  const todayET = getETDate();
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedGroup = earningsGroupsMap[selectedDateStr] ?? null;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Earnings Calendar</h2>
          <span className="text-sm text-neutral-500 dark:text-neutral-400 tabular-nums">
            {startDateStr} — {endDateStr}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Stats */}
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

          {/* Navigation */}
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

      {/* Two-column layout: calendar sidebar + earnings table */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Calendar sidebar */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 p-3">
          {/* Day name headers */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {dayNames.map(d => (
              <div key={d} className="text-center text-[10px] sm:text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="min-h-[40px] sm:min-h-[72px] rounded-lg sm:rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center text-red-500 text-sm">{error}</div>
          ) : (
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {weekDays.map((date) => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const dayData = weeklyData[dateStr];
                const isToday = isSameDay(date, todayET);
                const isSelected = isSameDay(date, selectedDate);
                const noonUTC = new Date(`${dateStr}T12:00:00Z`);
                const isHoliday = isMarketHoliday(noonUTC);

                return (
                  <CalendarDayCell
                    key={dateStr}
                    date={date}
                    dayData={dayData}
                    isToday={isToday}
                    isSelected={isSelected}
                    isHoliday={isHoliday}
                    onClick={() => setSelectedDate(date)}
                  />
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] sm:text-xs text-neutral-400 dark:text-neutral-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-600" />
              <span>Selected</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500/40" />
              <span>Today</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-neutral-200 dark:bg-neutral-700" />
              <span>Has earnings</span>
            </div>
          </div>

          {/* Selected date info */}
          <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 uppercase tracking-wider font-semibold mb-1">
              Selected Date
            </div>
            <div className="text-sm font-bold text-neutral-900 dark:text-white">
              {format(selectedDate, 'EEEE, MMMM d')}
            </div>
            {selectedGroup && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {selectedGroup.total} earnings scheduled
              </div>
            )}
          </div>
        </div>

        {/* Earnings table */}
        <div>
          <EarningsDetailTable
            group={selectedGroup}
            eligible={eligibleTickers}
            marketCapMap={marketCapMap}
          />
        </div>
      </div>
    </div>
  );
}
