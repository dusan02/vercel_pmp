'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { NotificationToggle } from '../notifications/NotificationToggle';
import { DualRangeSlider } from './DualRangeSlider';
import CompanyLogo from '../CompanyLogo';
import { UniversalTable, ColumnDef } from '../UniversalTable';
import { formatMarketCap } from '@/lib/utils/format';

interface ScreenerResult {
    symbol: string;
    healthScore: number;
    profitabilityScore: number;
    valuationScore: number;
    altmanZ: number;
    debtRepaymentYears: number;
    fcfYield: number;
    lastQualitySignalAt: string | null;
    ticker: {
        name: string;
        sector: string;
        logoUrl: string;
        lastPrice: number;
        lastMarketCap: number;
    };
}

interface Pagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export function GlobalScreener() {
    const [results, setResults] = useState<ScreenerResult[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    // Filters - dual range defaults: min=50, max=100
    const [minHealth, setMinHealth] = useState<number>(50);
    const [maxHealth, setMaxHealth] = useState<number>(100);
    const [minProfit, setMinProfit] = useState<number>(50);
    const [maxProfit, setMaxProfit] = useState<number>(100);
    const [minValue, setMinValue] = useState<number>(50);
    const [maxValue, setMaxValue] = useState<number>(100);
    const [minAltman, setMinAltman] = useState<number>(0);
    const [selectedSector, setSelectedSector] = useState<string>('');
    const [sortField, setSortField] = useState<string>('healthScore');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const fetchResults = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                minHealth: minHealth.toString(),
                maxHealth: maxHealth.toString(),
                minProfitability: minProfit.toString(),
                maxProfitability: maxProfit.toString(),
                minValuation: minValue.toString(),
                maxValuation: maxValue.toString(),
                minAltman: minAltman.toString(),
                sort: `${sortField}:${sortOrder}`,
                limit: '20',
                page: page.toString()
            });
            if (selectedSector) params.append('sector', selectedSector);

            const res = await fetch(`/api/analysis/screener?${params.toString()}`);
            const data = await res.json();
            setResults(data.results || []);
            setPagination(data.pagination || null);
        } catch (error) {
            console.error('Failed to fetch screener results:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchResults();
    }, [minHealth, maxHealth, minProfit, maxProfit, minValue, maxValue, minAltman, selectedSector, sortField, sortOrder, page]);

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [minHealth, maxHealth, minProfit, maxProfit, minValue, maxValue, minAltman, selectedSector, sortField, sortOrder]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

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
                    <CompanyLogo ticker={item.symbol} logoUrl={item.ticker?.logoUrl} size={32} />
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
                <span className={`font-bold ${(item.healthScore || 0) > 70 ? 'text-green-500' : (item.healthScore || 0) > 40 ? 'text-yellow-500' : 'text-red-500'}`}>
                    {item.healthScore ?? '0'}
                </span>
            )
        },
        {
            key: 'profitabilityScore',
            header: <>Profit <SortIcon field="profitabilityScore" /></>,
            align: 'center',
            sortable: true,
            render: (item) => (
                <span className={`font-bold ${(item.profitabilityScore || 0) > 70 ? 'text-green-500' : (item.profitabilityScore || 0) > 40 ? 'text-yellow-500' : 'text-red-500'}`}>
                    {item.profitabilityScore ?? '0'}
                </span>
            )
        },
        {
            key: 'valuationScore',
            header: <>Value <SortIcon field="valuationScore" /></>,
            align: 'center',
            sortable: true,
            render: (item) => (
                <span className={`font-bold ${(item.valuationScore || 0) > 70 ? 'text-green-500' : (item.valuationScore || 0) > 40 ? 'text-yellow-500' : 'text-red-500'}`}>
                    {item.valuationScore ?? '0'}
                </span>
            )
        },
        {
            key: 'altmanZ',
            header: <>Altman Z <SortIcon field="altmanZ" /></>,
            align: 'center',
            sortable: true,
            render: (item) => (
                <div className="flex flex-col">
                    <span className={`font-mono font-bold ${(item.altmanZ || 0) > 3 ? 'text-green-500' : (item.altmanZ || 0) > 1.8 ? 'text-yellow-500' : 'text-red-500'}`}>
                        {item.altmanZ?.toFixed(2) || '0.00'}
                    </span>
                    <span className="text-[9px] text-gray-400 uppercase">
                        {(item.altmanZ || 0) > 3 ? 'Safe' : (item.altmanZ || 0) > 1.8 ? 'Grey' : 'Risk'}
                    </span>
                </div>
            )
        },
        {
            key: 'ticker.lastMarketCap',
            header: <>Market Cap <SortIcon field="ticker.lastMarketCap" /></>,
            align: 'right',
            sortable: true,
            render: (item) => (
                <span className="font-mono text-gray-600 dark:text-gray-400">
                    {formatMarketCap(item.ticker?.lastMarketCap)}
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
                                setSortField(f);
                                setSortOrder(o);
                            }}
                            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
                        >
                            <option value="healthScore:desc">Health Score ↓</option>
                            <option value="healthScore:asc">Health Score ↑</option>
                            <option value="valuationScore:desc">Valuation ↓</option>
                            <option value="valuationScore:asc">Valuation ↑</option>
                            <option value="profitabilityScore:desc">Profitability ↓</option>
                            <option value="profitabilityScore:asc">Profitability ↑</option>
                            <option value="altmanZ:desc">Altman Z ↓</option>
                            <option value="altmanZ:asc">Altman Z ↑</option>
                            <option value="ticker.lastMarketCap:desc">Market Cap ↓</option>
                            <option value="ticker.lastMarketCap:asc">Market Cap ↑</option>
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
