'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import AnalysisTab from '../company/AnalysisTab';
import { IntradayChart } from '../company/IntradayChart';
import { Search, ExternalLink } from 'lucide-react';
import { SectionIcon } from '../SectionIcon';
import { formatPrice, formatPercent, formatMarketCap } from '@/lib/utils/format';

interface HomeAnalysisProps {
    activeTicker?: string;
    onTickerChange?: (ticker: string) => void;
}

interface TickerHeaderData {
    ticker: string;
    companyName: string | null;
    currentPrice: number | null;
    closePrice: number | null;
    percentChange: number | null;
    marketCap: number | null;
    sector: string | null;
    industry: string | null;
}

export function HomeAnalysis({ activeTicker: propTicker, onTickerChange }: HomeAnalysisProps) {
    // Input field state (what's in the text box)
    const [inputValue, setInputValue] = useState<string>('');

    // Company header data (name, logo context, price) for the active ticker
    const [headerData, setHeaderData] = useState<TickerHeaderData | null>(null);
    const [headerLoading, setHeaderLoading] = useState(false);

    // The currently displayed ticker — derived from prop, no local copy that can diverge
    // We always use propTicker (controlled by parent). Local-only fallback = 'NVDA'
    const activeTicker = propTicker || 'NVDA';

    useEffect(() => {
        let cancelled = false;
        setHeaderLoading(true);
        setHeaderData(null);
        fetch(`/api/stocks?tickers=${encodeURIComponent(activeTicker)}`)
            .then(r => r.json())
            .then(d => {
                if (cancelled) return;
                const row = (d?.data ?? [])[0];
                setHeaderData(row ?? null);
            })
            .catch(() => { if (!cancelled) setHeaderData(null); })
            .finally(() => { if (!cancelled) setHeaderLoading(false); });
        return () => { cancelled = true; };
    }, [activeTicker]);

    const setTicker = useCallback((t: string) => {
        if (!t) return;
        if (onTickerChange) onTickerChange(t);
        // Also dispatch mobile-nav-change so the mobile/desktop router in HomePage stays in sync
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mobile-nav-change', {
                detail: { tab: 'analysis', ticker: t }
            }));
        }
    }, [onTickerChange]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const t = inputValue.toUpperCase().trim();
        if (t) {
            setTicker(t);
            setInputValue('');
        }
    };

    const trendingTickers = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META'];

    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-20 lg:pb-0">
            {/* Compact Header Row: Icon + Title + Search bar inline */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 px-6 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Title */}
                    <div className="flex items-center shrink-0">
                        <h2 className="flex items-center gap-3 text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white m-0 relative -top-1.5">
                            <SectionIcon type="analysis" size={28} className="text-gray-900 dark:text-white shrink-0" />
                            <span>Analysis</span>
                        </h2>
                    </div>

                    {/* Inline Search */}
                    <form onSubmit={handleSearch} className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                            placeholder="Search Ticker (e.g. MSFT)"
                            className="w-full h-10 pl-9 pr-28 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                        />
                        <button
                            type="submit"
                            className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all"
                        >
                            Analyze
                        </button>
                    </form>
                </div>

                {/* Trending Pills */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className="text-xs text-gray-400 mr-1">Trending:</span>
                    {trendingTickers.map(t => (
                        <button
                            key={t}
                            onClick={() => setTicker(t)}
                            className={`text-xs px-3 py-1 rounded-full border transition-all ${activeTicker === t
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400'
                                }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Company header — name, logo, price (the AnalysisTab below is
                charts-only; without this the tab shows no company context) */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 px-5 py-4">
                {headerLoading ? (
                    <div className="flex items-center gap-3 animate-pulse">
                        <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-700 shrink-0" />
                        <div className="flex-1">
                            <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                            <div className="h-3 w-64 bg-gray-100 dark:bg-gray-800 rounded" />
                        </div>
                    </div>
                ) : headerData ? (
                    <div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <img
                                    src={`/api/logo/${encodeURIComponent(activeTicker)}?s=64&prefer=icon`}
                                    alt={`${activeTicker} logo`}
                                    width={48}
                                    height={48}
                                    className="rounded shrink-0 bg-gray-100 dark:bg-gray-800"
                                    style={{ objectFit: 'contain' }}
                                    loading="eager"
                                />
                                <div className="min-w-0">
                                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight truncate">
                                        {headerData.companyName || activeTicker}{' '}
                                        <span className="text-gray-400 dark:text-gray-500 font-semibold">({activeTicker})</span>
                                    </h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-1 mt-0.5">
                                        {headerData.currentPrice != null && <span className="font-semibold text-gray-900 dark:text-white">${formatPrice(headerData.currentPrice)}</span>}
                                        {headerData.percentChange != null && (
                                            <span className={headerData.percentChange > 0 ? 'text-green-600 dark:text-green-400' : headerData.percentChange < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}>
                                                {' · '}{formatPercent(headerData.percentChange)}
                                            </span>
                                        )}
                                        {headerData.marketCap != null && headerData.marketCap > 0 && (
                                            <span className="text-gray-500 dark:text-gray-400"> · Mkt Cap: ${formatMarketCap(headerData.marketCap)}</span>
                                        )}
                                    </p>
                                    {headerData.sector && (
                                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                            {headerData.sector}{headerData.industry ? ` · ${headerData.industry}` : ''}
                                        </p>
                                    )}
                                </div>
                                <Link
                                    href={`/analysis/${activeTicker}`}
                                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                                >
                                    Full analysis <ExternalLink size={14} />
                                </Link>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <img
                            src={`/api/logo/${encodeURIComponent(activeTicker)}?s=64&prefer=icon`}
                            alt={`${activeTicker} logo`}
                            width={48}
                            height={48}
                            className="rounded shrink-0 bg-gray-100 dark:bg-gray-800"
                            style={{ objectFit: 'contain' }}
                        />
                        <div>
                            <div className="text-lg font-bold text-gray-900 dark:text-white">{activeTicker}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                Limited data available — see the{' '}
                                <Link href={`/analysis/${activeTicker}`} className="text-blue-600 dark:text-blue-400 hover:underline">full analysis page</Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Today's intraday — pre-market + regular (5-min bars) */}
            <IntradayChart ticker={activeTicker} />

            {/* Analysis Tab Content */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl min-h-[600px]">
                <div key={activeTicker} className="p-2 lg:p-4">
                    <AnalysisTab ticker={activeTicker} />
                </div>
            </div>
        </div>
    );
}
