'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { MarketSignals } from './MarketSignals';
import { NotificationToggle } from '../notifications/NotificationToggle';
import { DualRangeSlider } from './DualRangeSlider';
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
            setResults(data.results);
            setPagination(data.pagination);
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

    return (
        <div className="flex flex-col gap-6 p-4 lg:p-0 mb-20 lg:mb-0">
            {/* Market Intelligence Signals (Phase 13) */}
            <MarketSignals />

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
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex flex-wrap gap-6 items-end">
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
                    accentColor="green"
                />
                <DualRangeSlider
                    label="Valuation"
                    min={0} max={100}
                    valueMin={minValue} valueMax={maxValue}
                    onChangeMin={setMinValue} onChangeMax={setMaxValue}
                    accentColor="purple"
                />

                <div className="flex flex-col gap-2 min-w-[150px]">
                    <label className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Sort By</label>
                    <select
                        value={`${sortField}:${sortOrder}`}
                        onChange={(e) => {
                            const parts = e.target.value.split(':');
                            const f = parts[0] ?? 'healthScore';
                            const o = (parts[1] === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
                            setSortField(f);
                            setSortOrder(o);
                        }}
                        className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="healthScore:desc">Health Score (High)</option>
                        <option value="healthScore:asc">Health Score (Low)</option>
                        <option value="valuationScore:desc">Best Valuation</option>
                        <option value="profitabilityScore:desc">High Profitability</option>
                        <option value="altmanZ:desc">Safest (Altman Z)</option>
                        <option value="ticker.lastMarketCap:desc">Largest Market Cap</option>
                    </select>
                </div>

                {loading && (
                    <div className="flex-1 flex justify-end">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    </div>
                )}
            </div>

            {/* Results Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase">
                            <tr>
                                <th className="px-6 py-4 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" onClick={() => handleSort('ticker.name')}>
                                    Company <SortIcon field="ticker.name" />
                                </th>
                                <th className="px-4 py-4 text-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" onClick={() => handleSort('healthScore')}>
                                    Health <SortIcon field="healthScore" />
                                </th>
                                <th className="px-4 py-4 text-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" onClick={() => handleSort('profitabilityScore')}>
                                    Profit <SortIcon field="profitabilityScore" />
                                </th>
                                <th className="px-4 py-4 text-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" onClick={() => handleSort('valuationScore')}>
                                    Value <SortIcon field="valuationScore" />
                                </th>
                                <th className="px-4 py-4 text-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" onClick={() => handleSort('altmanZ')}>
                                    Altman Z <SortIcon field="altmanZ" />
                                </th>
                                <th className="px-6 py-4 text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" onClick={() => handleSort('ticker.lastMarketCap')}>
                                    Market Cap <SortIcon field="ticker.lastMarketCap" />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {results.map((item) => (
                                <tr
                                    key={item.symbol}
                                    onClick={() => handleTickerClick(item.symbol)}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-900/40 cursor-pointer transition-colors"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {item.ticker?.logoUrl ? (
                                                <Image src={item.ticker.logoUrl} alt={`${item.symbol} logo`} width={32} height={32} className="w-8 h-8 rounded-full bg-gray-100 p-1" unoptimized />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-bold text-xs">
                                                    {item.symbol[0]}
                                                </div>
                                            )}
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
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`font-bold ${(item.healthScore || 0) > 70 ? 'text-green-500' : (item.healthScore || 0) > 40 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {item.healthScore ?? '0'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`font-bold ${(item.profitabilityScore || 0) > 70 ? 'text-green-500' : (item.profitabilityScore || 0) > 40 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {item.profitabilityScore ?? '0'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`font-bold ${(item.valuationScore || 0) > 70 ? 'text-green-500' : (item.valuationScore || 0) > 40 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {item.valuationScore ?? '0'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <div className="flex flex-col">
                                            <span className={`font-mono font-bold ${(item.altmanZ || 0) > 3 ? 'text-green-500' : (item.altmanZ || 0) > 1.8 ? 'text-yellow-500' : 'text-red-500'}`}>
                                                {item.altmanZ?.toFixed(2) || '0.00'}
                                            </span>
                                            <span className="text-[9px] text-gray-400 uppercase">
                                                {(item.altmanZ || 0) > 3 ? 'Safe' : (item.altmanZ || 0) > 1.8 ? 'Grey' : 'Risk'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-gray-600 dark:text-gray-400">
                                        {formatMarketCap(item.ticker?.lastMarketCap)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

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

                {results.length === 0 && !loading && (
                    <div className="p-12 text-center">
                        <p className="text-gray-500">No companies match your filters.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
