'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { UniversalTable, ColumnDef } from './UniversalTable';
import { DualRangeSlider } from './analysis/DualRangeSlider';
import { useScreener } from '@/hooks/useScreener';
import { LivePrice } from './LivePrice';
import {
  ScreenerResult, scoreColor, altmanZLabel, piotroskiLabel, beneishLabel, fcfMarginLabel, debtRepayLabel,
  SORT_OPTIONS, SECTORS, MARKET_CAP_PRESETS,
} from '@/lib/utils/screener';
import { formatBillions, formatMarketCapDiff, formatCurrencyCompact } from '@/lib/utils/format';
import { useState, useEffect } from 'react';

// Column views — thematic subsets of the full column set. The Company column
// (ticker.name) is always first; views only switch the metric columns shown.
// Filters/sort are view-independent — switching a tab never changes the dataset.
const COLUMN_VIEWS = [
  { id: 'overview', label: 'Overview', keys: ['ticker.name', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'overallScore', 'valuationScore', 'growthScore', 'profitabilityScore', 'healthScore', 'qualityScore'] },
  { id: 'insiders', label: 'Insiders', keys: ['ticker.name', 'ticker.lastPrice', 'ticker.lastMarketCap', 'insider.netBuyValue90d', 'insider.largestBuyValue90d', 'insider.largestSellValue90d', 'insider.uniqueSellers14d', 'overallScore'] },
  { id: 'risk', label: 'Risk & Quality', keys: ['ticker.name', 'altmanZ', 'piotroskiScore', 'beneishScore', 'fcfMargin', 'healthScore', 'qualityScore', 'overallScore'] },
  { id: 'market', label: 'Market', keys: ['ticker.name', 'sector', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'ticker.lastMarketCapDiff'] },
  { id: 'all', label: 'All columns', keys: null }, // null = every defined column
] as const;

type ColumnViewId = (typeof COLUMN_VIEWS)[number]['id'];

export default function StockScreener({ initialData }: { initialData?: any[] }) {
  const router = useRouter();
  const screener = useScreener({ initialLimit: 25, defaultMinHealth: 0, defaultMinProfit: 0, defaultMinValue: 0, initialData });
  const {
    results, pagination, loading, page, setPage,
    minHealth, maxHealth, setMinHealth, setMaxHealth,
    minProfit, maxProfit, setMinProfit, setMaxProfit,
    minValue, maxValue, setMinValue, setMaxValue,
    minGrowth, maxGrowth, setMinGrowth, setMaxGrowth,
    minQuality, maxQuality, setMinQuality, setMaxQuality,
    minOverall, maxOverall, setMinOverall, setMaxOverall,
    minAltman, setMinAltman,
    minPiotroski, setMinPiotroski,
    maxBeneish, setMaxBeneish,
    minFcfMargin, setMinFcfMargin,
    maxDebtRepayment, setMaxDebtRepayment,
    selectedSector, setSelectedSector,
    selectedIndustry, setSelectedIndustry,
    searchQuery, setSearchQuery,
    industries,
    marketCapPreset, setMarketCapPreset,
    sortField, sortOrder, handleSort, setSort,
    resetFilters, hasActiveFilters, applyPreset,
  } = screener;

  const handleTickerClick = (ticker: string) => {
    router.push(`/analysis/${ticker}`);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronsUpDown size={12} className="inline ml-1 text-gray-300 dark:text-gray-600" />;
    return sortOrder === 'asc'
      ? <ChevronUp size={12} className="inline ml-1 text-blue-500" />
      : <ChevronDown size={12} className="inline ml-1 text-blue-500" />;
  };

  const allColumns: ColumnDef<ScreenerResult>[] = useMemo(() => [
    {
      key: 'ticker.name',
      header: <>Company <SortIcon field="ticker.name" /></>,
      align: 'left',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <CompanyLogo ticker={r.symbol} size={32} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-white">{r.symbol}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-32">
              {r.ticker?.name || r.symbol}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'sector',
      header: 'Sector',
      align: 'left',
      render: (r) => <span className="text-xs text-gray-600 dark:text-gray-300">{r.ticker?.sector || '-'}</span>
    },
    {
      key: 'ticker.lastPrice',
      header: <>Price <SortIcon field="ticker.lastPrice" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <LivePrice value={r.ticker?.lastPrice ?? null} format={(v) => `$${v.toFixed(2)}`} />
    },
    {
      key: 'ticker.lastChangePct',
      header: <>Change % <SortIcon field="ticker.lastChangePct" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const pct = r.ticker?.lastChangePct ?? null;
        return (
          <span className={`text-sm font-semibold tabular-nums ${pct == null ? 'text-gray-400' : pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '-'}
          </span>
        );
      }
    },
    {
      key: 'ticker.lastMarketCap',
      header: <>Market Cap <SortIcon field="ticker.lastMarketCap" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-gray-700 dark:text-gray-200">{r.ticker?.lastMarketCap ? formatBillions(r.ticker.lastMarketCap) : '-'}</span>
    },
    {
      key: 'ticker.lastMarketCapDiff',
      header: <>MCap Δ <SortIcon field="ticker.lastMarketCapDiff" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const d = r.ticker?.marketCapDiff ?? null;
        return (
          <span className={`text-sm tabular-nums ${d == null ? 'text-gray-400' : d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {d != null ? formatMarketCapDiff(d) : '-'}
          </span>
        );
      }
    },
    {
      key: 'overallScore',
      header: <>Overall <SortIcon field="overallScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className={`font-bold ${scoreColor(r.overallScore)}`}>{r.overallScore !== null ? r.overallScore.toFixed(0) : '-'}</span>
    },
    {
      key: 'valuationScore',
      header: <>Value <SortIcon field="valuationScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className={scoreColor(r.valuationScore)}>{r.valuationScore !== null ? r.valuationScore.toFixed(0) : '-'}</span>
    },
    {
      key: 'growthScore',
      header: <>Growth <SortIcon field="growthScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className={scoreColor(r.growthScore)}>{r.growthScore !== null ? r.growthScore.toFixed(0) : '-'}</span>
    },
    {
      key: 'profitabilityScore',
      header: <>Profit. <SortIcon field="profitabilityScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className={scoreColor(r.profitabilityScore)}>{r.profitabilityScore !== null ? r.profitabilityScore.toFixed(0) : '-'}</span>
    },
    {
      key: 'healthScore',
      header: <>Health <SortIcon field="healthScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className={scoreColor(r.healthScore)}>{r.healthScore !== null ? r.healthScore.toFixed(0) : '-'}</span>
    },
    {
      key: 'qualityScore',
      header: <>Quality <SortIcon field="qualityScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className={scoreColor(r.qualityScore)}>{r.qualityScore !== null ? r.qualityScore.toFixed(0) : '-'}</span>
    },
    {
      key: 'altmanZ',
      header: <>Altman Z <SortIcon field="altmanZ" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const z = altmanZLabel(r.altmanZ);
        return <span className={z.color}>{r.altmanZ !== null ? r.altmanZ.toFixed(2) : '-'}</span>;
      },
    },
    {
      key: 'piotroskiScore',
      header: <>Piotroski <SortIcon field="piotroskiScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const p = piotroskiLabel(r.piotroskiScore);
        return <span className={p.color}>{r.piotroskiScore !== null ? `${r.piotroskiScore}/9` : '-'}</span>;
      },
    },
    {
      key: 'beneishScore',
      header: <>Beneish M <SortIcon field="beneishScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const b = beneishLabel(r.beneishScore);
        return <span className={b.color}>{r.beneishScore !== null ? r.beneishScore.toFixed(2) : '-'}</span>;
      },
    },
    {
      key: 'fcfMargin',
      header: <>FCF Margin <SortIcon field="fcfMargin" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const f = fcfMarginLabel(r.fcfMargin);
        return <span className={f.color}>{r.fcfMargin !== null ? `${(r.fcfMargin * 100).toFixed(1)}%` : '-'}</span>;
      },
    },
    {
      key: 'insider.netBuyValue90d',
      header: <>Insider 90D <SortIcon field="insider.netBuyValue90d" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.insiderNetBuyValue90d;
        if (v == null) return <span className="text-gray-400">-</span>;
        const pct = r.insiderNetBuyPct90d;
        return (
          <span
            className={`text-sm tabular-nums ${v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            title={pct != null ? `Net open-market insider buying, 90D: ${formatCurrencyCompact(v, true)} (${(pct * 100).toFixed(3)}% of shares outstanding)` : `Net open-market insider buying, 90D: ${formatCurrencyCompact(v, true)}`}
          >
            {formatCurrencyCompact(v, true)}
          </span>
        );
      },
    },
    {
      key: 'insider.largestBuyValue90d',
      header: <>Top Buy <SortIcon field="insider.largestBuyValue90d" /></>,
      align: 'right',
      sortable: true,
      render: (r) => r.insiderLargestBuyValue90d != null
        ? <span className="text-sm tabular-nums text-green-600 dark:text-green-400" title="Largest single open-market insider purchase, 90D">{formatCurrencyCompact(r.insiderLargestBuyValue90d)}</span>
        : <span className="text-gray-400">-</span>,
    },
    {
      key: 'insider.largestSellValue90d',
      header: <>Top Sell <SortIcon field="insider.largestSellValue90d" /></>,
      align: 'right',
      sortable: true,
      render: (r) => r.insiderLargestSellValue90d != null
        ? <span className="text-sm tabular-nums text-red-600 dark:text-red-400" title="Largest single open-market insider sale, 90D">{formatCurrencyCompact(r.insiderLargestSellValue90d)}</span>
        : <span className="text-gray-400">-</span>,
    },
    {
      key: 'insider.uniqueSellers14d',
      header: <>Cluster 14D <SortIcon field="insider.uniqueSellers14d" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const b = r.insiderUniqueBuyers14d;
        const s = r.insiderUniqueSellers14d;
        if (b == null && s == null) return <span className="text-gray-400">-</span>;
        if (!b && !s) return <span className="text-gray-400">-</span>;
        return (
          <span className="text-sm tabular-nums" title="Distinct insiders trading open-market in the last 14 days">
            {b ? <span className="text-green-600 dark:text-green-400">{b}B</span> : null}
            {b && s ? <span className="text-gray-400">·</span> : null}
            {s ? <span className="text-red-600 dark:text-red-400">{s}S</span> : null}
          </span>
        );
      },
    },
  ], [sortField, sortOrder]);

  // ── Column view tabs — persist the last used view (localStorage + a
  // shareable ?view= param on the standalone /screener page). ────────────
  const [columnView, setColumnView] = useState<ColumnViewId>('overview');
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const fromUrl = sp.get('view') as ColumnViewId | null;
    const fromStore = localStorage.getItem('screener-column-view') as ColumnViewId | null;
    const initial = fromUrl ?? fromStore;
    if (initial && COLUMN_VIEWS.some(v => v.id === initial)) setColumnView(initial);
  }, []);
  useEffect(() => {
    localStorage.setItem('screener-column-view', columnView);
    if (window.location.pathname !== '/screener') return;
    const sp = new URLSearchParams(window.location.search);
    if (columnView === 'overview') sp.delete('view'); else sp.set('view', columnView);
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [columnView]);

  const columnMap = useMemo(() => new Map(allColumns.map(c => [c.key, c])), [allColumns]);
  const columns = useMemo(() => {
    const view = COLUMN_VIEWS.find(v => v.id === columnView);
    if (!view || view.keys === null) return allColumns;
    return (view.keys as readonly string[]).map(k => columnMap.get(k)).filter((c): c is ColumnDef<ScreenerResult> => !!c);
  }, [allColumns, columnMap, columnView]);

  const totalPages = pagination?.totalPages || 1;
  const total = pagination?.total || 0;

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Filters</span>
          <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reset
            </button>
          )}
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-200 dark:border-gray-600 border-t-blue-500" />
          )}
        </div>

        {/* Quick screens — one-tap preset combinations */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">Quick screens:</span>
          {[
            { label: 'Quality Compounders', preset: { minQuality: 80, minProfit: 75, minGrowth: 60, sort: 'qualityScore:desc' } },
            { label: 'Quality at Reasonable Price', preset: { minQuality: 75, minValue: 60, sort: 'overallScore:desc' } },
            { label: 'Growth at Reasonable Price', preset: { minGrowth: 75, minValue: 60, sort: 'growthScore:desc' } },
            { label: 'Strong Balance Sheets', preset: { minHealth: 80, minAltman: 3, sort: 'healthScore:desc' } },
            { label: 'Cash Machines', preset: { minFcfMargin: 0.15, minProfit: 60, sort: 'overallScore:desc' } },
            { label: 'Top Overall', preset: { minOverall: 75, sort: 'overallScore:desc' } },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.preset)}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-4">
          {/* Search — symbol or company name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Search</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                placeholder="Ticker or company…"
                className="w-full h-10 pl-9 pr-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
              />
            </div>
          </div>
          <DualRangeSlider
            label="Overall"
            min={0} max={100}
            valueMin={minOverall} valueMax={maxOverall}
            onChangeMin={setMinOverall} onChangeMax={setMaxOverall}
            accentColor="amber"
          />
          <DualRangeSlider
            label="Valuation"
            min={0} max={100}
            valueMin={minValue} valueMax={maxValue}
            onChangeMin={setMinValue} onChangeMax={setMaxValue}
            accentColor="violet"
          />
          <DualRangeSlider
            label="Growth"
            min={0} max={100}
            valueMin={minGrowth} valueMax={maxGrowth}
            onChangeMin={setMinGrowth} onChangeMax={setMaxGrowth}
            accentColor="sky"
          />
          <DualRangeSlider
            label="Profitability"
            min={0} max={100}
            valueMin={minProfit} valueMax={maxProfit}
            onChangeMin={setMinProfit} onChangeMax={setMaxProfit}
            accentColor="emerald"
          />
          <DualRangeSlider
            label="Health"
            min={0} max={100}
            valueMin={minHealth} valueMax={maxHealth}
            onChangeMin={setMinHealth} onChangeMax={setMaxHealth}
            accentColor="blue"
          />
          <DualRangeSlider
            label="Quality"
            min={0} max={100}
            valueMin={minQuality} valueMax={maxQuality}
            onChangeMin={setMinQuality} onChangeMax={setMaxQuality}
            accentColor="rose"
          />
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Sort By</label>
            <select
              value={`${sortField}:${sortOrder}`}
              onChange={(e) => {
                const parts = e.target.value.split(':');
                const f = parts[0] ?? 'healthScore';
                const o = (parts[1] === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
                setSort(f, o);
              }}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Sector + Market Cap + Altman row */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Sector</label>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Sectors</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Industry</label>
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Industries</option>
              {industries.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Market Cap</label>
            <select
              value={marketCapPreset}
              onChange={(e) => setMarketCapPreset(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
            >
              {MARKET_CAP_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Min Altman Z</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={minAltman || ''}
              onChange={(e) => setMinAltman(parseFloat(e.target.value) || 0)}
              placeholder="e.g. 3.0"
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
            />
          </div>
        </div>

        {/* Advanced Filters — Piotroski, Beneish, FCF Margin, Debt Repayment */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Min Piotroski F (0–9)</label>
            <input
              type="number"
              min="0"
              max="9"
              step="1"
              value={minPiotroski || ''}
              onChange={(e) => setMinPiotroski(Math.min(9, Math.max(0, parseInt(e.target.value, 10) || 0)))}
              placeholder="e.g. 7"
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
            />
            <span className="text-[10px] text-gray-400">≥7 Strong, 4–6 Avg, &lt;4 Weak</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Max Beneish M</label>
            <input
              type="number"
              step="0.1"
              value={maxBeneish >= 10 ? '' : maxBeneish}
              onChange={(e) => setMaxBeneish(parseFloat(e.target.value) || 10)}
              placeholder="e.g. -1.78"
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
            />
            <span className="text-[10px] text-gray-400">&lt;-2.22 Safe, -2.22 to -1.78 Grey, &gt;-1.78 Risky</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Min FCF Margin (%)</label>
            <input
              type="number"
              step="1"
              value={minFcfMargin <= -100 ? '' : (minFcfMargin * 100).toFixed(0)}
              onChange={(e) => setMinFcfMargin(parseFloat(e.target.value) / 100 || -100)}
              placeholder="e.g. 5"
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
            />
            <span className="text-[10px] text-gray-400">≥15% High, ≥5% Good, &lt;0% Negative</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">Max Debt Repay (years)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={maxDebtRepayment >= 350 ? '' : maxDebtRepayment}
              onChange={(e) => setMaxDebtRepayment(parseFloat(e.target.value) || 350)}
              placeholder="e.g. 5"
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
            />
            <span className="text-[10px] text-gray-400">0 = No debt, ≤3 Fast, ≤5 OK, &gt;5 Slow</span>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {loading ? 'Searching...' : `${total} result${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Results Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Column view tabs — switch metric columns without touching filters */}
        <div className="flex items-center gap-1 px-3 pt-3 pb-0 overflow-x-auto" role="tablist" aria-label="Column views">
          {COLUMN_VIEWS.map(v => (
            <button
              key={v.id}
              role="tab"
              aria-selected={columnView === v.id}
              onClick={() => setColumnView(v.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2 ${
                columnView === v.id
                  ? 'text-blue-600 dark:text-blue-400 border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
                  : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <UniversalTable
          data={results}
          columns={columns}
          keyExtractor={(r) => r.symbol}
          isLoading={loading}
          emptyMessage="No companies match the selected filters."
          sortKey={sortField as any}
          ascending={sortOrder === 'asc'}
          onSort={(key) => handleSort(key as string)}
          onRowClick={(r) => handleTickerClick(r.symbol)}
          stickyFirst
          renderMobileCard={(r) => (
            <div
              onClick={() => handleTickerClick(r.symbol)}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <CompanyLogo ticker={r.symbol} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-900 dark:text-white">{r.symbol}</div>
                  <div className="text-xs text-gray-400 truncate">{r.ticker?.name || r.symbol}</div>
                </div>
                <span className="text-xs font-mono text-gray-500">{r.ticker?.lastMarketCap ? formatBillions(r.ticker.lastMarketCap) : '-'}</span>
              </div>
              <div className="grid grid-cols-6 gap-1 text-center">
                {([
                  ['All', r.overallScore],
                  ['Val', r.valuationScore],
                  ['Grw', r.growthScore],
                  ['Prof', r.profitabilityScore],
                  ['Hlt', r.healthScore],
                  ['Qual', r.qualityScore],
                ] as [string, number | null][]).map(([lbl, v]) => (
                  <div key={lbl}>
                    <div className="text-[10px] text-gray-400 uppercase">{lbl}</div>
                    <div className={`font-bold text-sm ${scoreColor(v)}`}>{v !== null ? v.toFixed(0) : '-'}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-xs text-gray-500">
                <span>{r.ticker?.sector || '-'}</span>
                <span>{r.ticker?.lastPrice ? `$${r.ticker.lastPrice.toFixed(2)}` : '-'}</span>
              </div>
            </div>
          )}
        />

        {/* Mobile: the cards are the browse view, but they only surface the
            six scores — every other column stays reachable behind this
            disclosure as the real table with horizontal scroll. */}
        <div className="lg:hidden border-t border-gray-100 dark:border-slate-700">
          <details className="group">
            <summary className="flex items-center justify-between px-4 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span>Show full table — all {allColumns.length} columns</span>
              <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-2 pb-3">
              <UniversalTable
                data={results}
                columns={allColumns}
                keyExtractor={(r) => r.symbol}
                isLoading={loading}
                emptyMessage="No companies match the selected filters."
                sortKey={sortField as any}
                ascending={sortOrder === 'asc'}
                onSort={(key) => handleSort(key as string)}
                onRowClick={(r) => handleTickerClick(r.symbol)}
                forceTable
                stickyFirst
              />
            </div>
          </details>
        </div>

        {/* Pagination */}
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
