'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { UniversalTable, type ColumnDef } from './UniversalTable';
import { useScreener } from '@/hooks/useScreener';
import { useSavedScreens, MAX_SAVED_SCREENS } from '@/hooks/useSavedScreens';
import {
  type ScreenerResult,
  type RangeFilterKey,
  type PeMedianWindowId,
  SORT_OPTIONS,
  SECTORS,
  MARKET_CAP_PRESETS,
  MARKET_RANGE_FILTERS,
  METRIC_FILTERS,
  INSIDER_RANGE_FILTERS,
  ANALYSIS_RANGE_FILTERS,
  PE_MEDIAN_WINDOWS,
  PRESET_GROUPS,
  ADVANCED_FILTERS,
} from '@/lib/utils/screener';
import VerdictMatrix from './VerdictMatrix';
import {
  COLUMN_VIEWS,
  type ColumnViewId,
  FILTER_DRAWER_TABS,
  type FilterTabId,
  PINNED_COLUMN,
  PRESET_OPTIONS,
  buildScreenerColumns,
  columnLabel,
  ScreenerMobileCard,
} from './screener/screenerColumns';
import { ScreenerFilterDrawer, ScreenerActiveChips } from './screener/ScreenerFilterDrawer';

export default function StockScreener({ initialData }: { initialData?: ScreenerResult[] | undefined }) {
  const router = useRouter();
  const screener = useScreener({ initialLimit: 25, defaultMinHealth: 0, defaultMinProfit: 0, defaultMinValue: 0, initialData });
  const {
    results, pagination, loading, page, setPage,
    scoreRanges, setScoreRange,
    advanced, setAdvancedValue,
    selectedSector, setSelectedSector,
    selectedIndustry, setSelectedIndustry,
    searchQuery, setSearchQuery,
    industries,
    marketCapPreset, setMarketCapPreset,
    trendConfirmed, setTrendConfirmed,
    verdictFilters, setVerdictFilter,
    metricRanges, setMetricRange,
    sortField, sortOrder, handleSort, setSort,
    resetFilters, hasActiveFilters, applyPreset,
    buildParamsString, restoreFromParams, isPresetActive,
  } = screener;
  const savedScreens = useSavedScreens();
  const [screenName, setScreenName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleTickerClick = (ticker: string) => {
    router.push(`/analysis/${ticker}`);
  };

  const allColumns = useMemo(
    () => buildScreenerColumns(sortField, sortOrder),
    [sortField, sortOrder],
  );

  const [columnView, setColumnView] = useState<ColumnViewId>('overview');
  const [customCols, setCustomCols] = useState<string[]>([]);
  const [showColPicker, setShowColPicker] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<FilterTabId | null>(null);
  const [peMedWindow, setPeMedWindow] = useState<PeMedianWindowId>('3y');
  const activePeMedWindow = PE_MEDIAN_WINDOWS.find((w) => metricRanges[w.key] !== undefined)
    ?? PE_MEDIAN_WINDOWS.find((w) => w.key === sortField);
  useEffect(() => {
    if (activePeMedWindow && activePeMedWindow.id !== peMedWindow) setPeMedWindow(activePeMedWindow.id);
  }, [activePeMedWindow, peMedWindow]);
  const peMedDef = PE_MEDIAN_WINDOWS.find((w) => w.id === peMedWindow) ?? PE_MEDIAN_WINDOWS[1];
  const changePeMedWindow = (id: PeMedianWindowId) => {
    const next = PE_MEDIAN_WINDOWS.find((w) => w.id === id);
    if (!next || next.id === peMedDef.id) return;
    const r = metricRanges[peMedDef.key];
    if (r) { setMetricRange(peMedDef.key, undefined); setMetricRange(next.key, r); }
    if (sortField === peMedDef.key) setSort(next.key, sortOrder);
    setPeMedWindow(id);
  };
  const advancedActiveCount = ADVANCED_FILTERS.filter((d) => d.active(advanced[d.key])).length;
  const METRIC_KEY_SET = new Set<string>([...MARKET_RANGE_FILTERS, ...METRIC_FILTERS, ...INSIDER_RANGE_FILTERS, ...ANALYSIS_RANGE_FILTERS].map(d => d.key));
  const metricsActiveCount = Object.keys(metricRanges).filter(k => METRIC_KEY_SET.has(k)).length;
  const metricsActive = metricsActiveCount > 0;
  const scoreActiveCount = Object.keys(scoreRanges).length;

  const tabActiveCount = (tab: (typeof FILTER_DRAWER_TABS)[number]): number => {
    let n = tab.keys.filter((k) => metricRanges[k] !== undefined).length;
    if ('includesScores' in tab && tab.includesScores) n += scoreActiveCount;
    if ('includesAdvanced' in tab && tab.includesAdvanced) n += advancedActiveCount;
    return n;
  };

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const fromUrl = sp.get('view') as ColumnViewId | null;
    const fromStore = localStorage.getItem('screener-column-view') as ColumnViewId | null;
    const initial = fromUrl ?? fromStore;
    if (initial && COLUMN_VIEWS.some(v => v.id === initial)) setColumnView(initial);
    const colsParam = sp.get('cols');
    const stored = localStorage.getItem('screener-custom-cols');
    try {
      if (colsParam) setCustomCols(colsParam.split(',').map((s) => s.trim()).filter(Boolean));
      else if (stored) setCustomCols(JSON.parse(stored) as string[]);
    } catch { /* ignore malformed stored state */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('screener-column-view', columnView);
    if (window.location.pathname !== '/screener') return;
    const sp = new URLSearchParams(window.location.search);
    if (columnView === 'overview') sp.delete('view'); else sp.set('view', columnView);
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [columnView]);

  useEffect(() => {
    if (customCols.length > 0) localStorage.setItem('screener-custom-cols', JSON.stringify(customCols));
    if (window.location.pathname !== '/screener') return;
    const sp = new URLSearchParams(window.location.search);
    if (columnView === 'custom' && customCols.length > 0) sp.set('cols', customCols.join(','));
    else sp.delete('cols');
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [customCols, columnView]);

  const columnMap = useMemo(() => new Map(allColumns.map(c => [c.key, c])), [allColumns]);
  const effectiveCols = useMemo<string[]>(() => {
    if (customCols.length > 0) return customCols;
    const view = COLUMN_VIEWS.find(v => v.id === columnView);
    return [...(view?.keys ?? allColumns.map(c => c.key))];
  }, [customCols, columnView, allColumns]);

  const columns = useMemo(() => {
    if (columnView === 'custom') {
      const keys = effectiveCols.filter((k) => columnMap.has(k));
      const withPin = keys.includes(PINNED_COLUMN) ? keys : [PINNED_COLUMN, ...keys];
      const resolved = withPin.map((k) => columnMap.get(k)!).filter(Boolean);
      return resolved.length > 0 ? resolved : allColumns;
    }
    const view = COLUMN_VIEWS.find(v => v.id === columnView);
    if (!view || view.keys === null) return allColumns;
    return (view.keys as readonly string[])
      .map(k => columnMap.get(k === 'peVsMedian3yPct' ? peMedDef.key : k))
      .filter((c): c is ColumnDef<ScreenerResult> => !!c);
  }, [allColumns, columnMap, columnView, effectiveCols, peMedDef.key]);

  const applyCustomCols = (next: string[]) => {
    const deduped = [PINNED_COLUMN, ...next.filter((k) => k !== PINNED_COLUMN && columnMap.has(k))];
    setCustomCols(deduped);
    setColumnView('custom');
  };
  const toggleColumn = (key: string) => {
    if (key === PINNED_COLUMN) return;
    applyCustomCols(effectiveCols.includes(key) ? effectiveCols.filter((k) => k !== key) : [...effectiveCols, key]);
  };
  const moveColumn = (key: string, dir: -1 | 1) => {
    const i = effectiveCols.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= effectiveCols.length) return;
    const next = [...effectiveCols];
    [next[i], next[j]] = [next[j]!, next[i]!];
    applyCustomCols(next);
  };

  const totalPages = pagination?.totalPages || 1;
  const total = pagination?.total || 0;
  const activePresetIdx = PRESET_OPTIONS.findIndex((s) => isPresetActive(s.preset));
  const pageSize = pagination?.limit || 25;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  return (
    <div className="space-y-3">
      {/* Filter Card — compact 2-column desktop layout (Verdict Matrix left, Universe & Quick Screens right) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3.5 sm:p-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
          <div className="lg:col-span-5 lg:pr-4 lg:border-r lg:border-gray-100 lg:dark:border-slate-700/80">
            <VerdictMatrix verdictFilters={verdictFilters} setVerdictFilter={setVerdictFilter} />
          </div>

          <div className="lg:col-span-7 flex flex-col justify-between gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Universe & Quick Screens
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {savedScreens.isAuthenticated && (
                  <>
                    {savedScreens.screens.map((s) => (
                      <span key={s.id} className="inline-flex items-center rounded-full border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 overflow-hidden">
                        <button
                          onClick={() => restoreFromParams(new URLSearchParams(s.params))}
                          title={s.params}
                          className="text-[10px] px-2 py-0.5 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                        >
                          {s.name}
                        </button>
                        <button
                          onClick={() => savedScreens.deleteScreen(s.id)}
                          title="Delete saved screen"
                          className="text-[10px] px-1.5 py-0.5 text-emerald-500/70 hover:text-red-500 transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {showSaveInput ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          autoFocus
                          value={screenName}
                          onChange={(e) => setScreenName(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && screenName.trim()) {
                              if (await savedScreens.saveScreen(screenName.trim(), buildParamsString())) {
                                setScreenName(''); setShowSaveInput(false);
                              }
                            } else if (e.key === 'Escape') { setShowSaveInput(false); }
                          }}
                          placeholder="Screen name…"
                          maxLength={40}
                          className="h-6 w-28 px-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-[11px] text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"
                        />
                        <button
                          onClick={async () => {
                            if (screenName.trim() && await savedScreens.saveScreen(screenName.trim(), buildParamsString())) {
                              setScreenName(''); setShowSaveInput(false);
                            }
                          }}
                          disabled={savedScreens.loading || !screenName.trim()}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-blue-600 text-white disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button onClick={() => setShowSaveInput(false)} className="text-[11px] text-gray-400 hover:text-gray-600">×</button>
                      </span>
                    ) : savedScreens.canSave ? (
                      <button
                        onClick={() => setShowSaveInput(true)}
                        disabled={!hasActiveFilters}
                        title={hasActiveFilters ? `Save current filters (${savedScreens.screens.length}/${MAX_SAVED_SCREENS})` : 'Set some filters first'}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        + Save ({savedScreens.screens.length}/{MAX_SAVED_SCREENS})
                      </button>
                    ) : null}
                  </>
                )}
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Reset all
                  </button>
                )}
                {loading && (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-gray-200 dark:border-gray-600 border-t-blue-500" />
                )}
              </div>
            </div>

            {/* 2×3 Control Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Preset Screen</label>
                <select
                  value={activePresetIdx >= 0 ? String(activePresetIdx) : ''}
                  onChange={(e) => {
                    if (e.target.value === '') { resetFilters(); return; }
                    const s = PRESET_OPTIONS[Number(e.target.value)];
                    if (s) applyPreset(s.preset);
                  }}
                  className="h-8 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
                >
                  <option value="">All stocks (no preset)</option>
                  {PRESET_GROUPS.filter((g) => g.id !== 'verdict').map((g) => (
                    <optgroup key={g.id} label={g.label}>
                      {PRESET_OPTIONS.map((s, i) => (s.group === g.id ? <option key={s.label} value={i}>{s.label}</option> : null))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Search</label>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ticker or company…"
                    className="w-full h-8 pl-8 pr-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Sort By</label>
                <select
                  value={`${sortField}:${sortOrder}`}
                  onChange={(e) => {
                    const parts = e.target.value.split(':');
                    const f = parts[0] ?? 'healthScore';
                    const o = (parts[1] === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
                    setSort(f, o);
                  }}
                  className="h-8 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Sector</label>
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="h-8 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
                >
                  <option value="">All Sectors</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Industry</label>
                <select
                  value={selectedIndustry}
                  onChange={(e) => setSelectedIndustry(e.target.value)}
                  className="h-8 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
                >
                  <option value="">All Industries</option>
                  {industries.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Market Cap</label>
                <select
                  value={marketCapPreset}
                  onChange={(e) => setMarketCapPreset(e.target.value)}
                  className="h-8 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
                >
                  {MARKET_CAP_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Finviz-style Filter Category Tab Strip */}
        <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-700/80 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">
            More filters:
          </span>
          {FILTER_DRAWER_TABS.map((t) => {
            const active = activeFilterTab === t.id;
            const cnt = tabActiveCount(t);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveFilterTab(prev => prev === t.id ? null : t.id)}
                aria-expanded={active}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : cnt > 0
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:border-blue-400'
                      : 'bg-gray-50 dark:bg-gray-900/70 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span>{t.label}</span>
                {cnt > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-blue-100 dark:bg-blue-900/70 text-blue-700 dark:text-blue-200'}`}>
                    {cnt}
                  </span>
                )}
                {active ? <ChevronUp size={12} /> : <ChevronDown size={12} className="opacity-60" />}
              </button>
            );
          })}
          {activeFilterTab !== null && (
            <button
              type="button"
              onClick={() => setActiveFilterTab(null)}
              className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              Hide ▴
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setMetricRange('rsi14', { max: 27 });
                setColumnView('technical');
                setSort('metrics.rsi14', 'asc');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-400 transition-colors"
              title="Filter stocks in 1st Capitulation Wave (Daily RSI ≤ 27) and switch to Technical columns"
            >
              🟢 Dip-Buy (RSI ≤ 27)
            </button>
            <a
              href="/trading-ideas"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 hover:border-blue-400 transition-colors"
              title="Open contrarian Dip-Buying Engine (Weekly RSI, 200W SMA, Master/Slave ETF & 3-Tranche Calculator)"
            >
              🎯 Trading Ideas →
            </a>
          </div>
        </div>

        {activeFilterTab !== null && (
          <ScreenerFilterDrawer
            activeFilterTab={activeFilterTab}
            peMedDef={peMedDef}
            changePeMedWindow={changePeMedWindow}
            scoreRanges={scoreRanges}
            setScoreRange={setScoreRange}
            metricRanges={metricRanges}
            setMetricRange={setMetricRange}
            advanced={advanced}
            setAdvancedValue={setAdvancedValue}
            metricsActive={metricsActive}
          />
        )}

        <ScreenerActiveChips
          scoreRanges={scoreRanges}
          setScoreRange={setScoreRange}
          metricRanges={metricRanges}
          setMetricRange={setMetricRange}
          advanced={advanced}
          setAdvancedValue={setAdvancedValue}
          selectedSector={selectedSector}
          setSelectedSector={setSelectedSector}
          selectedIndustry={selectedIndustry}
          setSelectedIndustry={setSelectedIndustry}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          marketCapPreset={marketCapPreset}
          setMarketCapPreset={setMarketCapPreset}
          trendConfirmed={trendConfirmed}
          setTrendConfirmed={setTrendConfirmed}
          verdictFilters={verdictFilters}
          setVerdictFilter={setVerdictFilter}
          resetFilters={resetFilters}
        />
      </div>

      {/* Results Table Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 px-3 pt-2 pb-1.5 border-b border-gray-100 dark:border-slate-700 bg-gray-50/40 dark:bg-slate-800/60" role="tablist" aria-label="Column views">
          {COLUMN_VIEWS.map(v => (
            <button
              key={v.id}
              role="tab"
              aria-selected={columnView === v.id}
              onClick={() => setColumnView(v.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                columnView === v.id
                  ? 'text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-950/70 font-semibold'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700/50'
              }`}
            >
              {v.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2.5 pl-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
              {loading ? 'Searching…' : total > 0 ? `${rangeStart}–${rangeEnd} of ${total}` : '0 results'}
            </span>
            {totalPages > 1 && (
              <div className="hidden sm:inline-flex items-center rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30"
                  title="Previous page"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="px-1.5 text-[11px] tabular-nums text-gray-600 dark:text-gray-300">
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30"
                  title="Next page"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            )}
            <button
              onClick={() => setShowColPicker(v => !v)}
              title="Customize columns (pick + reorder)"
              aria-expanded={showColPicker}
              className={`px-2 py-1 text-xs rounded-md border transition-colors whitespace-nowrap ${
                showColPicker
                  ? 'text-blue-600 dark:text-blue-400 border-blue-400 bg-blue-50/60 dark:bg-blue-950/40'
                  : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-700 hover:text-gray-700 dark:hover:text-gray-200 bg-white dark:bg-slate-900'
              }`}
            >
              ⚙ Columns
            </button>
          </div>
        </div>
        {showColPicker && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-900/40">
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-14 shrink-0">Shown:</span>
              {effectiveCols.filter((k) => columnMap.has(k)).map((k, i) => {
                const pinned = k === PINNED_COLUMN;
                return (
                  <span key={k} className="inline-flex items-center gap-0.5 rounded-full border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-[11px] pl-2 pr-0.5 py-0.5">
                    <span className="text-gray-700 dark:text-gray-200">{columnLabel(k)}</span>
                    {!pinned && (
                      <>
                        <button onClick={() => moveColumn(k, -1)} disabled={i <= 1} className="px-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20" title="Move left">←</button>
                        <button onClick={() => moveColumn(k, 1)} disabled={i >= effectiveCols.length - 1} className="px-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20" title="Move right">→</button>
                        <button onClick={() => toggleColumn(k)} className="px-1 text-gray-400 hover:text-red-500" title="Remove">×</button>
                      </>
                    )}
                    {pinned && <span className="pr-1.5 text-[9px] text-gray-300 dark:text-gray-600">pinned</span>}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-14 shrink-0">Add:</span>
              {allColumns
                .filter((c) => !effectiveCols.includes(c.key) && c.key !== PINNED_COLUMN)
                .map((c) => (
                  <button
                    key={c.key}
                    onClick={() => toggleColumn(c.key)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    + {columnLabel(c.key)}
                  </button>
                ))}
            </div>
          </div>
        )}
        <UniversalTable
          data={results}
          columns={columns}
          keyExtractor={(r) => r.symbol}
          isLoading={loading}
          emptyMessage="No companies match the selected filters."
          sortKey={sortField}
          ascending={sortOrder === 'asc'}
          onSort={(key) => handleSort(key as string)}
          onRowClick={(r) => handleTickerClick(r.symbol)}
          stickyFirst
          compact
          hideDefaultSortIcon
          renderMobileCard={(r) => <ScreenerMobileCard r={r} onSelect={handleTickerClick} />}
        />

        <div className="lg:hidden border-t border-gray-100 dark:border-slate-700">
          <details className="group">
            <summary className="flex items-center justify-between px-4 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span>Show table view ({columns.length} columns)</span>
              <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-2 pb-3">
              <UniversalTable
                data={results}
                columns={columns}
                keyExtractor={(r) => r.symbol}
                isLoading={loading}
                emptyMessage="No companies match the selected filters."
                sortKey={sortField}
                ascending={sortOrder === 'asc'}
                onSort={(key) => handleSort(key as string)}
                onRowClick={(r) => handleTickerClick(r.symbol)}
                forceTable
                stickyFirst
                compact
                hideDefaultSortIcon
              />
            </div>
          </details>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
