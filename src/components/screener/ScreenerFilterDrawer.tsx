'use client';

import React from 'react';
import { DualRangeSlider } from '@/components/analysis/DualRangeSlider';
import { PeVsMedianFilter } from '@/components/PeVsMedianFilter';
import {
  MARKET_CAP_PRESETS,
  MARKET_RANGE_FILTERS,
  METRIC_FILTERS,
  INSIDER_RANGE_FILTERS,
  ANALYSIS_RANGE_FILTERS,
  RANGE_FILTERS,
  type RangeFilterKey,
  type PeMedianWindowId,
  PE_MEDIAN_KEYS,
  SCORE_FILTERS,
  ADVANCED_FILTERS,
  VERDICT_FILTERS,
  type ScoreFilterKey,
  type AdvancedFilterKey,
  type ScoreRange,
  type VerdictFilterKey,
} from '@/lib/utils/screener';
import { FILTER_DRAWER_TABS, type FilterTabId, SLIDER_BY_KEY } from './screenerColumns';

interface ScreenerFilterDrawerProps {
  activeFilterTab: FilterTabId;
  peMedDef: { id: PeMedianWindowId; key: RangeFilterKey; label: string };
  changePeMedWindow: (id: PeMedianWindowId) => void;
  scoreRanges: Partial<Record<ScoreFilterKey, ScoreRange>>;
  setScoreRange: (key: ScoreFilterKey, range: ScoreRange | undefined) => void;
  metricRanges: Partial<Record<RangeFilterKey, { min?: number; max?: number }>>;
  setMetricRange: (key: RangeFilterKey, range: { min?: number; max?: number } | undefined) => void;
  advanced: Record<AdvancedFilterKey, number>;
  setAdvancedValue: (key: AdvancedFilterKey, v: number) => void;
  metricsActive: boolean;
}

/** Expandable Finviz-style category filter drawer with score, range, and quality controls. */
export function ScreenerFilterDrawer({
  activeFilterTab,
  peMedDef,
  changePeMedWindow,
  scoreRanges,
  setScoreRange,
  metricRanges,
  setMetricRange,
  advanced,
  setAdvancedValue,
  metricsActive,
}: ScreenerFilterDrawerProps) {
  const tab = FILTER_DRAWER_TABS.find((t) => t.id === activeFilterTab);
  if (!tab) return null;

  const sliderDefs = tab.keys
    .filter((k) => !PE_MEDIAN_KEYS.has(k))
    .map((k) => SLIDER_BY_KEY.get(k))
    .filter((d): d is NonNullable<typeof d> => !!d);
  const showPeMedian = tab.keys.some((k) => PE_MEDIAN_KEYS.has(k));
  const peMedSlider = SLIDER_BY_KEY.get(peMedDef.key);
  const showScoresBlock = 'includesScores' in tab && tab.includesScores;
  const showAdvancedBlock = 'includesAdvanced' in tab && tab.includesAdvanced;

  const rangeSliderProps = (def: { key: RangeFilterKey; min: number; max: number }) => {
    const r = metricRanges[def.key];
    const apply = (side: 'min' | 'max', v: number) => {
      const next: { min?: number; max?: number } = { ...r };
      if (side === 'min') { if (v === def.min) delete next.min; else next.min = v; }
      else { if (v === def.max) delete next.max; else next.max = v; }
      setMetricRange(def.key, next.min === undefined && next.max === undefined ? undefined : next);
    };
    return {
      valueMin: r?.min ?? def.min,
      valueMax: r?.max ?? def.max,
      onChangeMin: (v: number) => apply('min', v),
      onChangeMax: (v: number) => apply('max', v),
    };
  };

  const scoreSliderProps = (def: (typeof SCORE_FILTERS)[number]) => {
    const r = scoreRanges[def.key];
    const apply = (side: 'min' | 'max', v: number) => {
      const next: { min?: number; max?: number } = { ...r };
      if (side === 'min') { if (v === 0) delete next.min; else next.min = v; }
      else { if (v === 100) delete next.max; else next.max = v; }
      setScoreRange(def.key, next);
    };
    return {
      valueMin: r?.min ?? 0,
      valueMax: r?.max ?? 100,
      onChangeMin: (v: number) => apply('min', v),
      onChangeMax: (v: number) => apply('max', v),
    };
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/80 space-y-3">
      {showScoresBlock && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">PMP Pillar Scores (0–100)</span>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-3 gap-y-2">
            {SCORE_FILTERS.map((d) => (
              <DualRangeSlider
                key={d.key}
                label={d.label}
                min={0}
                max={100}
                {...scoreSliderProps(d)}
                accentColor={d.accent}
              />
            ))}
          </div>
        </div>
      )}

      {showPeMedian && peMedSlider && (
        <PeVsMedianFilter
          windowId={peMedDef.id}
          onWindowChange={changePeMedWindow}
          range={metricRanges[peMedDef.key]}
          onRangeChange={(r) => setMetricRange(peMedDef.key, r)}
          min={peMedSlider.min}
          max={peMedSlider.max}
        />
      )}

      {sliderDefs.length > 0 && (
        <div>
          {showScoresBlock && (
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Range Filters</span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3.5 gap-y-2.5">
            {sliderDefs.map((def) => (
              <div key={def.key} className={metricRanges[def.key] ? 'rounded-md ring-1 ring-blue-400/60 bg-blue-50/50 dark:bg-blue-950/20 -m-0.5 p-0.5' : ''}>
                <DualRangeSlider
                  label={def.label}
                  hint={'hint' in def ? def.hint : undefined}
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  {...rangeSliderProps(def)}
                  accentColor="sky"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdvancedBlock && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Quality & Safety Thresholds</span>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2">
            {ADVANCED_FILTERS.map((d) => {
              const raw = advanced[d.key];
              const shown = d.active(raw)
                ? String(Math.round(raw * d.displayScale * 100) / 100)
                : '';
              return (
                <div key={d.key} className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 tracking-wide">{d.label}</label>
                  <input
                    type="number"
                    step={d.key === 'minPiotroski' ? 1 : 'any'}
                    value={shown}
                    onChange={(e) => {
                      let v = parseFloat(e.target.value);
                      if (!Number.isFinite(v)) v = d.def;
                      else v = v / d.displayScale;
                      if (d.key === 'minPiotroski') v = Math.min(9, Math.max(0, Math.round(v)));
                      setAdvancedValue(d.key, v);
                    }}
                    placeholder="—"
                    className="h-7 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
                  />
                  <span className="text-[10px] text-gray-400">{d.hint}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {metricsActive && (
        <div className="flex items-center justify-end pt-1">
          <button
            onClick={() => { for (const def of [...MARKET_RANGE_FILTERS, ...METRIC_FILTERS, ...INSIDER_RANGE_FILTERS, ...ANALYSIS_RANGE_FILTERS]) setMetricRange(def.key as RangeFilterKey, undefined); }}
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear metric filters
          </button>
        </div>
      )}
    </div>
  );
}

interface ScreenerActiveChipsProps {
  scoreRanges: Partial<Record<ScoreFilterKey, ScoreRange>>;
  setScoreRange: (key: ScoreFilterKey, range: ScoreRange | undefined) => void;
  metricRanges: Partial<Record<RangeFilterKey, { min?: number; max?: number }>>;
  setMetricRange: (key: RangeFilterKey, range: { min?: number; max?: number } | undefined) => void;
  advanced: Record<AdvancedFilterKey, number>;
  setAdvancedValue: (key: AdvancedFilterKey, v: number) => void;
  selectedSector: string;
  setSelectedSector: (v: string) => void;
  selectedIndustry: string;
  setSelectedIndustry: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  marketCapPreset: string;
  setMarketCapPreset: (v: string) => void;
  trendConfirmed: boolean;
  setTrendConfirmed: (v: boolean) => void;
  verdictFilters: Partial<Record<VerdictFilterKey, string>>;
  setVerdictFilter: (key: VerdictFilterKey, value: string | undefined) => void;
  resetFilters: () => void;
}

/** Active filter summary pills at the bottom of the screener filter card. */
export function ScreenerActiveChips({
  scoreRanges,
  setScoreRange,
  metricRanges,
  setMetricRange,
  advanced,
  setAdvancedValue,
  selectedSector,
  setSelectedSector,
  selectedIndustry,
  setSelectedIndustry,
  searchQuery,
  setSearchQuery,
  marketCapPreset,
  setMarketCapPreset,
  trendConfirmed,
  setTrendConfirmed,
  verdictFilters,
  setVerdictFilter,
  resetFilters,
}: ScreenerActiveChipsProps) {
  const chips: { id: string; label: string; clear: () => void }[] = [];
  const fmtBound = (r: { min?: number; max?: number } | undefined, lo: number, hi: number) => {
    const a = r?.min !== undefined && r.min !== lo ? `≥${r.min}` : '';
    const b = r?.max !== undefined && r.max !== hi ? `≤${r.max}` : '';
    return [a, b].filter(Boolean).join(' ');
  };

  for (const d of SCORE_FILTERS) {
    const bounds = fmtBound(scoreRanges[d.key], 0, 100);
    if (bounds) chips.push({ id: `s:${d.key}`, label: `${d.label} ${bounds}`, clear: () => setScoreRange(d.key, undefined) });
  }
  for (const d of RANGE_FILTERS) {
    const r = metricRanges[d.key];
    if (!r) continue;
    const bounds = fmtBound(r, d.min, d.max);
    if (bounds) chips.push({ id: `m:${d.key}`, label: `${d.label} ${bounds}`, clear: () => setMetricRange(d.key, undefined) });
  }
  for (const d of ADVANCED_FILTERS) {
    const v = advanced[d.key];
    if (d.active(v)) chips.push({ id: `a:${d.key}`, label: `${d.label.replace(/ %\)$/, ')')}: ${Math.round(v * d.displayScale * 100) / 100}`, clear: () => setAdvancedValue(d.key, d.def) });
  }
  if (selectedSector) chips.push({ id: 'sector', label: `Sector: ${selectedSector}`, clear: () => setSelectedSector('') });
  if (selectedIndustry) chips.push({ id: 'industry', label: `Industry: ${selectedIndustry}`, clear: () => setSelectedIndustry('') });
  if (searchQuery) chips.push({ id: 'q', label: `“${searchQuery}”`, clear: () => setSearchQuery('') });
  if (marketCapPreset !== 'all') {
    const p = MARKET_CAP_PRESETS.find((x) => x.id === marketCapPreset);
    if (p) chips.push({ id: 'mcap', label: `Cap: ${p.label}`, clear: () => setMarketCapPreset('all') });
  }
  if (trendConfirmed) {
    chips.push({ id: 'trend', label: 'Trend × Fundamentals', clear: () => setTrendConfirmed(false) });
  }
  for (const d of VERDICT_FILTERS) {
    const v = verdictFilters[d.key];
    if (v) {
      const o = d.options.find((x) => x.value === v);
      chips.push({ id: `v:${d.key}`, label: `${d.label}: ${o?.label ?? v}`, clear: () => setVerdictFilter(d.key, undefined) });
    }
  }

  if (chips.length === 0) return null;

  return (
    <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-slate-700/80 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-0.5">Active:</span>
      {chips.map((c) => (
        <span key={c.id} className="inline-flex items-center rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-[10px] text-blue-700 dark:text-blue-300 overflow-hidden">
          <span className="pl-2 pr-1 py-0.5">{c.label}</span>
          <button onClick={c.clear} className="px-1.5 py-0.5 hover:text-red-500" title="Clear filter">×</button>
        </span>
      ))}
      <button onClick={resetFilters} className="text-[10px] text-gray-400 hover:text-red-500 underline underline-offset-2 ml-1">Clear all</button>
    </div>
  );
}
