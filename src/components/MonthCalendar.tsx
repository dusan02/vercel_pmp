'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DateCount {
  date: string;
  count: number;
}

interface MonthCalendarProps {
  onDateSelect?: (date: string) => void;
  selectedDate?: string;
  initialDateCounts?: { date: string; count: number }[] | null;
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
  return d.toISOString().split('T')[0] ?? '';
}

export default function MonthCalendar({ onDateSelect, selectedDate, initialDateCounts }: MonthCalendarProps) {
  const [viewDate, setViewDate] = useState(() => {
    const et = getETDate();
    return new Date(et.getFullYear(), et.getMonth(), 1);
  });
  const [dateCounts, setDateCounts] = useState<Record<string, number>>(() => {
    if (!initialDateCounts || !Array.isArray(initialDateCounts)) return {};
    const map: Record<string, number> = {};
    for (const d of initialDateCounts) map[d.date] = d.count;
    return map;
  });
  const [loading, setLoading] = useState(() => !initialDateCounts);

  // Fetch available dates with counts (skip if SSR data provided)
  useEffect(() => {
    if (initialDateCounts) return; // SSR data already provided
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
  }, []);

  const todayStr = useMemo(() => formatDate(getETDate()), []);

  // Build calendar grid for the current view month
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Monday = 0
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const days: { date: Date | null; dateStr: string | null }[] = [];

    // Previous month padding
    for (let i = 0; i < startWeekday; i++) {
      days.push({ date: null, dateStr: null });
    }

    // Current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ date, dateStr: formatDate(date) });
    }

    return days;
  }, [viewDate]);

  const handlePrevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };
  const handleToday = () => {
    const et = getETDate();
    setViewDate(new Date(et.getFullYear(), et.getMonth(), 1));
  };

  const monthLabel = `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  const isCurrentMonth = viewDate.getMonth() === getETDate().getMonth() && viewDate.getFullYear() === getETDate().getFullYear();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={handleToday}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Today
            </button>
          )}
          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0 px-2 pt-2">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0 p-2 pt-0">
        {calendarDays.map((day, i) => {
          if (!day.date || !day.dateStr) {
            return <div key={i} className="aspect-square" />;
          }

          const count = dateCounts[day.dateStr] ?? 0;
          const isToday = day.dateStr === todayStr;
          const isSelected = selectedDate === day.dateStr;
          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
          const isPast = day.dateStr < todayStr;
          const isFuture = day.dateStr > todayStr;

          return (
            <button
              key={i}
              onClick={() => day.dateStr && onDateSelect?.(day.dateStr)}
              className={`
                aspect-square flex flex-col items-center justify-center rounded-lg text-sm
                transition-all relative
                ${isSelected
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400'
                  : isToday
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }
                ${isWeekend && !isSelected && !isToday ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}
              `}
            >
              <span className="font-semibold">{day.date.getDate()}</span>
              {count > 0 && (
                <span className={`
                  text-[9px] font-bold leading-none mt-0.5 px-1 rounded
                  ${isSelected
                    ? 'bg-white/20 text-white'
                    : isPast
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      : isFuture
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  }
                `}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Future
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-400" /> Today
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-300" /> Past
        </span>
      </div>
    </div>
  );
}
