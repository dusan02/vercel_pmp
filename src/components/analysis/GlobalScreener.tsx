'use client';

import React, { useState, useEffect } from 'react';
import { MarketSignals } from './MarketSignals';
import { NotificationToggle } from '../notifications/NotificationToggle';

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

    // Filters
    const [minHealth, setMinHealth] = useState<number>(0);
    const [minAltman, setMinAltman] = useState<number>(0);
    const [selectedSector, setSelectedSector] = useState<string>('');
    const [sortBy, setSortBy] = useState<string>('healthScore:desc');

    const fetchResults = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                minHealth: minHealth.toString(),
                minAltman: minAltman.toString(),
                sort: sortBy,
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
    }, [minHealth, minAltman, selectedSector, sortBy, page]);

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [minHealth, minAltman, selectedSector, sortBy]);

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
                <div className="flex flex-col gap-2 min-w-[150px]">
                    <label className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Altman Z-Score</label>
                    <select
                        value={minAltman}
                        onChange={(e) => setMinAltman(parseFloat(e.target.value))}
                        className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="0">Any Risk</option>
                        <option value="1.8">Grey Zone (&gt;1.8)</option>
                        <option value="3.0">Safe Haven (&gt;3.0)</option>
                    </select>
                </div>

                <div className="flex flex-col gap-2 min-w-[150px]">
                    <label className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Min Health Score</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min="0" max="100"
                            value={minHealth}
                            onChange={(e) => setMinHealth(parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 min-w-[30px]">{minHealth}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-2 min-w-[150px]">
                    <label className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Sort By</label>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="healthScore:desc">Health Score (High)</option>
                        <option value="valuationScore:desc">Best Valuation</option>
                        <option value="profitabilityScore:desc">High Profitability</option>
                        <option value="altmanZ:desc">Safest (Altman Z)</option>
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
                                <th className="px-6 py-4">Company</th>
                                <th className="px-4 py-4 text-center">Health</th>
                                <th className="px-4 py-4 text-center">Profit</th>
                                <th className="px-4 py-4 text-center">Value</th>
                                <th className="px-4 py-4 text-center">Altman Z</th>
                                <th className="px-6 py-4 text-right">Market Cap</th>
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
                                                <img src={item.ticker.logoUrl} alt="" className="w-8 h-8 rounded-full bg-gray-100 p-1" />
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
                                        ${((item.ticker?.lastMarketCap || 0) / 1e12).toFixed(2)}T
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
