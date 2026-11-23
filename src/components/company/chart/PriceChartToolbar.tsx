'use client';

import React from 'react';
import { Ruler, TrendingUp, Eraser, Minus, Square, ArrowUpRight, Percent, Save, Check, CloudOff, SlidersHorizontal } from 'lucide-react';
import { event as gaEvent } from '@/lib/ga';
import type { DrawTool } from './ChartDrawTools';
import { formatFairDollar, formatFairStatus, type FairMethod } from '@/lib/valuation/fairValue';
import {
  METRICS,
  INDICATORS,
  TOOL_LABEL,
  FWD_CONS,
  FAIR_COLOR,
  PE_LINE,
  BM_LINE,
  fmtMetric,
  type MetricDef,
  type MetricField,
  type MetricStats,
  type PeriodLabel,
  type IndKey,
  type ModeKey,
} from './priceChartMath';

export interface PeHeadlineState {
  peLive: number | null;
  chgPct: number | null;
  premVsMedian: number | null;
  eps: number | null;
  avg1y: number | null;
  price: number;
  date: string;
  perShare: number | null;
  isConsensus: boolean;
  lastRealized: number | null;
}

export interface PriceStatsState {
  last: number;
  date: string;
  headline: number;
  changePct: number;
  up: boolean;
}

export interface FairPremiumState {
  fair: number;
  bear: number | null;
  bull: number | null;
  method: FairMethod | null;
  undervalPct: number;
}

export interface PriceChartHeaderToolbarProps {
  ticker: string;
  mode: ModeKey;
  metric: MetricField;
  activeMetric: MetricDef;
  valStats: Partial<Record<MetricField, MetricStats>>;
  peHeadline: PeHeadlineState | null;
  fwdPeAsOf: string | null;
  stats: PriceStatsState | null;
  currentPrice?: number | null | undefined;
  currentChangePct?: number | null | undefined;
  changeLabel: string;
  activePeriod: PeriodLabel;
  periodChoices: { label: PeriodLabel; years: number }[];
  bmActive: boolean;
  bmSym: string | null;
  bmLabel: string;
  benchmarkChoices: { sym: string; label: string; title: string }[];
  inds: Set<IndKey>;
  openMenu: 'metric' | 'overlays' | 'compare' | 'draw' | 'tools' | null;
  setOpenMenu: React.Dispatch<React.SetStateAction<'metric' | 'overlays' | 'compare' | 'draw' | 'tools' | null>>;
  menuWrapRef: React.RefObject<HTMLDivElement | null>;
  drawTool: DrawTool;
  setDrawTool: React.Dispatch<React.SetStateAction<DrawTool>>;
  drawingsCount: number;
  drawDirty: boolean;
  drawSave: 'idle' | 'saving' | 'saved' | 'error';
  loggedIn: boolean;
  saveToAccount: () => void;
  clearDrawings: () => void;
  fairPremium: FairPremiumState | null;
  fvInfoAnchor: 'top' | 'bottom' | null;
  toggleFvInfo: (anchor: 'top' | 'bottom') => void;
  animatedSet: (fn: () => void) => void;
  setMode: React.Dispatch<React.SetStateAction<ModeKey>>;
  setMetric: React.Dispatch<React.SetStateAction<MetricField>>;
  setPeriod: React.Dispatch<React.SetStateAction<PeriodLabel>>;
  setPeBrush: React.Dispatch<React.SetStateAction<{ startIndex: number; endIndex: number } | null>>;
  setPeEpoch: React.Dispatch<React.SetStateAction<number>>;
  setBmSym: React.Dispatch<React.SetStateAction<string | null>>;
  toggleInd: (k: IndKey) => void;
}

/** Price / valuation headline + overlays / tools / period controls for PriceCandlestickChart. */
export function PriceChartHeaderToolbar({
  ticker,
  mode,
  metric,
  activeMetric,
  valStats,
  peHeadline,
  fwdPeAsOf,
  stats,
  currentPrice,
  currentChangePct,
  changeLabel,
  activePeriod,
  periodChoices,
  bmActive,
  bmSym,
  bmLabel,
  benchmarkChoices,
  inds,
  openMenu,
  setOpenMenu,
  menuWrapRef,
  drawTool,
  setDrawTool,
  drawingsCount,
  drawDirty,
  drawSave,
  loggedIn,
  saveToAccount,
  clearDrawings,
  fairPremium,
  fvInfoAnchor,
  toggleFvInfo,
  animatedSet,
  setMode,
  setMetric,
  setPeriod,
  setPeBrush,
  setPeEpoch,
  setBmSym,
  toggleInd,
}: PriceChartHeaderToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-3 gap-2">
      {mode === 'pe' && peHeadline ? (
        <div key={metric} className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0 pmp-fade-up">
          <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            {peHeadline.peLive != null ? fmtMetric(peHeadline.peLive, activeMetric.unit) : 'n/m'}
          </span>
          {peHeadline.isConsensus && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ color: FWD_CONS, backgroundColor: 'rgba(217,119,6,0.12)' }}
              title={`Finnhub consensus forward P/E${fwdPeAsOf ? `, snapshot ${fwdPeAsOf}` : ''} — the realized series below uses earnings reported after each date`}
            >
              consensus
            </span>
          )}
          {peHeadline.premVsMedian != null && (
            <span
              className={`text-sm font-semibold ${(activeMetric.lowerIsBetter ? peHeadline.premVsMedian <= 0 : peHeadline.premVsMedian >= 0) ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              title={`${activeMetric.label} vs its own median over the stored history — ${activeMetric.lowerIsBetter ? 'above median = more expensive than usual' : 'above median = richer yield than usual'}`}
            >
              {peHeadline.premVsMedian >= 0 ? '+' : ''}{peHeadline.premVsMedian.toFixed(1)}% vs median
            </span>
          )}
          {peHeadline.peLive == null && (
            <span className="text-xs text-gray-500 dark:text-gray-400">not meaningful</span>
          )}
        </div>
      ) : stats && (
        <div key="price" className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0 pmp-fade-up">
          <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            ${stats.headline.toFixed(2)}
          </span>
          <span
            className={`text-sm font-semibold ${stats.up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {stats.changePct >= 0 ? '+' : ''}{stats.changePct.toFixed(2)}%{currentChangePct == null ? ` (${activePeriod})` : ` (${changeLabel})`}
          </span>
          {currentPrice != null && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              last candle ${stats.last.toFixed(2)} on {stats.date}
            </span>
          )}
          {!bmActive && fairPremium && (
            <button
              type="button"
              onClick={() => toggleFvInfo('top')}
              aria-expanded={fvInfoAnchor === 'top'}
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full tabular-nums transition-shadow hover:shadow-sm cursor-pointer ${
                Math.abs(fairPremium.undervalPct) < 1
                  ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  : fairPremium.undervalPct > 0
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800'
                    : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800'
              }`}
              title="Click to see how Fair Value is calculated"
            >
              <span className="w-2.5 border-t-2 border-dashed" style={{ borderColor: FAIR_COLOR }} />
              <span>{formatFairStatus(fairPremium.undervalPct)}</span>
              <span className="font-medium opacity-75">· Fair {formatFairDollar(fairPremium.fair)}</span>
              <span className="text-[9px] opacity-70">{fvInfoAnchor === 'top' ? '▴' : '▾'}</span>
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:justify-end sm:ml-auto" ref={menuWrapRef}>
        {mode === 'pe' ? (
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => animatedSet(() => { setMode('price'); setOpenMenu(null); gaEvent('chart_mode', { mode: 'price', ticker }); })}
              className="px-2 py-1 text-xs font-semibold rounded-md text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-900 transition-colors"
              title="Switch back to candlestick price chart"
            >
              ← Price
            </button>
            <span className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === 'metric' ? null : 'metric'))}
                aria-haspopup="listbox"
                aria-expanded={openMenu === 'metric'}
                title="Valuation multiple to chart"
                className="min-w-[88px] justify-between px-2.5 py-1 text-xs font-bold rounded-md bg-white dark:bg-gray-900 shadow-sm flex items-center gap-1.5"
                style={{ color: PE_LINE }}
              >
                <span>{activeMetric.label}</span>
                <span className="text-[9px] opacity-60">{openMenu === 'metric' ? '▴' : '▾'}</span>
              </button>
              {openMenu === 'metric' && (
                <div
                  role="listbox"
                  className="absolute left-0 top-full mt-1 z-50 min-w-[150px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1"
                >
                  {METRICS.map((m) => {
                    const has = !!valStats[m.field];
                    const active = metric === m.field;
                    return (
                      <button
                        key={m.field}
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={!has}
                        onClick={() => { setOpenMenu(null); animatedSet(() => { setMetric(m.field); gaEvent('chart_metric', { metric: m.field, ticker }); }); }}
                        title={has ? `${m.label} = ${m.formula}` : `${m.label} history not available`}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          active
                            ? 'text-gray-900 dark:text-white font-semibold'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span className="w-3 text-center">{active ? '✓' : ''}</span>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5">
            {!bmActive && (
              <label
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer select-none transition-colors ${
                  inds.has('fair')
                    ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
                title="Toggle Fair value blue line and green/red buy/sell zones"
              >
                <input
                  type="checkbox"
                  checked={inds.has('fair')}
                  onChange={() => toggleInd('fair')}
                  aria-label="Fair value"
                  className="h-3.5 w-3.5 rounded accent-blue-600 cursor-pointer"
                />
                <span className="w-2.5 border-t-2 border-dashed shrink-0" style={{ borderColor: FAIR_COLOR }} />
                <span>Fair value</span>
              </label>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === 'overlays' ? null : 'overlays'))}
                aria-haspopup="true"
                aria-expanded={openMenu === 'overlays'}
                title="Chart overlays — moving averages, Bollinger bands, 52-week range"
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  openMenu === 'overlays' || INDICATORS.some((i) => inds.has(i.key))
                    ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {INDICATORS.some((i) => inds.has(i.key)) && (
                  <span className="flex items-center -space-x-0.5">
                    {INDICATORS.filter((i) => inds.has(i.key)).map((i) => (
                      <span key={i.key} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i.color }} />
                    ))}
                  </span>
                )}
                Overlays
                <span className="text-[9px] opacity-60">{openMenu === 'overlays' ? '▴' : '▾'}</span>
              </button>
              {openMenu === 'overlays' && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-1 z-50 min-w-[170px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1"
                >
                  {INDICATORS.map((ind) => (
                    <button
                      key={ind.key}
                      type="button"
                      onClick={() => toggleInd(ind.key)}
                      title={
                        ind.key === 'volspike'
                          ? 'Highlight weeks with volume > 2× the 20-week average'
                          : undefined
                      }
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        inds.has(ind.key)
                          ? 'text-gray-900 dark:text-white font-semibold'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: inds.has(ind.key) ? ind.color : 'rgba(148,163,184,0.4)' }}
                      />
                      {ind.label}
                      {inds.has(ind.key) && <span className="ml-auto text-[10px]">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {bmSym && (
              <button
                type="button"
                onClick={() => animatedSet(() => { setBmSym(null); gaEvent('chart_compare', { symbol: bmSym, state: 'off', ticker }); })}
                title={`Comparing vs ${bmLabel} — click to exit comparison`}
                className="px-2 py-1 text-xs font-semibold rounded-md bg-white dark:bg-gray-900 shadow-sm flex items-center gap-1"
                style={{ color: BM_LINE }}
              >
                <span>⇄ {bmLabel}</span>
                <span className="text-[10px] opacity-70">×</span>
              </button>
            )}
            {drawTool && !bmActive && (
              <button
                type="button"
                onClick={() => setDrawTool(null)}
                title="Active drawing tool — click to exit drawing mode"
                className="px-2 py-1 text-xs font-semibold rounded-md bg-white dark:bg-gray-900 shadow-sm text-violet-600 dark:text-violet-400 flex items-center gap-1"
              >
                <span>{TOOL_LABEL[drawTool] ?? 'Draw'}</span>
                <span className="text-[10px] opacity-70">×</span>
              </button>
            )}
            {(drawingsCount > 0 || drawSave === 'saved') && (
              <button
                type="button"
                onClick={saveToAccount}
                disabled={drawSave === 'saving'}
                title={loggedIn ? 'Save drawings to your account' : 'Sign in to save drawings to your account'}
                className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 disabled:opacity-50 ${
                  drawSave === 'saved'
                    ? 'bg-white dark:bg-gray-900 shadow-sm text-emerald-600 dark:text-emerald-400'
                    : drawDirty
                      ? 'bg-white dark:bg-gray-900 shadow-sm text-violet-600 dark:text-violet-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {drawSave === 'saved' ? <Check size={12} /> : drawSave === 'error' ? <CloudOff size={12} /> : <Save size={12} />}
                <span>{drawSave === 'saving' ? 'Saving…' : drawSave === 'saved' ? 'Saved' : drawSave === 'error' ? 'Retry' : 'Save'}</span>
              </button>
            )}
          </div>
        )}

        <div className="relative bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setOpenMenu((m) => (m === 'tools' ? null : 'tools'))}
            aria-haspopup="true"
            aria-expanded={openMenu === 'tools'}
            title="Chart mode (Valuation multiples), benchmark comparison, and drawing tools"
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              openMenu === 'tools' || mode === 'pe' || bmSym || drawTool
                ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <SlidersHorizontal size={12} />
            <span>Tools</span>
            <span className="text-[9px] opacity-60">{openMenu === 'tools' ? '▴' : '▾'}</span>
          </button>
          {openMenu === 'tools' && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-50 min-w-[215px] max-h-[75vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1.5"
            >
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Chart View
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  animatedSet(() => { setMode('price'); gaEvent('chart_mode', { mode: 'price', ticker }); });
                }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  mode === 'price' ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <span className="w-3 text-center">{mode === 'price' ? '✓' : ''}</span>
                Price Candles
              </button>
              <button
                type="button"
                disabled={!Object.keys(valStats).length}
                onClick={() => {
                  setOpenMenu(null);
                  animatedSet(() => { setMode('pe'); gaEvent('chart_mode', { mode: 'valuation', ticker }); });
                }}
                title={Object.keys(valStats).length ? 'Historical P/E, P/S, P/B vs median' : 'Valuation history not available'}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed ${
                  mode === 'pe' ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <span className="w-3 text-center">{mode === 'pe' ? '✓' : ''}</span>
                Valuation Multiples ({activeMetric.label})
              </button>

              {benchmarkChoices.length > 0 && (
                <>
                  <div className="my-1.5 h-px bg-gray-100 dark:bg-gray-700" />
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Compare Benchmark
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      if (bmSym) animatedSet(() => { setBmSym(null); gaEvent('chart_compare', { symbol: bmSym, state: 'off', ticker }); });
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      bmSym == null ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <span className="w-3 text-center">{bmSym == null ? '✓' : ''}</span>
                    None (candles only)
                  </button>
                  {benchmarkChoices.map((b) => (
                    <button
                      key={b.sym}
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        if (bmSym !== b.sym) {
                          animatedSet(() => { setMode('price'); setBmSym(b.sym); gaEvent('chart_compare', { symbol: b.sym, state: 'on', ticker }); });
                        }
                      }}
                      title={`${b.title} — relative performance rebased to range start`}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        bmSym === b.sym ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      <span className="w-3 text-center">{bmSym === b.sym ? '✓' : ''}</span>
                      {b.label}
                    </button>
                  ))}
                </>
              )}

              <div className="my-1.5 h-px bg-gray-100 dark:bg-gray-700" />
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Draw on Chart
              </div>
              {([
                ['measure', 'Measure move', <Ruler key="r" size={13} />],
                ['trend', 'Trendline', <TrendingUp key="t" size={13} />],
                ['ray', 'Ray', <ArrowUpRight key="a" size={13} />],
                ['hline', 'Horizontal level', <Minus key="h" size={13} />],
                ['zone', 'Zone', <Square key="z" size={13} />],
                ['fibo', 'Fib retracement', <Percent key="f" size={13} />],
              ] as [DrawTool & string, string, React.ReactNode][]).map(([k, label, icon]) => (
                <button
                  key={k}
                  type="button"
                  disabled={bmActive}
                  onClick={() => {
                    setOpenMenu(null);
                    setMode('price');
                    setDrawTool(drawTool === k ? null : k);
                    gaEvent('chart_draw', { tool: k, ticker });
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed ${
                    drawTool === k ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span className="shrink-0">{icon}</span>
                  <span>{label}</span>
                  {drawTool === k && <span className="ml-auto text-[10px]">✓</span>}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setOpenMenu(null); setDrawTool(null); clearDrawings(); }}
                disabled={!drawingsCount}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eraser size={13} className="shrink-0" />
                Clear drawings{drawingsCount ? ` (${drawingsCount})` : ''}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5 gap-0.5">
          {periodChoices.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => animatedSet(() => { setPeriod(p.label); setPeBrush(null); setPeEpoch((e) => e + 1); gaEvent('chart_period', { period: p.label, ticker }); })}
              className={`px-2 sm:px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                activePeriod === p.label
                  ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
