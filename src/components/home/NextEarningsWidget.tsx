import React from 'react';
import Link from 'next/link';

interface UpcomingEarning {
  ticker: string;
  companyName: string | null;
  time: string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  date: string;
}

function timeLabel(time: string): string {
  switch (time) {
    case 'bmo': return 'Pre-Market';
    case 'amc': return 'After-Hours';
    case 'dmt': return 'During Market';
    default: return 'TBD';
  }
}

function timeColor(time: string): string {
  switch (time) {
    case 'bmo': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
    case 'amc': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
    default: return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  }
}

function formatRevenue(value: number | null): string {
  if (value == null) return '-';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

export function NextEarningsWidget({ earnings }: { earnings: UpcomingEarning[] }) {
  if (!earnings || earnings.length === 0) return null;

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const todayEarnings = earnings.filter((e) => e.date === today);
  const tomorrowEarnings = earnings.filter((e) => e.date !== today).slice(0, 10);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-2xl">📅</span>
          Next Earnings
        </h3>
        <Link
          href="/earnings"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          Full Calendar →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Today */}
        {todayEarnings.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">
                Today
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{todayEarnings.length} reports</span>
            </div>
            <div className="space-y-2">
              {todayEarnings.slice(0, 6).map((e) => (
                <Link
                  key={`${e.ticker}-${e.date}`}
                  href={`/analysis/${e.ticker}`}
                  className="flex items-center justify-between gap-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 py-1.5 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-gray-900 dark:text-white shrink-0">{e.ticker}</span>
                    <span className="text-gray-500 dark:text-gray-400 truncate text-xs">{e.companyName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${timeColor(e.time)}`}>
                      {timeLabel(e.time)}
                    </span>
                    {e.epsEstimate != null && (
                      <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">
                        EPS ${e.epsEstimate.toFixed(2)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {tomorrowEarnings.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                Upcoming
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{tomorrowEarnings.length} reports</span>
            </div>
            <div className="space-y-2">
              {tomorrowEarnings.slice(0, 6).map((e) => (
                <Link
                  key={`${e.ticker}-${e.date}`}
                  href={`/analysis/${e.ticker}`}
                  className="flex items-center justify-between gap-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 py-1.5 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-gray-900 dark:text-white shrink-0">{e.ticker}</span>
                    <span className="text-gray-500 dark:text-gray-400 truncate text-xs">{e.companyName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${timeColor(e.time)}`}>
                      {timeLabel(e.time)}
                    </span>
                    {e.epsEstimate != null && (
                      <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">
                        EPS ${e.epsEstimate.toFixed(2)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
