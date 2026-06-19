'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { format, addDays, subWeeks, addWeeks, startOfWeek, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Coffee } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { isMarketHoliday } from '@/lib/utils/timeUtils';
import TodaysEarningsFinnhub from './TodaysEarningsFinnhub';

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

export default function WeeklyEarningsCalendar() {
  // Start week at Monday for the given current time
  const [currentDate, setCurrentDate] = useState(() => {
    const et = getETDate();
    return startOfWeek(et, { weekStartsOn: 1 });
  });

  const [selectedDate, setSelectedDate] = useState<Date>(getETDate());
  const [weeklyData, setWeeklyData] = useState<Record<string, DayEarnings>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute the 7 days of the selected week (Mon-Sun)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(currentDate, i));
  }, [currentDate]);

  const startDateStr = format(weekDays[0]!, 'yyyy-MM-dd');
  const endDateStr = format(weekDays[6]!, 'yyyy-MM-dd');

  useEffect(() => {
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
  }, [startDateStr]);

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

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="bg-blue-500 text-white p-2.5 rounded-lg shadow-sm">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Earnings Calendar</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {startDateStr} &rarr; {endDateStr}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 md:mt-0">
          {/* Stats Badges */}
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md">
              <span className="font-bold">{totals.total}</span> Total
            </div>
            <div className="px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 rounded-md">
              <span className="font-bold">{totals.pre}</span> Pre-mkt
            </div>
            <div className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-md">
              <span className="font-bold">{totals.after}</span> After-hrs
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button 
              onClick={handlePrevWeek}
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button 
              onClick={handleThisWeek}
              className="px-4 py-1.5 text-sm font-semibold rounded-md bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              This Week
            </button>
            <button 
              onClick={handleNextWeek}
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-20 text-center text-gray-500">Loading weekly earnings...</div>
      )}
      
      {error && (
        <div className="py-20 text-center text-red-500">{error}</div>
      )}

      {!loading && !error && (
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {weekDays.map((date) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayData = weeklyData[dateStr];
            const isToday = isSameDay(date, todayET);
            const isHoliday = isMarketHoliday(date);
            
            const totalForDay = dayData ? (dayData.preMarket?.length + dayData.afterMarket?.length + dayData.timeTbd?.length) : 0;
            const isSelected = isSameDay(date, selectedDate);

            return (
              <div 
                key={dateStr} 
                onClick={() => setSelectedDate(date)}
                className={`flex-none w-[260px] lg:min-w-[150px] lg:flex-1 snap-center rounded-xl overflow-hidden border cursor-pointer transition-all ${
                  isToday 
                    ? 'border-green-400 dark:border-green-600 bg-green-50/80 dark:bg-green-900/20 shadow-[0_0_15px_rgba(74,222,128,0.2)] dark:shadow-[0_0_15px_rgba(22,163,74,0.3)]' 
                    : isSelected 
                      ? 'border-blue-400 dark:border-blue-600 bg-blue-50/80 dark:bg-blue-900/20 shadow-md transform scale-[1.02]'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                } flex flex-col relative`}
              >
                {/* Column Header */}
                <div className={`px-3 py-3 border-b flex flex-col xl:flex-row xl:justify-between items-start xl:items-center gap-1 xl:gap-0 ${
                  isToday 
                    ? 'border-green-300 dark:border-green-700 bg-green-100/80 dark:bg-green-800/40' 
                    : isSelected
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-100/80 dark:bg-blue-800/40'
                      : 'border-gray-100 dark:border-gray-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold uppercase text-sm tracking-wider ${
                      isToday ? 'text-green-800 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {format(date, 'EEEE')}
                    </span>
                    {isToday && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white uppercase">Today</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] xl:text-xs text-gray-500 dark:text-gray-400">
                    <span className={isToday ? "text-green-700 dark:text-green-400 font-medium" : (isSelected ? "text-blue-700 dark:text-blue-400 font-medium" : "")}>{format(date, 'MMM d')}</span>
                    {!isHoliday && (
                      <span className="font-semibold px-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{totalForDay}</span>
                    )}
                  </div>
                </div>

                {/* Column Content */}
                <div className="p-3 flex-1 overflow-y-auto max-h-[400px] xl:max-h-[500px]">
                  {isHoliday ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 pt-10">
                      <Coffee size={32} className="mb-3 opacity-30 text-orange-500 dark:text-orange-400" />
                      <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-widest">Market Holiday</span>
                      <span className="text-xs text-center mt-2 px-4 leading-relaxed">No earnings are scheduled on public holidays.</span>
                    </div>
                  ) : (!dayData || totalForDay === 0) ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 pt-10">
                      <CalendarIcon size={32} className="mb-2 opacity-20" />
                      <span className="text-sm">No reports</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      <EarningsSection 
                        title="PRE-MARKET" 
                        color="bg-yellow-400" 
                        data={dayData.preMarket} 
                      />
                      <EarningsSection 
                        title="AFTER-HOURS" 
                        color="bg-purple-500" 
                        data={dayData.afterMarket} 
                      />
                      <EarningsSection 
                        title="TIME TBD" 
                        color="bg-gray-400" 
                        data={dayData.timeTbd} 
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
      <div className="mt-4 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Details for {format(selectedDate, 'EEEE, MMMM d')}
        </h3>
        <TodaysEarningsFinnhub selectedDate={format(selectedDate, 'yyyy-MM-dd')} hideHeader={true} />
      </div>

    </div>
  );
}

// Subcomponent for each time section
function EarningsSection({ title, color, data }: { title: string, color: string, data?: EarningsData[] }) {
  if (!data || data.length === 0) return null;

  const handleTickerClick = (ticker: string) => {
    // Dispatch custom event if we want to integrate with sidebar or standard navigation
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mobile-nav-change', {
        detail: { tab: 'analysis', ticker }
      }));
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wider uppercase">{title}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {data.map((item, idx) => (
          <button
            key={`${item.ticker}-${idx}`}
            onClick={() => handleTickerClick(item.ticker)}
            className="w-12 h-12 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm transition-all hover:shadow-md group relative overflow-hidden"
            title={item.companyName || item.ticker}
          >
            <div className="w-8 h-8 flex items-center justify-center relative z-10">
              <CompanyLogo ticker={item.ticker} size={32} />
            </div>
            {/* Ticker fallback visible if logo fails or on hover */}
            <div className="absolute inset-0 bg-gray-900/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
              <span className="text-[10px] font-bold text-white px-1 truncate">{item.ticker}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
