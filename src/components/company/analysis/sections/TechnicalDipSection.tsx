'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { DipIdeaItem, SemaforStatus } from '@/lib/tradingIdeas/dipEngine';
import { GaussianBellCurveChart } from '@/components/tradingIdeas/GaussianBellCurveChart';
import { TrancheCalculatorWidget } from '@/components/tradingIdeas/TrancheCalculatorWidget';
import { Calculator, ExternalLink, ChevronDown, ChevronUp, Activity } from 'lucide-react';

interface TechnicalDipSectionProps {
  ticker: string;
}

const BANNER_STYLES: Record<
  SemaforStatus,
  { wrap: string; badge: string }
> = {
  BUY_TRANCHE_1: {
    wrap: 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/20',
    badge: 'bg-emerald-600 text-white',
  },
  WAIT_RETEST: {
    wrap: 'border-amber-300 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-950/20',
    badge: 'bg-amber-500 text-white',
  },
  BROKEN_200W_NO_CAPITULATION: {
    wrap: 'border-orange-300 dark:border-orange-800/70 bg-orange-50/40 dark:bg-orange-950/20',
    badge: 'bg-orange-600 text-white',
  },
  WATCH_APPROACHING: {
    wrap: 'border-sky-300 dark:border-sky-800/70 bg-sky-50/40 dark:bg-sky-950/20',
    badge: 'bg-sky-600 text-white',
  },
  TAKE_PROFIT_HEDGE: {
    wrap: 'border-rose-300 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/20',
    badge: 'bg-rose-600 text-white',
  },
  NEUTRAL_WAIT: {
    wrap: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
    badge: 'bg-slate-700 text-white dark:bg-slate-700',
  },
};

export function TechnicalDipSection({ ticker }: TechnicalDipSectionProps) {
  const [item, setItem] = useState<DipIdeaItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showCalculator, setShowCalculator] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/trading-ideas/${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (json?.success && json?.data) {
          setItem(json.data);
          // Auto-open the 3-tranche calculator if an active buy or retest signal is present
          if (
            json.data.semafor?.status === 'BUY_TRANCHE_1' ||
            json.data.semafor?.status === 'WAIT_RETEST'
          ) {
            setShowCalculator(true);
          }
        } else {
          setItem(null);
        }
      })
      .catch(() => {
        if (!cancelled) setItem(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 animate-pulse">
        <div className="h-5 w-64 bg-slate-200 dark:bg-slate-800 rounded mb-3" />
        <div className="h-16 bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
      </div>
    );
  }

  if (!item) return null;

  const style = BANNER_STYLES[item.semafor.status];
  const activePlan =
    item.queriedRole === 'slave' && item.pair.slaveSymbol
      ? item.tranchePlanSlave
      : item.pair.slaveSymbol
        ? item.tranchePlanSlave
        : item.tranchePlanMaster;

  return (
    <section
      aria-label="Technický Dip-Buying & Gaussova krivka RSI"
      className={`mb-6 rounded-2xl border p-5 shadow-xs transition-all ${style.wrap}`}
    >
      {/* Top Row: Technical Timing Verdict Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <Activity size={14} />
              <span>Technický Timing &amp; Anti-FOMO Semafor</span>
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold ${style.badge}`}>
              <span>{item.semafor.emoji}</span>
              <span>{item.semafor.headlineSk}</span>
            </span>
            {item.pair.slaveSymbol && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                Pár: {item.pair.masterSymbol} → {item.pair.slaveSymbol} ({item.pair.leverage}×)
              </span>
            )}
          </div>

          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
            {item.semafor.actionSk}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-4xl leading-relaxed">
            {item.semafor.explanationSk}
          </p>
        </div>

        {/* Action buttons: Expand 3-Tranche Calculator + Link to full Trading Ideas tab */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowCalculator((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-xs"
          >
            <Calculator size={14} />
            <span>{showCalculator ? 'Skryť kalkulátor 3 tranží' : 'Kalkulátor 3 tranží (28:28:44)'}</span>
            {showCalculator ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <Link
            href={`/trading-ideas?ticker=${encodeURIComponent(ticker)}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-400 transition-colors"
          >
            <span>Trading Ideas</span>
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      {/* Key Technical & Tranche Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4 text-xs">
        <div className="rounded-xl bg-white/90 dark:bg-slate-900/90 p-2.5 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[10px] font-semibold uppercase text-slate-400">Daily RSI (14)</div>
          <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {item.dailyRsi14?.toFixed(1) ?? '–'}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            Percentil: {item.gaussian.dailyRsi.gaussianPercentile?.toFixed(1) ?? '–'} % (
            {item.gaussian.dailyRsi.zScore != null
              ? `${item.gaussian.dailyRsi.zScore >= 0 ? '+' : ''}${item.gaussian.dailyRsi.zScore.toFixed(2)}σ`
              : '–'}
            )
          </div>
        </div>

        <div className="rounded-xl bg-white/90 dark:bg-slate-900/90 p-2.5 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[10px] font-semibold uppercase text-slate-400">Weekly RSI (14)</div>
          <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {item.weeklyRsi14?.toFixed(1) ?? '–'}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            Percentil: {item.gaussian.weeklyRsi.gaussianPercentile?.toFixed(1) ?? '–'} %
          </div>
        </div>

        <div className="rounded-xl bg-white/90 dark:bg-slate-900/90 p-2.5 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[10px] font-semibold uppercase text-slate-400">
            Weekly SMA 50 ({item.pair.masterSymbol})
          </div>
          <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
            ${item.masterTechnicals.weeklySma50?.toFixed(2) ?? '–'}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            Vzdialenosť:{' '}
            {item.masterTechnicals.distWeeklySma50Pct != null
              ? `${item.masterTechnicals.distWeeklySma50Pct >= 0 ? '+' : ''}${item.masterTechnicals.distWeeklySma50Pct.toFixed(1)}%`
              : '–'}
          </div>
        </div>

        <div className="rounded-xl bg-white/90 dark:bg-slate-900/90 p-2.5 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[10px] font-semibold uppercase text-slate-400">
            Weekly SMA 200 ({item.pair.masterSymbol})
          </div>
          <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
            ${item.masterTechnicals.weeklySma200?.toFixed(2) ?? '–'}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            Vzdialenosť:{' '}
            {item.masterTechnicals.distWeeklySma200Pct != null
              ? `${item.masterTechnicals.distWeeklySma200Pct >= 0 ? '+' : ''}${item.masterTechnicals.distWeeklySma200Pct.toFixed(1)}%`
              : '–'}
          </div>
        </div>

        <div className="rounded-xl bg-white/90 dark:bg-slate-900/90 p-2.5 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[10px] font-semibold uppercase text-slate-400">Rel. Objem &amp; Odskok</div>
          <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {item.relVolume.toFixed(2)}× RVOL
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            Od Low včera: {item.masterQuote.reboundFromYesterdayLowPct >= 0 ? '+' : ''}
            {item.masterQuote.reboundFromYesterdayLowPct.toFixed(1)}%
          </div>
        </div>

        <div className="rounded-xl bg-white/90 dark:bg-slate-900/90 p-2.5 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">
            Plán 3 tranží ({activePlan.instrumentSymbol})
          </div>
          <div className="text-xs font-extrabold text-slate-900 dark:text-white tabular-nums mt-1">
            1T: ${activePlan.levels[0].slaveEntryPrice} · 2T: ${activePlan.levels[1].slaveEntryPrice}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
            3T (44%): ${activePlan.levels[2].slaveEntryPrice}
          </div>
        </div>
      </div>

      {/* Interactive Gaussian Bell Curve (RSI / Weekly RSI / 200W SMA / 200D SMA / P/E) */}
      <div className="mt-4">
        <GaussianBellCurveChart
          symbol={ticker}
          masterSymbol={item.pair.masterSymbol}
          distributions={item.gaussian}
          compact
        />
      </div>

      {/* Expandable 3-Tranche Calculator */}
      {showCalculator && (
        <div className="mt-4">
          <TrancheCalculatorWidget item={item} />
        </div>
      )}
    </section>
  );
}
