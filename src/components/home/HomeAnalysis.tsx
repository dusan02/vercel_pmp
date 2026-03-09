'use client';

import React, { useState, useCallback } from 'react';
import AnalysisTab from '../company/AnalysisTab';
import { Search } from 'lucide-react';
import { SectionIcon } from '../SectionIcon';

interface HomeAnalysisProps {
    activeTicker?: string;
    onTickerChange?: (ticker: string) => void;
}

export function HomeAnalysis({ activeTicker: propTicker, onTickerChange }: HomeAnalysisProps) {
    // Input field state (what's in the text box)
    const [inputValue, setInputValue] = useState<string>('');

    // The currently displayed ticker — derived from prop, no local copy that can diverge
    // We always use propTicker (controlled by parent). Local-only fallback = 'NVDA'
    const activeTicker = propTicker || 'NVDA';

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
                    <div className="flex items-center gap-2 shrink-0">
                        <SectionIcon type="analysis" size={22} className="text-gray-900 dark:text-white shrink-0" />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white m-0 leading-none">Analysis</h2>
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

            {/* Analysis Tab Content */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl min-h-[600px]">
                <div key={activeTicker} className="p-2 lg:p-4">
                    <AnalysisTab ticker={activeTicker} hideSearch />
                </div>
            </div>
        </div>
    );
}
