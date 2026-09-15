'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { format, addDays, subWeeks, addWeeks, startOfWeek, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Coffee } from 'lucide-react';
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
    case 'bmo': return 'Pre-Mkt';
    case 'amc': return 'After-Hrs';
    case 'dmt': return 'During';
    default: return 'TBD';
  }
}

function timeColor(time: string): string {
  switch (time) {
    case 'bmo': return 'text-yellow-600 dark:text-yellow-400';
    case 'amc': return 'text-purple-600 dark:text-purple-400';
    default: return 'text-gray-500';
  }
}

// Detailed table row for the selected date
function EarningsDetailRow({ row, eligible }: { row: EarningsSSRRow; eligible: Set<string> }) {
  const surprise = row.epsSurprisePercent;
  const surpriseClass =
    surprise != null
      ? surprise >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400'
      : '';
  const isEligible = eligible.has(row.ticker);

  return (
    <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60">
      <td className="px-3 py-2 font-semibold">
        {isEligible ? (
          <Link href={`/analysis/${row.ticker}`} className="hover:underline">{row.ticker}</Link>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">{row.ticker}</span>
        )}
      </td>
      <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate">{row.companyName}</td>
      <td className={`px-3 py-2 text-xs font-medium ${timeColor(row.time)}`}>{timeLabel(row.time)}</td>
      <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">{formatEps(row.epsEstimate)}</td>
      <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
        {row.hasReported ? formatEps(row.epsActual) : '-'}
      </td>
      <td className={`px-3 py-2 tabular-nums font-semibold ${surpriseClass}`}>
        {surprise != null ? formatPercent(surprise) : '-'}
      </td>
      <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">{formatRevenue(row.revenueEstimate)}</td>
      <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
        {row.hasReported ? formatRevenue(row.revenueActual) : '-'}
      </td>
    </tr>
  );
}

function EarningsDetailTable({ group, eligible }: { group: EarningsSSRGroup | null; eligible: Set<string> }) {
  if (!group || group.total === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500">
        No earnings scheduled for this date.
      </div>
    );
  }
  const allRows = [...group.preMarket, ...group.afterMarket, ...group.timeTbd];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr className="text-left text-slate-600 dark:text-slate-400">
              <th className="px-3 py-2">Ticker</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">EPS Est.</th>
              <th className="px-3 py-2">EPS Actual</th>
              <th className="px-3 py-2">Surprise</th>
              <th className="px-3 py-2">Rev Est.</th>
              <th className="px-3 py-2">Rev Actual</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => <EarningsDetailRow key={`${r.ticker}-${r.date}`} row={r} eligible={eligible} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WeeklyEarningsCalendar({
  initialWeeklyData,
  initialEarningsGroups,
  eligibleTickers = new Set(),
}: {
  initialWeeklyData?: Record<string, DayEarnings> | null;
  initialEarningsGroups?: EarningsSSRGroup[] | null;
  eligibleTickers?: Set<string>;
}) {
  // Start week at Monday for the given current time
  const [currentDate, setCurrentDate] = useState(() => {
    const et = getETDate();
    return startOfWeek(et, { weekStartsOn: 1 });
  });

  const [selectedDate, setSelectedDate] = useState<Date>(getETDate());
  const [weeklyData, setWeeklyData] = useState<Record<string, DayEarnings>>(() => initialWeeklyData ?? {});
  const [loading, setLoading] = useState(() => !initialWeeklyData);
  const [error, setError] = useState<string | null>(null);

  // SSR earnings groups (with EPS/revenue) — keyed by date for O(1) lookup
  const [earningsGroupsMap, setEarningsGroupsMap] = useState<Record<string, EarningsSSRGroup>>(() => {
    const map: Record<string, EarningsSSRGroup> = {};
    if (initialEarningsGroups) {
      for (const g of initialEarningsGroups) {
        map[g.date] = g;
      }
    }
    return map;
  });

  // Compute the 5 days of the selected week (Mon-Fri)
  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }).map((_, i) => addDays(currentDate, i));
  }, [currentDate]);

  const startDateStr = format(weekDays[0]!, 'yyyy-MM-dd');
  const endDateStr = format(weekDays[4]!, 'yyyy-MM-dd');

  // Track if initial SSR data was for this week (skip redundant fetch)
  const ssrWeekStart = useMemo(() => {
    if (!initialWeeklyData) return null;
    const et = getETDate();
    return format(startOfWeek(et, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }, [initialWeeklyData]);

  useEffect(() => {
    // Skip fetch if SSR data matches current week
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

  // Fetch detailed earnings groups when week changes (if not in SSR data)
  useEffect(() => {
    const weekEndStr = format(weekDays[4]!, 'yyyy-MM-dd');
    // Check if we already have all 5 days in SSR data
    const hasAllDays = weekDays.every((d) => {
      const ds = format(d, 'yyyy-MM-dd');
      return earningsGroupsMap[ds] !== undefined;
    });
    if (hasAllDays) return;

    const fetchDetailed = async () => {
      try {
        const res = await fetch(`/api/earnings/dates?start=${startDateStr}&end=${weekEndStr}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data) {
          // json.data is an array of { date, count } — not full groups
          // We need the full groups with EPS data. Fetch from a different endpoint.
        }
      } catch {
        // Silent fail — SSR data is the primary source
      }
    };
    fetchDetailed();
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

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Earnings Calendar</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
            {startDateStr} — {endDateStr}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Stats */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md tabular-nums">
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
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            <button 
              onClick={handlePrevWeek}
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
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
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
              aria-label="Next week"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50 h-[500px] xl:h-[600px] flex flex-col overflow-hidden">
              <div className="px-3 py-3 border-b border-gray-50 dark:border-gray-800/80">
                <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
                <div className="h-2 w-16 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" />
              </div>
              <div className="p-3 flex-1 space-y-4">
                <div className="space-y-2">
                  <div className="h-2 w-16 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" />
                  <div className="flex gap-2">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="w-11 h-11 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-16 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" />
                  <div className="flex gap-2">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={j} className="w-11 h-11 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {error && (
        <div className="py-20 text-center text-red-500">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {weekDays.map((date) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayData = weeklyData[dateStr];
            const isToday = isSameDay(date, todayET);
            
            // Fix timezone shift: create date at noon UTC to ensure it evaluates to the correct calendar day
            const noonUTC = new Date(`${dateStr}T12:00:00Z`);
            const isHoliday = isMarketHoliday(noonUTC);
            
            const totalForDay = dayData ? (dayData.preMarket?.length + dayData.afterMarket?.length + dayData.timeTbd?.length) : 0;
            const isSelected = isSameDay(date, selectedDate);

            return (
              <div 
                key={dateStr} 
                onClick={() => setSelectedDate(date)}
                className={`snap-center rounded-xl overflow-hidden border cursor-pointer transition-all h-[500px] xl:h-[600px] flex flex-col ${
                  isToday 
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10' 
                    : isSelected
                      ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700'
                      : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50 hover:border-gray-200 dark:hover:border-gray-700'
                }`}
              >
                {/* Column Header */}
                <div className={`px-3 py-2.5 flex justify-between items-center border-b ${
                  isToday 
                    ? 'border-blue-100 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-900/20' 
                    : 'border-gray-50 dark:border-gray-800/80'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold text-xs uppercase tracking-wider ${
                      isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {format(date, 'EEEE')}
                    </span>
                    {isToday && (
                      <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase">Today</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium">
                    <span>{format(date, 'MMM d')}</span>
                    {!isHoliday && totalForDay > 0 && (
                      <span className="font-semibold text-gray-500 dark:text-gray-400">{totalForDay}</span>
                    )}
                  </div>
                </div>

                {/* Column Content */}
                <div className="p-3 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {isHoliday ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 pt-10">
                      <Coffee size={28} className="mb-3 opacity-30 text-orange-500 dark:text-orange-400" />
                      <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-widest">Market Holiday</span>
                      <span className="text-xs text-center mt-2 px-4 leading-relaxed">No earnings are scheduled on public holidays.</span>
                    </div>
                  ) : (!dayData || totalForDay === 0) ? (
                    <div className="h-full flex flex-col items-center pt-20 text-gray-300 dark:text-gray-600">
                      <CalendarIcon size={28} className="mb-2 opacity-30" />
                      <span className="text-sm font-medium">No reports</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5">
                      <EarningsSection 
                        title="PRE-MARKET" 
                        color="bg-yellow-400" 
                        data={dayData.preMarket} 
                        eligible={eligibleTickers}
                      />
                      <EarningsSection 
                        title="AFTER-HOURS" 
                        color="bg-purple-500" 
                        data={dayData.afterMarket} 
                        eligible={eligibleTickers}
                      />
                      <EarningsSection 
                        title="TIME TBD" 
                        color="bg-gray-400" 
                        data={dayData.timeTbd} 
                        eligible={eligibleTickers}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed Earnings Table for the Selected Date */}
      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">
          Details for {format(selectedDate, 'EEEE, MMMM d')}
        </h3>
        <EarningsDetailTable group={selectedGroup} eligible={eligibleTickers} />
      </div>

    </div>
  );
}

// Subcomponent for each time section
function EarningsSection({ title, color, data, eligible }: { title: string, color: string, data?: EarningsData[], eligible: Set<string> }) {
  if (!data || data.length === 0) return null;

  const handleTickerClick = (ticker: string) => {
    if (!eligible.has(ticker)) return; // Don't navigate if not eligible
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mobile-nav-change', {
        detail: { tab: 'analysis', ticker }
      }));
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 tracking-wider uppercase">{title}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {data.map((item, idx) => {
          const isEligible = eligible.has(item.ticker);
          return (
            <button
              key={`${item.ticker}-${idx}`}
              onClick={() => handleTickerClick(item.ticker)}
              disabled={!isEligible}
              className={`w-11 h-11 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg border shadow-sm transition-all group relative overflow-hidden ${
                isEligible
                  ? 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md cursor-pointer'
                  : 'border-gray-100 dark:border-gray-800 opacity-60 cursor-default'
              }`}
              title={item.companyName || item.ticker}
            >
              <div className="w-7 h-7 flex items-center justify-center relative z-10">
                <CompanyLogo ticker={item.ticker} size={28} />
              </div>
              {/* Ticker fallback visible if logo fails or on hover (only for eligible) */}
              {isEligible && (
                <div className="absolute inset-0 bg-gray-900/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <span className="text-[10px] font-bold text-white px-1 truncate">{item.ticker}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
