'use client';

import React, { useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { NotificationToggle } from '../notifications/NotificationToggle';
import { DualRangeSlider } from './DualRangeSlider';
import CompanyLogo from '../CompanyLogo';
import { UniversalTable, ColumnDef } from '../UniversalTable';
import { useScreener } from '@/hooks/useScreener';
import { ScreenerResult, scoreColor, altmanZLabel, formatScreenerMarketCap, SORT_OPTIONS } from '@/lib/utils/screener';

export function GlobalScreener() {
    const screener = useScreener({ initialLimit: 20 });
    const {
        results, pagination, loading, page, setPage,
        minHealth, maxHealth, setMinHealth, setMaxHealth,
        minProfit, maxProfit, setMinProfit, setMaxProfit,
        minValue, maxValue, setMinValue, setMaxValue,
        sortField, sortOrder, handleSort, setSort,
    } = screener;

    const SortIcon = ({ field }: { field: string }) => {
        if (sortField !== field) return <ChevronsUpDown size={12} className="inline ml-1 text-gray-300 dark:text-gray-600" />;
        return sortOrder === 'asc'
            ? <ChevronUp size={12} className="inline ml-1 text-blue-500" />
            : <ChevronDown size={12} className="inline ml-1 text-blue-500" />;
    };

    const handleTickerClick = (symbol: string) => {
        const event = new CustomEvent('mobile-nav-change', {
            detail: { tab: 'analysis', ticker: symbol }
        });
        window.dispatchEvent(event);
    };

    const columns: ColumnDef<ScreenerResult>[] = useMemo(() => [
        {
            key: 'ticker.name',
            header: <>Company <SortIcon field="ticker.name" /></>,
            align: 'left',
            sortable: true,
            render: (item) => (
                <div className="flex items-center gap-3">
                    <CompanyLogo ticker={item.symbol} logoUrl={item.ticker?.logoUrl ?? null} size={32} />
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="font-bold text-gray-900 dark:text-white">{item.symbol}</div>
                            {item.lastQualitySignalAt && (
                                <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" title="Recent Quality Breakout"></span>
                            )}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate max-w-[120px]">{item.ticker?.name || '---'}</div>
                    </div>
                </div>
            )
        },
        {
            key: 'healthScore',
            header: <>Health <SortIcon field="healthScore" /></>,
            align: 'center',
            sortable: true,
            render: (item) => (
                <span className={`font-bold ${scoreColor(item.healthScore)}`}>
                    {item.healthScore !== null ? item.healthScore.toFixed(0) : '-'}
                </span>
            )
        },
        {
            key: 'profitabilityScore',
            header: <>Profit <SortIcon field="profitabilityScore" /></>,
            align: 'center',
            sortable: true,
            render: (item) => (
                <span className={`font-bold ${scoreColor(item.profitabilityScore)}`}>
                    {item.profitabilityScore !== null ? item.profitabilityScore.toFixed(0) : '-'}
                </span>
            )
        },
        {
            key: 'valuationScore',
            header: <>Value <SortIcon field="valuationScore" /></>,
            align: 'center',
            sortable: true,
            render: (item) => (
                <span className={`font-bold ${scoreColor(item.valuationScore)}`}>
                    {item.valuationScore !== null ? item.valuationScore.toFixed(0) : '-'}
                </span>
            )
        },
        {
            key: 'altmanZ',
            header: <>Altman Z <SortIcon field="altmanZ" /></>,
            align: 'center',
            sortable: true,
            render: (item) => {
                const z = altmanZLabel(item.altmanZ);
                return (
                    <div className="flex flex-col">
                        <span className={`font-mono font-bold ${z.color}`}>
                            {item.altmanZ !== null ? item.altmanZ.toFixed(2) : '-'}
                        </span>
                        <span className="text-[9px] text-gray-400 uppercase">{z.label}</span>
                    </div>
                );
            }
        },
        {
            key: 'ticker.lastMarketCap',
            header: <>Market Cap <SortIcon field="ticker.lastMarketCap" /></>,
            align: 'right',
            sortable: true,
            render: (item) => (
                <span className="font-mono text-gray-600 dark:text-gray-400">
                    {formatScreenerMarketCap(item.ticker?.lastMarketCap)}
                </span>
            )
        },
    ], [sortField, sortOrder]);

    return (
        <div className="flex flex-col gap-6 p-4 lg:p-0 mb-20 lg:mb-0">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Global Analysis Screener</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Filter and sort the S&P 500 by professional health and quality metrics.</p>
                </div>
                <div className="w-full md:w-auto">
                    <NotificationToggle />
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Filters</span>
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
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
            </div>

            {/* Results Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <UniversalTable
                    data={results}
                    columns={columns}
                    keyExtractor={(item) => item.symbol}
                    isLoading={loading}
                    emptyMessage="No companies match your filters."
                    sortKey={sortField as any}
                    ascending={sortOrder === 'asc'}
                    onSort={(key) => handleSort(key as string)}
                    onRowClick={(item) => handleTickerClick(item.symbol)}
                    renderMobileCard={(item) => (
                        <div
                            onClick={() => handleTickerClick(item.symbol)}
                            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <CompanyLogo ticker={item.symbol} logoUrl={item.ticker?.logoUrl ?? null} size={40} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="font-bold text-gray-900 dark:text-white">{item.symbol}</div>
                                        {item.lastQualitySignalAt && (
                                            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-400 truncate">{item.ticker?.name || '---'}</div>
                                </div>
                                <span className="text-xs font-mono text-gray-500">{formatScreenerMarketCap(item.ticker?.lastMarketCap)}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-center">
                                <div>
                                    <div className="text-[10px] text-gray-400 uppercase">Health</div>
                                    <div className={`font-bold text-sm ${scoreColor(item.healthScore)}`}>{item.healthScore !== null ? item.healthScore.toFixed(0) : '-'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-400 uppercase">Profit</div>
                                    <div className={`font-bold text-sm ${scoreColor(item.profitabilityScore)}`}>{item.profitabilityScore !== null ? item.profitabilityScore.toFixed(0) : '-'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-400 uppercase">Value</div>
                                    <div className={`font-bold text-sm ${scoreColor(item.valuationScore)}`}>{item.valuationScore !== null ? item.valuationScore.toFixed(0) : '-'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-400 uppercase">Altman</div>
                                    <div className={`font-bold text-sm ${altmanZLabel(item.altmanZ).color}`}>{item.altmanZ !== null ? item.altmanZ.toFixed(1) : '-'}</div>
                                </div>
                            </div>
                        </div>
                    )}
                />

                {/* Pagination controls */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                        Showing page {page} of {pagination?.totalPages || 1}
                    </span>
                    <div className="flex gap-2">
                        <button
                            disabled={page <= 1 || loading}
                            onClick={() => setPage(p => p - 1)}
                            className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <button
                            disabled={page >= (pagination?.totalPages || 1) || loading}
                            onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
