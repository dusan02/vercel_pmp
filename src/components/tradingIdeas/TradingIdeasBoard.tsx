'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { DipIdeaItem, SemaforStatus } from '@/lib/tradingIdeas/dipEngine';
import { GaussianBellCurveChart } from './GaussianBellCurveChart';
import { TrancheCalculatorWidget } from './TrancheCalculatorWidget';
import CompanyLogo from '@/components/CompanyLogo';
import {
  RefreshCw,
  Plus,
  ExternalLink,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Info,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';

interface TradingIdeasBoardProps {
  initialData?: {
    items: DipIdeaItem[];
    session: 'pre' | 'live' | 'after' | 'closed';
    updatedAt: string;
  } | null;
}

type FilterMode = 'all' | 'signals' | 'leveraged' | 'etf' | 'stocks';

const SEMAFOR_BADGE_STYLES: Record<
  SemaforStatus,
  { bg: string; border: string; text: string }
> = {
  BUY_TRANCHE_1: {
    bg: 'bg-emerald-500/15 dark:bg-emerald-500/20',
    border: 'border-emerald-500/40',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  WAIT_RETEST: {
    bg: 'bg-amber-500/15 dark:bg-amber-500/20',
    border: 'border-amber-500/40',
    text: 'text-amber-700 dark:text-amber-300',
  },
  BROKEN_200W_NO_CAPITULATION: {
    bg: 'bg-orange-500/15 dark:bg-orange-500/20',
    border: 'border-orange-500/40',
    text: 'text-orange-700 dark:text-orange-300',
  },
  WATCH_APPROACHING: {
    bg: 'bg-sky-500/15 dark:bg-sky-500/20',
    border: 'border-sky-500/40',
    text: 'text-sky-700 dark:text-sky-300',
  },
  TAKE_PROFIT_HEDGE: {
    bg: 'bg-rose-500/15 dark:bg-rose-500/20',
    border: 'border-rose-500/40',
    text: 'text-rose-700 dark:text-rose-300',
  },
  NEUTRAL_WAIT: {
    bg: 'bg-slate-500/10 dark:bg-slate-800/80',
    border: 'border-slate-300 dark:border-slate-700',
    text: 'text-slate-600 dark:text-slate-400',
  },
};

export function TradingIdeasBoard({ initialData = null }: TradingIdeasBoardProps) {
  const [urlTicker, setUrlTicker] = useState<string | null>(null);

  const [items, setItems] = useState<DipIdeaItem[]>(initialData?.items ?? []);
  const [session, setSession] = useState<'pre' | 'live' | 'after' | 'closed'>(
    initialData?.session ?? 'closed'
  );
  const [updatedAt, setUpdatedAt] = useState<string>(initialData?.updatedAt ?? '');
  const [loading, setLoading] = useState<boolean>(!initialData?.items?.length);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [customInput, setCustomInput] = useState<string>('');
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialData?.items?.[0]?.id ?? null
  );
  const [defaultCapitalUsd, setDefaultCapitalUsd] = useState<number>(15300);

  // Read ?ticker= query param and saved custom tickers from localStorage
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get('ticker')?.toUpperCase().trim() || null;
      if (t) setUrlTicker(t);
    } catch {
      /* ignore */
    }
    try {
      const saved = JSON.parse(localStorage.getItem('pmp:dipCustomTickers') ?? '[]');
      if (Array.isArray(saved)) {
        const valid = saved
          .filter((s): s is string => typeof s === 'string' && /^[A-Z][A-Z.]{0,6}$/.test(s))
          .slice(0, 8);
        if (valid.length > 0) setCustomSymbols(valid);
      }
      const savedCap = Number(localStorage.getItem('pmp:dipDefaultCapital'));
      if (Number.isFinite(savedCap) && savedCap >= 500) {
        setDefaultCapitalUsd(savedCap);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchBoard = useCallback(
    async (extraSyms: string[], force = false) => {
      try {
        if (force) setRefreshing(true);
        else if (items.length === 0) setLoading(true);

        const allExtra = [...new Set([...extraSyms, ...(urlTicker ? [urlTicker] : [])])];
        const qs = new URLSearchParams();
        if (allExtra.length > 0) qs.set('symbols', allExtra.join(','));
        if (force) qs.set('refresh', '1');

        const res = await fetch(`/api/trading-ideas?${qs.toString()}`);
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json?.items)) {
          setItems(json.items);
          if (json.session) setSession(json.session);
          if (json.updatedAt) setUpdatedAt(json.updatedAt);

          if (urlTicker) {
            const match = json.items.find(
              (it: DipIdeaItem) =>
                it.pair.masterSymbol === urlTicker ||
                it.pair.slaveSymbol === urlTicker ||
                it.queriedSymbol === urlTicker
            );
            if (match) setSelectedId(match.id);
          } else if (!selectedId && json.items.length > 0) {
            setSelectedId(json.items[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load Trading Ideas board:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [items.length, selectedId, urlTicker]
  );

  useEffect(() => {
    void fetchBoard(customSymbols, false);
  }, [customSymbols, urlTicker]);

  // Auto-refresh every 60 seconds during active market sessions
  useEffect(() => {
    const id = setInterval(() => {
      if (session !== 'closed') {
        void fetchBoard(customSymbols, false);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [session, customSymbols, fetchBoard]);

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = customInput.toUpperCase().trim();
    if (!/^[A-Z][A-Z.]{0,6}$/.test(sym)) return;
    setCustomInput('');
    if (!customSymbols.includes(sym)) {
      const next = [...customSymbols, sym].slice(-8);
      setCustomSymbols(next);
      try {
        localStorage.setItem('pmp:dipCustomTickers', JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (filterMode === 'signals') {
        return it.semafor.status !== 'NEUTRAL_WAIT';
      }
      if (filterMode === 'leveraged') {
        return it.pair.slaveSymbol != null && it.pair.leverage >= 2;
      }
      if (filterMode === 'etf') {
        return it.pair.category === 'Index ETF' || it.pair.category === 'Sector ETF';
      }
      if (filterMode === 'stocks') {
        return it.pair.category === 'Big Tech' || it.pair.category === 'Growth / Tech';
      }
      return true;
    });
  }, [items, filterMode]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? filteredItems[0] ?? items[0] ?? null,
    [items, filteredItems, selectedId]
  );

  // Summary counts for top cards
  const summaryCounts = useMemo(() => {
    let buyCount = 0;
    let retestCount = 0;
    let warning200wCount = 0;
    let euphoriaCount = 0;
    for (const it of items) {
      if (it.semafor.status === 'BUY_TRANCHE_1') buyCount++;
      else if (it.semafor.status === 'WAIT_RETEST') retestCount++;
      else if (it.semafor.status === 'BROKEN_200W_NO_CAPITULATION' || it.semafor.status === 'WATCH_APPROACHING')
        warning200wCount++;
      else if (it.semafor.status === 'TAKE_PROFIT_HEDGE') euphoriaCount++;
    }
    return { buyCount, retestCount, warning200wCount, euphoriaCount };
  }, [items]);

  const rsiBadgeCls = (rsi: number | null) => {
    if (rsi == null) return 'text-slate-400';
    if (rsi <= 20) return 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/20 font-extrabold px-1.5 py-0.5 rounded';
    if (rsi <= 23) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 font-bold px-1.5 py-0.5 rounded';
    if (rsi <= 27) return 'text-lime-700 dark:text-lime-300 bg-lime-500/15 font-bold px-1.5 py-0.5 rounded';
    if (rsi <= 32) return 'text-sky-600 dark:text-sky-400 font-semibold';
    if (rsi >= 78) return 'text-rose-600 dark:text-rose-400 bg-rose-500/15 font-bold px-1.5 py-0.5 rounded';
    if (rsi >= 70) return 'text-amber-600 dark:text-amber-400 font-semibold';
    return 'text-slate-700 dark:text-slate-200';
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Hero Banner & Contrarian Rules Strip */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <TrendingDown size={14} />
                <span>CONTRARIAN DIP-BUYING ENGINE</span>
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Wilder RSI (14) · Gaussian Tail (&lt; 2.0% / &lt; 0.8% / &lt; 0.3%) · Master → Slave ETF · Anti-FOMO Signal
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-2">
              Trading Ideas (Long) — Capitulation Timing &amp; Weighted Tranches (28 : 28 : 44)
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-4xl">
              Structural support levels (<strong>Weekly SMA 50</strong>, horizontal support, and{' '}
              <strong>Weekly SMA 200</strong>) are evaluated on the underlying asset (<strong>Master</strong>)
              and projected via the leverage multiplier (2×/3×) to derive entry levels for the leveraged ETF (<strong>Slave</strong>)
              without distortion from <em>volatility decay</em>.
            </p>
          </div>

          {/* Right controls: Refresh & Add Symbol */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <form onSubmit={handleAddSymbol} className="flex items-center gap-1.5">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Add ticker (e.g. ASML)..."
                maxLength={7}
                className="w-44 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
              >
                <Plus size={14} />
                <span>Add</span>
              </button>
            </form>

            <button
              type="button"
              onClick={() => void fetchBoard(customSymbols, true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-500' : ''} />
              <span>{refreshing ? 'Recalculating...' : 'Refresh Live'}</span>
            </button>
          </div>
        </div>

        {/* 4 Summary Status Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 p-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                🟢 Buy Tranche (RSI ≤ 27)
              </div>
              <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
                {summaryCounts.buyCount}
              </div>
              <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
                Capitulation without FOMO bounce (≤ +4%)
              </div>
            </div>
            <ShieldCheck size={24} className="text-emerald-500/70 shrink-0" />
          </div>

          <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 p-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-amber-700 dark:text-amber-400">
                🟡 Wait for Retest (Anti-FOMO)
              </div>
              <div className="text-xl font-extrabold text-amber-700 dark:text-amber-300 tabular-nums mt-0.5">
                {summaryCounts.retestCount}
              </div>
              <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80">
                Premarket jumped &gt; +4% · Limit near Close
              </div>
            </div>
            <AlertTriangle size={24} className="text-amber-500/70 shrink-0" />
          </div>

          <div className="rounded-xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200/70 dark:border-orange-900/40 p-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-orange-700 dark:text-orange-400">
                🟠 / 🔵 Watch &amp; 200W SMA
              </div>
              <div className="text-xl font-extrabold text-orange-700 dark:text-orange-300 tabular-nums mt-0.5">
                {summaryCounts.warning200wCount}
              </div>
              <div className="text-[11px] text-orange-600/80 dark:text-orange-400/80">
                Approaching capitulation / below 200W SMA
              </div>
            </div>
            <Info size={24} className="text-orange-500/70 shrink-0" />
          </div>

          <div className="rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40 p-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-rose-700 dark:text-rose-400">
                🔴 Take Profit / Hedge
              </div>
              <div className="text-xl font-extrabold text-rose-700 dark:text-rose-300 tabular-nums mt-0.5">
                {summaryCounts.euphoriaCount}
              </div>
              <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80">
                Right tail &gt; 98.5% (Daily RSI ≥ 78)
              </div>
            </div>
            <Flame size={24} className="text-rose-500/70 shrink-0" />
          </div>
        </div>
      </div>

      {/* Filter Bar + Quick Screener Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `All Tracked (${items.length})` },
              {
                id: 'signals',
                label: `Active Signals (${items.filter((i) => i.semafor.status !== 'NEUTRAL_WAIT').length})`,
              },
              { id: 'leveraged', label: 'Leveraged ETFs (Master → Slave 2×/3×)' },
              { id: 'etf', label: 'Indices & Sectors (QQQ / SOXX / SPY)' },
              { id: 'stocks', label: 'Individual Stocks' },
            ] as { id: FilterMode; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterMode(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterMode === f.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-blue-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/screener?maxRsi14=27&sort=rsi14:asc"
            className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <SlidersHorizontal size={14} />
            <span>Scan all 1,000+ stocks in Screener for Capitulations (RSI ≤ 27)</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* Main Overview Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
            <div className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded" />
            <div className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded" />
            <div className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-4 font-bold">Ticker (Master → Slave)</th>
                  <th className="py-3 px-3 font-bold text-right">Current Price / Premarket %</th>
                  <th className="py-3 px-3 font-bold">Anti-FOMO Signal &amp; Action</th>
                  <th className="py-3 px-3 font-bold text-right">Daily RSI (14)</th>
                  <th className="py-3 px-3 font-bold text-right">Weekly RSI (14)</th>
                  <th className="py-3 px-3 font-bold text-right">Gaussian Percentile (Z-Score)</th>
                  <th className="py-3 px-3 font-bold text-right">Rel Volume</th>
                  <th className="py-3 px-4 font-bold text-right">Master vs Weekly SMA 50 / 200</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {filteredItems.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  const semStyle = SEMAFOR_BADGE_STYLES[item.semafor.status];
                  const mQuote = item.masterQuote;
                  const sQuote = item.slaveQuote;
                  const dist50 = item.masterTechnicals.distWeeklySma50Pct;
                  const dist200 = item.masterTechnicals.distWeeklySma200Pct;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {/* 1. Ticker (Master -> Slave) */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
                            <CompanyLogo ticker={item.pair.masterSymbol} size={32} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                                {item.pair.masterSymbol}
                              </span>
                              {item.pair.slaveSymbol && (
                                <>
                                  <span className="text-slate-400">→</span>
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-extrabold text-xs border border-indigo-500/30">
                                    {item.pair.slaveSymbol} ({item.pair.leverage}×)
                                  </span>
                                </>
                              )}
                              <Link
                                href={`/analysis/${item.pair.masterSymbol}`}
                                onClick={(e) => e.stopPropagation()}
                                title={`Open Fundamental & Technical Analysis for ${item.pair.masterSymbol}`}
                                className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 ml-0.5"
                              >
                                <ExternalLink size={12} />
                              </Link>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-52">
                              {item.pair.masterName}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Current Price / Premarket % */}
                      <td className="py-3.5 px-3 align-middle text-right tabular-nums">
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          ${mQuote.currentPrice.toFixed(2)}{' '}
                          <span
                            className={`text-xs font-semibold ${
                              mQuote.dayChangePct > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : mQuote.dayChangePct < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-500'
                            }`}
                          >
                            ({mQuote.dayChangePct >= 0 ? '+' : ''}
                            {mQuote.dayChangePct.toFixed(2)}%)
                          </span>
                        </div>
                        {sQuote ? (
                          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                            {item.pair.slaveSymbol}: ${sQuote.currentPrice.toFixed(2)} (
                            {sQuote.dayChangePct >= 0 ? '+' : ''}
                            {sQuote.dayChangePct.toFixed(2)}%)
                          </div>
                        ) : mQuote.premarketPrice != null ? (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                            PM: ${mQuote.premarketPrice.toFixed(2)} (
                            {mQuote.premarketChangePct != null && mQuote.premarketChangePct >= 0 ? '+' : ''}
                            {mQuote.premarketChangePct?.toFixed(2)}%)
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            From Prev Low: {mQuote.reboundFromYesterdayLowPct >= 0 ? '+' : ''}
                            {mQuote.reboundFromYesterdayLowPct.toFixed(1)}%
                          </div>
                        )}
                      </td>

                      {/* 3. Anti-FOMO Semafor */}
                      <td className="py-3.5 px-3 align-middle max-w-xs">
                        <div
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${semStyle.bg} ${semStyle.border} ${semStyle.text}`}
                        >
                          <span>{item.semafor.emoji}</span>
                          <span>{item.semafor.headlineSk}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-1">
                          {item.semafor.actionSk}
                        </div>
                      </td>

                      {/* 4. Daily RSI (14) */}
                      <td className="py-3.5 px-3 align-middle text-right tabular-nums">
                        <div>
                          <span className={`text-sm ${rsiBadgeCls(item.dailyRsi14)}`}>
                            {item.dailyRsi14 != null ? item.dailyRsi14.toFixed(1) : '–'}
                          </span>
                        </div>
                        {item.slaveDailyRsi14 != null && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.pair.slaveSymbol} RSI: {item.slaveDailyRsi14.toFixed(1)}
                          </div>
                        )}
                      </td>

                      {/* 5. Weekly RSI (14) */}
                      <td className="py-3.5 px-3 align-middle text-right tabular-nums">
                        <span className={`text-sm ${rsiBadgeCls(item.weeklyRsi14)}`}>
                          {item.weeklyRsi14 != null ? item.weeklyRsi14.toFixed(1) : '–'}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.weeklyRsi14 != null && item.weeklyRsi14 <= 32
                            ? 'Long-term bottom!'
                            : 'Weekly trend'}
                        </div>
                      </td>

                      {/* 6. Gauss Percentile & Z-score */}
                      <td className="py-3.5 px-3 align-middle text-right tabular-nums">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {item.gaussian.dailyRsi.gaussianPercentile != null
                            ? `${item.gaussian.dailyRsi.gaussianPercentile.toFixed(2)}%`
                            : '–'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Z ={' '}
                          {item.gaussian.dailyRsi.zScore != null
                            ? `${item.gaussian.dailyRsi.zScore >= 0 ? '+' : ''}${item.gaussian.dailyRsi.zScore.toFixed(2)}σ`
                            : '–'}{' '}
                          (μ={item.gaussian.dailyRsi.mean.toFixed(0)})
                        </div>
                      </td>

                      {/* 7. Rel Volume */}
                      <td className="py-3.5 px-3 align-middle text-right tabular-nums">
                        <span
                          className={`font-bold ${
                            item.relVolume >= 2.5
                              ? 'text-amber-600 dark:text-amber-400'
                              : item.relVolume >= 1.5
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {item.relVolume.toFixed(2)}×
                        </span>
                        <div className="text-[10px] text-slate-400">vs 20D avg</div>
                      </td>

                      {/* 8. Distance of Master from Weekly SMA 50 & SMA 200 */}
                      <td className="py-3.5 px-4 align-middle text-right tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[11px] text-slate-400">50W:</span>
                          <span
                            className={`font-semibold ${
                              dist50 != null && dist50 < 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {dist50 != null ? `${dist50 >= 0 ? '+' : ''}${dist50.toFixed(1)}%` : '–'}
                          </span>
                          {item.masterTechnicals.weeklySma50 != null && (
                            <span className="text-[10px] text-slate-400">
                              (${item.masterTechnicals.weeklySma50.toFixed(0)})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-0.5">
                          <span className="text-[11px] text-slate-400">200W:</span>
                          <span
                            className={`font-bold ${
                              dist200 != null && dist200 <= 3
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {dist200 != null ? `${dist200 >= 0 ? '+' : ''}${dist200.toFixed(1)}%` : '–'}
                          </span>
                          {item.masterTechnicals.weeklySma200 != null && (
                            <span className="text-[10px] text-slate-400">
                              (${item.masterTechnicals.weeklySma200.toFixed(0)})
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Ticker Detail Panel: Semafor Diagnostics + Gaussian Curve + 3-Tranche Calculator */}
      {selectedItem && (
        <div className="space-y-4">
          {/* Selected Ticker Semafor Banner & Structural Levels */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <CompanyLogo ticker={selectedItem.pair.masterSymbol} size={44} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                      {selectedItem.pair.masterSymbol} ({selectedItem.pair.masterName})
                    </h2>
                    {selectedItem.pair.slaveSymbol && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                        Leveraged ETF: {selectedItem.pair.slaveSymbol} ({selectedItem.pair.leverage}× Long)
                      </span>
                    )}
                    <Link
                      href={`/analysis/${selectedItem.pair.masterSymbol}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <span>Full {selectedItem.pair.masterSymbol} Analysis</span>
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
                    {selectedItem.semafor.explanationSk}
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                <div
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold border ${
                    SEMAFOR_BADGE_STYLES[selectedItem.semafor.status].bg
                  } ${SEMAFOR_BADGE_STYLES[selectedItem.semafor.status].border} ${
                    SEMAFOR_BADGE_STYLES[selectedItem.semafor.status].text
                  }`}
                >
                  <span className="text-base">{selectedItem.semafor.emoji}</span>
                  <div>
                    <div>{selectedItem.semafor.headlineSk}</div>
                    <div className="text-[11px] font-semibold opacity-90">
                      {selectedItem.semafor.actionSk}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Structural Support Levels Strip on Master */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4 text-xs">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Underlying Price ({selectedItem.pair.masterSymbol})
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  ${selectedItem.masterQuote.currentPrice.toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums">
                  Prev Low: ${selectedItem.masterQuote.prevLow.toFixed(2)}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Daily SMA 50 / 200
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  ${selectedItem.masterTechnicals.dailySma50?.toFixed(2) ?? '–'} / $
                  {selectedItem.masterTechnicals.dailySma200?.toFixed(2) ?? '–'}
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums">
                  vs 200D: {selectedItem.masterTechnicals.distDailySma200Pct != null ? `${selectedItem.masterTechnicals.distDailySma200Pct >= 0 ? '+' : ''}${selectedItem.masterTechnicals.distDailySma200Pct.toFixed(1)}%` : '–'}
                </div>
              </div>

              <div className="rounded-xl bg-blue-50/50 dark:bg-blue-950/20 p-2.5 border border-blue-200/60 dark:border-blue-900/40">
                <div className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">
                  Level 1: Weekly SMA 50
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  ${selectedItem.masterTechnicals.weeklySma50?.toFixed(2) ?? '–'}
                </div>
                <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold tabular-nums">
                  Distance:{' '}
                  {selectedItem.masterTechnicals.distWeeklySma50Pct != null
                    ? `${selectedItem.masterTechnicals.distWeeklySma50Pct >= 0 ? '+' : ''}${selectedItem.masterTechnicals.distWeeklySma50Pct.toFixed(1)}%`
                    : '–'}
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 border border-emerald-200/60 dark:border-emerald-900/40">
                <div className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                  Level 2: Horiz. Support
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  ${selectedItem.masterTechnicals.horizontalSupport?.toFixed(2) ?? '–'}
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                  Mid Support (Tranche 2)
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 p-2.5 border border-emerald-300/70 dark:border-emerald-800/60">
                <div className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                  Level 3: Weekly SMA 200
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  ${selectedItem.masterTechnicals.weeklySma200?.toFixed(2) ?? '–'}
                </div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums">
                  Distance:{' '}
                  {selectedItem.masterTechnicals.distWeeklySma200Pct != null
                    ? `${selectedItem.masterTechnicals.distWeeklySma200Pct >= 0 ? '+' : ''}${selectedItem.masterTechnicals.distWeeklySma200Pct.toFixed(1)}%`
                    : '–'}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Inverse Hedging ETF
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {selectedItem.pair.inverseSymbol ?? 'SQQQ'}{' '}
                  {selectedItem.pair.inverseLeverage ? `(${selectedItem.pair.inverseLeverage}× Short)` : ''}
                </div>
                <div className="text-[11px] text-slate-500">At RSI ≥ 78 before 1Y tax test</div>
              </div>
            </div>
          </div>

          {/* Side-by-side or stacked: Visual Gaussian Bell Curve + 3-Tranche Calculator */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            <div className="xl:col-span-5">
              <GaussianBellCurveChart
                symbol={selectedItem.queriedSymbol}
                masterSymbol={selectedItem.pair.masterSymbol}
                distributions={selectedItem.gaussian}
              />
            </div>
            <div className="xl:col-span-7">
              <TrancheCalculatorWidget
                item={selectedItem}
                defaultCapitalUsd={defaultCapitalUsd}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
