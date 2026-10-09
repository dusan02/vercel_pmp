'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DateCount {
  date: string;
  count: number;
}

interface MonthCalendarProps {
  onDateSelect?: (date: string) => void;
  selectedDate?: string;
  initialDateCounts?: DateCount[] | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getETDate(): Date {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function formatDate(d: Date): string {
  // Read LOCAL fields — dates here are constructed as local-noon/midnight.
  // toISOString() would shift the day for users in positive UTC offsets.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISO(dateStr: string): Date {
  // Local noon — immune to DST edges and timezone day-shifts.
  return new Date(`${dateStr}T12:00:00`);
}

/** Monday-anchored week containing anchorDate. */
function getWeekDays(anchorDate: string): Date[] {
  const date = parseISO(anchorDate);
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

/** 42-day grid (6 weeks, Mon-anchored) covering the month of anchorDate. */
function getMonthDays(anchorDate: string): Date[] {
  const anchor = parseISO(anchorDate);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const dayOfWeek = first.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(first);
  start.setDate(first.getDate() + mondayOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

type ViewMode = 'month' | 'week';

export default function MonthCalendar({ onDateSelect, selectedDate, initialDateCounts }: MonthCalendarProps) {
  const todayStr = useMemo(() => formatDate(getETDate()), []);
  const anchor = selectedDate ?? todayStr;

  const [view, setView] = useState<ViewMode>('month');
  const [dateCounts, setDateCounts] = useState<Record<string, number>>(() => {
    if (!initialDateCounts || !Array.isArray(initialDateCounts)) return {};
    const map: Record<string, number> = {};
    for (const d of initialDateCounts) map[d.date] = d.count;
    return map;
  });
  const [loading, setLoading] = useState(() => !initialDateCounts);

  // Fetch available dates with counts (skip if SSR data provided)
  useEffect(() => {
    if (initialDateCounts) return;
    let cancelled = false;
    const fetchDates = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/earnings/dates', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const map: Record<string, number> = {};
          for (const d of json.data as DateCount[]) {
            map[d.date] = d.count;
          }
          if (!cancelled) setDateCounts(map);
        }
      } catch (err) {
        console.error('MonthCalendar: failed to fetch dates', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDates();
    return () => { cancelled = true; };
  }, [initialDateCounts]);

  // The grid is anchored on the selected date so navigation stays in sync.
  const days = useMemo(
    () => (view === 'month' ? getMonthDays(anchor) : getWeekDays(anchor)),
    [view, anchor]
  );

  const anchorDate = parseISO(anchor);
  const monthLabel = `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;

  const step = useCallback(
    (direction: -1 | 1) => {
      const cur = parseISO(anchor);
      if (view === 'month') {
        cur.setDate(1); // avoid month-length overflow (e.g. Mar 31 → Apr 31 → May 1)
        cur.setMonth(cur.getMonth() + direction);
        // keep the day within the target month
        const day = Math.min(anchorDate.getDate(), new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate());
        cur.setDate(day);
      } else {
        cur.setDate(cur.getDate() + direction * 7);
      }
      onDateSelect?.(formatDate(cur));
    },
    [view, anchor, anchorDate, onDateSelect]
  );

  const goToToday = useCallback(() => onDateSelect?.(todayStr), [todayStr, onDateSelect]);

  // Keyboard navigation: arrows move the selected date within the grid.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const cur = parseISO(anchor);
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft': cur.setDate(cur.getDate() - 1); break;
        case 'ArrowRight': cur.setDate(cur.getDate() + 1); break;
        case 'ArrowUp': cur.setDate(cur.getDate() - 7); break;
        case 'ArrowDown': cur.setDate(cur.getDate() + 7); break;
        case 'PageDown': step(1); break;
        case 'PageUp': step(-1); break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        if (e.key !== 'PageDown' && e.key !== 'PageUp') onDateSelect?.(formatDate(cur));
      }
    },
    [anchor, onDateSelect, step]
  );

  const isOtherMonth = (d: Date) => view === 'month' && d.getMonth() !== anchorDate.getMonth();
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-slate-800 p-3 sm:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white truncate">
            {monthLabel}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Earnings Calendar{loading ? ' — loading…' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* View toggle */}
          <div className="flex rounded-lg bg-neutral-100 dark:bg-slate-800 p-0.5">
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors capitalize ${
                  view === v
                    ? 'bg-white dark:bg-slate-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={goToToday}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => step(-1)}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors text-neutral-600 dark:text-neutral-400"
            aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => step(1)}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors text-neutral-600 dark:text-neutral-400"
            aria-label={view === 'month' ? 'Next month' : 'Next week'}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
        {DAY_HEADERS.map(day => (
          <div key={day} className="text-center text-[10px] sm:text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Grid (month or week) */}
      <div
        className="grid grid-cols-7 gap-1 sm:gap-1.5"
        role="grid"
        aria-label="Earnings calendar"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {days.map((day) => {
          const dateStr = formatDate(day);
          const isSelected = dateStr === anchor;
          const isTodayCell = dateStr === todayStr;
          const weekend = isWeekend(day);
          const count = dateCounts[dateStr] || 0;
          const isPast = dateStr < todayStr;
          const other = isOtherMonth(day);

          return (
            <button
              key={dateStr}
              onClick={() => onDateSelect?.(dateStr)}
              aria-label={`${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${count > 0 ? `, ${count} earnings` : ''}`}
              aria-current={isSelected ? 'date' : undefined}
              aria-pressed={isSelected}
              className={`
                relative flex flex-col items-center justify-center
                rounded-lg sm:rounded-xl py-1.5 sm:py-2.5 px-0.5
                transition-all duration-200
                min-h-[48px] sm:min-h-[64px]
                ${isSelected
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105'
                  : isTodayCell
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/40'
                  : other
                  ? 'bg-transparent text-neutral-300 dark:text-neutral-700 hover:bg-neutral-50 dark:hover:bg-slate-800/40'
                  : weekend
                  ? 'bg-neutral-50 dark:bg-slate-800/50 text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-slate-800'
                  : 'bg-neutral-50 dark:bg-slate-800/30 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-slate-800'
                }
              `}
            >
              <span className={`text-xs sm:text-sm font-semibold ${isSelected ? 'text-white' : ''} ${other ? 'opacity-60' : ''}`}>
                {day.getDate()}
              </span>
              {count > 0 && (
                <span className={`
                  mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${isSelected
                    ? 'bg-white/25 text-white'
                    : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                  }
                `}>
                  {count}
                </span>
              )}
              {isPast && count === 0 && !isSelected && !other && (
                <span className="mt-1 w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend + hint */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] sm:text-xs text-neutral-400 dark:text-neutral-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-600" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500/40" />
          <span>Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-100 dark:bg-blue-900/50" />
          <span>Earnings</span>
        </div>
        <div className="hidden sm:block ml-auto opacity-70">Arrow keys to move • PgUp/PgDn to navigate</div>
      </div>
    </div>
  );
}
