'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { UniversalTable, ColumnDef } from './UniversalTable';
import { DualRangeSlider } from './analysis/DualRangeSlider';
import { useScreener } from '@/hooks/useScreener';
import {
  ScreenerResult, scoreColor, altmanZLabel, formatScreenerMarketCap,
  SORT_OPTIONS, SECTORS,
} from '@/lib/utils/screener';

export default function StockScreener() {
  const router = useRouter();
  const screener = useScreener({ initialLimit: 25 });
  const {
    results, pagination, loading, page, setPage,
    minHealth, maxHealth, setMinHealth, setMaxHealth,
    minProfit, maxProfit, setMinProfit, setMaxProfit,
    minValue, maxValue, setMinValue, setMaxValue,
    minAltman, setMinAltman,
    selectedSector, setSelectedSector,
    sortField, sortOrder, handleSort, setSort,
    resetFilters, hasActiveFilters,
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

  const columns: ColumnDef<ScreenerResult>[] = useMemo(() => [
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
      className: 'hidden md:table-cell',
      render: (r) => <span className="text-xs text-gray-600 dark:text-gray-300">{r.ticker?.sector || '-'}</span>
    },
    {
      key: 'ticker.lastPrice',
      header: <>Price <SortIcon field="ticker.lastPrice" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-gray-700 dark:text-gray-200">{r.ticker?.lastPrice ? `$${r.ticker.lastPrice.toFixed(2)}` : '-'}</span>
    },
    {
      key: 'ticker.lastMarketCap',
      header: <>Market Cap <SortIcon field="ticker.lastMarketCap" /></>,
      align: 'right',
      sortable: true,
      className: 'hidden sm:table-cell',
      render: (r) => <span className="text-gray-700 dark:text-gray-200">{formatScreenerMarketCap(r.ticker?.lastMarketCap)}</span>
    },
    {
      key: 'healthScore',
      header: <>Health <SortIcon field="healthScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className={scoreColor(r.healthScore)}>{r.healthScore !== null ? r.healthScore.toFixed(0) : '-'}</span>
    },
    {
      key: 'profitabilityScore',
      header: <>Profit. <SortIcon field="profitabilityScore" /></>,
      align: 'right',
      sortable: true,
      className: 'hidden md:table-cell',
      render: (r) => <span className={scoreColor(r.profitabilityScore)}>{r.profitabilityScore !== null ? r.profitabilityScore.toFixed(0) : '-'}</span>
    },
    {
      key: 'valuationScore',
      header: <>Valuation <SortIcon field="valuationScore" /></>,
      align: 'right',
      sortable: true,
      className: 'hidden md:table-cell',
      render: (r) => <span className={scoreColor(r.valuationScore)}>{r.valuationScore !== null ? r.valuationScore.toFixed(0) : '-'}</span>
    },
    {
      key: 'altmanZ',
      header: <>Altman Z <SortIcon field="altmanZ" /></>,
      align: 'right',
      sortable: true,
      className: 'hidden lg:table-cell',
      render: (r) => {
        const z = altmanZLabel(r.altmanZ);
        return <span className={z.color}>{r.altmanZ !== null ? r.altmanZ.toFixed(2) : '-'}</span>;
      },
    },
  ], [sortField, sortOrder]);

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          <DualRangeSlider
            label="Health Score"
            min={0} max={100}
            valueMin={minHealth} valueMax={maxHealth}
            onChangeMin={setMinHealth} onChangeMax={setMaxHealth}
            accentColor="blue"
          />
          <DualRangeSlider
            label="Profitability"
            min={0} max={100}
            valueMin={minProfit} valueMax={maxProfit}
            onChangeMin={setMinProfit} onChangeMax={setMaxProfit}
            accentColor="emerald"
          />
          <DualRangeSlider
            label="Valuation"
            min={0} max={100}
            valueMin={minValue} valueMax={maxValue}
            onChangeMin={setMinValue} onChangeMax={setMaxValue}
            accentColor="violet"
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

        {/* Sector + Altman row */}
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
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {loading ? 'Searching...' : `${total} result${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Results Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
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
                <span className="text-xs font-mono text-gray-500">{formatScreenerMarketCap(r.ticker?.lastMarketCap)}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Health</div>
                  <div className={`font-bold text-sm ${scoreColor(r.healthScore)}`}>{r.healthScore !== null ? r.healthScore.toFixed(0) : '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Profit</div>
                  <div className={`font-bold text-sm ${scoreColor(r.profitabilityScore)}`}>{r.profitabilityScore !== null ? r.profitabilityScore.toFixed(0) : '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Value</div>
                  <div className={`font-bold text-sm ${scoreColor(r.valuationScore)}`}>{r.valuationScore !== null ? r.valuationScore.toFixed(0) : '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Altman</div>
                  <div className={`font-bold text-sm ${altmanZLabel(r.altmanZ).color}`}>{r.altmanZ !== null ? r.altmanZ.toFixed(1) : '-'}</div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-xs text-gray-500">
                <span>{r.ticker?.sector || '-'}</span>
                <span>{r.ticker?.lastPrice ? `$${r.ticker.lastPrice.toFixed(2)}` : '-'}</span>
              </div>
            </div>
          )}
        />

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
