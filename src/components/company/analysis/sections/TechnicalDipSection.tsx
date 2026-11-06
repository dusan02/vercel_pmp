'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { DipIdeaItem, SemaforStatus } from '@/lib/tradingIdeas/dipEngine';
import { GaussianBellCurveChart } from '@/components/tradingIdeas/GaussianBellCurveChart';
import { ExternalLink } from 'lucide-react';

interface TechnicalDipSectionProps {
  ticker: string;
}

const BADGE_STYLES: Record<SemaforStatus, string> = {
  BUY_TRANCHE_1: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  WAIT_RETEST: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
  BROKEN_200W_NO_CAPITULATION: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40',
  WATCH_APPROACHING: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40',
  TAKE_PROFIT_HEDGE: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
  NEUTRAL_WAIT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-700',
};

const SHORT_HEADLINE: Record<SemaforStatus, string> = {
  BUY_TRANCHE_1: 'Buy Tranche 1',
  WAIT_RETEST: 'Wait Retest',
  BROKEN_200W_NO_CAPITULATION: 'Below 200W SMA',
  WATCH_APPROACHING: 'Approaching Dip',
  TAKE_PROFIT_HEDGE: 'Take Profit / Hedge',
  NEUTRAL_WAIT: 'Neutral Zone',
};

export function TechnicalDipSection({ ticker }: TechnicalDipSectionProps) {
  const [item, setItem] = useState<DipIdeaItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/trading-ideas/${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (json?.success && json?.data) {
          setItem(json.data);
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
      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 animate-pulse">
        <div className="h-4 w-44 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
        <div className="h-36 bg-gray-100 dark:bg-gray-800/60 rounded-lg" />
      </section>
    );
  }

  if (!item) return null;

  const badgeCls = BADGE_STYLES[item.semafor.status];
  const activePlan =
    item.queriedRole === 'slave' && item.pair.slaveSymbol
      ? item.tranchePlanSlave
      : item.pair.slaveSymbol
        ? item.tranchePlanSlave
        : item.tranchePlanMaster;

  const isActionable =
    item.semafor.status === 'BUY_TRANCHE_1' ||
    item.semafor.status === 'WAIT_RETEST' ||
    item.semafor.status === 'WATCH_APPROACHING';

  return (
    <section
      aria-label="Gaussian RSI & Dip Timing"
      className="flex-1 flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      {/* Top header matching PillarsRadar */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Gaussian RSI &amp; Dip
        </h2>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeCls}`}
          >
            <span>{item.semafor.emoji}</span>
            <span>{SHORT_HEADLINE[item.semafor.status]}</span>
          </span>
          <Link
            href={`/trading-ideas?ticker=${encodeURIComponent(ticker)}`}
            title="Open in Trading Ideas & 3-Tranche Calculator"
            className="p-1 rounded-md text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      {/* Compact Gaussian Bell Curve */}
      <GaussianBellCurveChart
        symbol={ticker}
        masterSymbol={item.pair.masterSymbol}
        distributions={item.gaussian}
        compact
      />

      {/* Actionable summary line */}
      <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
        <strong className="font-semibold text-gray-900 dark:text-white">
          {item.semafor.actionSk}
        </strong>
        {item.masterTechnicals.weeklySma200 != null && (
          <span className="text-gray-500 dark:text-gray-400">
            {' '}· 200W SMA: ${item.masterTechnicals.weeklySma200.toFixed(2)} (
            {item.masterTechnicals.distWeeklySma200Pct != null &&
            item.masterTechnicals.distWeeklySma200Pct >= 0
              ? '+'
              : ''}
            {item.masterTechnicals.distWeeklySma200Pct?.toFixed(1)}%)
          </span>
        )}
      </p>

      {/* Collapsible 3-Tranche Pyramid Plan (matches PillarsRadar details pattern) */}
      <details open={isActionable} className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        <summary className="cursor-pointer select-none font-medium hover:text-gray-700 dark:hover:text-gray-200">
          3-Tranche Buying Plan (28 : 28 : 44) · {activePlan.instrumentSymbol}
        </summary>
        <div className="mt-2 space-y-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5 border border-gray-200/70 dark:border-gray-700/60">
          {activePlan.levels.map((lvl) => (
            <div key={lvl.trancheNumber} className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-200">
                T{lvl.trancheNumber} ({lvl.weightPct}%)
                {lvl.trancheNumber === 3 ? ' · 200W SMA' : lvl.trancheNumber === 1 ? ' · 50W SMA' : ' · Support'}
              </span>
              <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                ${lvl.slaveEntryPrice.toFixed(2)}{' '}
                <span className="text-[10px] font-normal text-gray-400">
                  ({lvl.slaveDropFromCurrentPct.toFixed(1)}%)
                </span>
              </span>
            </div>
          ))}
          <div className="pt-1.5 mt-1 border-t border-gray-200/70 dark:border-gray-700/60 flex items-center justify-between text-[11px]">
            <span>
              Weekly RSI: <strong className="text-gray-800 dark:text-gray-200">{item.weeklyRsi14?.toFixed(1) ?? '–'}</strong> · RVOL:{' '}
              <strong className="text-gray-800 dark:text-gray-200">{item.relVolume.toFixed(2)}×</strong>
            </span>
            <Link
              href={`/trading-ideas?ticker=${encodeURIComponent(ticker)}`}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Calculator</span>
              <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      </details>
    </section>
  );
}

