'use client';

import React, { useState } from 'react';
import { Download, Link2, Plus, TrendingUp, TrendingDown, Sparkles, PieChart, Layers, Check } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { formatCurrencyCompact, formatPercent, formatPrice, formatSectorName } from '@/lib/utils/format';

interface PortfolioMobileSummaryProps {
  totalPortfolioValue: number;
  totalDailyChange: number;
  weightedDailyChangePercent: number;
  totalPnl: number;
  totalReturnPct: number;
  hasCostBasis: boolean;
  holdingsCount: number;
  insights: {
    top: { ticker: string; weight: number };
    topSector: [string, number] | undefined;
    earningSoon: Array<{ ticker: string; earningsDays?: number }>;
    avgScore: number | null;
    trendCount: number;
    n: number;
  } | null;
  activeTab: 'holdings' | 'charts';
  onTabChange: (tab: 'holdings' | 'charts') => void;
  onAddStockClick: () => void;
  onExportCsv: () => void;
  onCopyShareLink: () => void;
  isCopied: boolean;
  isAuthenticated: boolean;
}

export function PortfolioMobileSummary({
  totalPortfolioValue,
  totalDailyChange,
  weightedDailyChangePercent,
  totalPnl,
  totalReturnPct,
  hasCostBasis,
  holdingsCount,
  insights,
  activeTab,
  onTabChange,
  onAddStockClick,
  onExportCsv,
  onCopyShareLink,
  isCopied,
  isAuthenticated,
}: PortfolioMobileSummaryProps) {
  const [showSyncBanner, setShowSyncBanner] = useState(true);

  const dailyIsPos = totalDailyChange >= 0;
  const totalIsPos = totalPnl >= 0;

  return (
    <div className="space-y-3 mb-4">
      {/* 1. Hero Balance Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white rounded-3xl p-5 shadow-lg border border-slate-800/80 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -right-10 -top-10 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 w-44 h-44 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Card Header: Label + Quick Actions */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Portfolio Balance
          </span>

          {/* Export / Share actions */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCopyShareLink}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-colors"
              title={isCopied ? 'Copied to clipboard!' : 'Share Portfolio Link'}
              aria-label="Share Portfolio Link"
            >
              {isCopied ? <Check size={16} className="text-emerald-400" /> : <Link2 size={16} />}
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-colors"
              title="Export to CSV"
              aria-label="Export to CSV"
            >
              <Download size={16} />
            </button>
          </div>
        </div>

        {/* Main Balance Display */}
        <div className="mb-4">
          <div className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums">
            ${formatPrice(totalPortfolioValue)}
          </div>
        </div>

        {/* Performance Badges Strip */}
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10">
          {/* Today's Change */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-2.5 border border-white/5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
              Today's Gain / Loss
            </div>
            <div
              className={`text-sm font-bold tabular-nums flex items-center gap-1 ${
                dailyIsPos ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {dailyIsPos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{formatCurrencyCompact(totalDailyChange, true)}</span>
              <span className="text-xs opacity-80">({formatPercent(weightedDailyChangePercent)})</span>
            </div>
          </div>

          {/* All-Time Return */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-2.5 border border-white/5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
              Total Return
            </div>
            {hasCostBasis ? (
              <div
                className={`text-sm font-bold tabular-nums flex items-center gap-1 ${
                  totalIsPos ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {totalIsPos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>{formatCurrencyCompact(totalPnl, true)}</span>
                <span className="text-xs opacity-80">({formatPercent(totalReturnPct)})</span>
              </div>
            ) : (
              <div className="text-xs text-slate-400 font-medium">
                Set buy prices to track
              </div>
            )}
          </div>
        </div>

        {/* Insights / Composition Pills Strip */}
        {insights && (
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/10 overflow-x-auto scrollbar-none text-[11px]">
            <span className="px-2.5 py-1 rounded-full bg-white/10 text-slate-200 font-medium whitespace-nowrap shrink-0">
              {holdingsCount} {holdingsCount === 1 ? 'stock' : 'stocks'}
            </span>

            {insights.top && (
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-slate-200 font-medium whitespace-nowrap shrink-0">
                Top: <strong className="text-white">{insights.top.ticker}</strong> ({insights.top.weight.toFixed(0)}%)
              </span>
            )}

            {insights.topSector && (
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-slate-200 font-medium whitespace-nowrap shrink-0">
                {formatSectorName(insights.topSector[0])} ({((insights.topSector[1] / Math.max(1, totalPortfolioValue)) * 100).toFixed(0)}%)
              </span>
            )}

            {insights.earningSoon.length > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 font-medium whitespace-nowrap shrink-0">
                Earn ≤7d: {insights.earningSoon.length}
              </span>
            )}

            {insights.trendCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-medium whitespace-nowrap shrink-0">
                T×F: {insights.trendCount}/{insights.n}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Sign-in Cloud Sync Nudge (For anonymous users with >= 3 stocks) */}
      {!isAuthenticated && holdingsCount >= 3 && showSyncBanner && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 rounded-2xl p-3 px-4 flex items-center justify-between gap-3 text-xs">
          <p className="text-blue-900 dark:text-blue-200 flex-1 leading-relaxed">
            Saved locally in browser. <strong>Sign in</strong> to sync across your devices.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => signIn('google')}
              className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setShowSyncBanner(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1"
              aria-label="Dismiss banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 3. Segmented Navigation Tabs: [Holdings (N)] | [Analytics & Charts] */}
      <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onTabChange('holdings')}
          className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'holdings'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers size={15} />
          <span>Holdings</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 tabular-nums">
            {holdingsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('charts')}
          className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'charts'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <PieChart size={15} />
          <span>Analytics & Charts</span>
        </button>
      </div>
    </div>
  );
}
