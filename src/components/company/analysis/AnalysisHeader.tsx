import React, { useState } from 'react';

/** Format large numbers as $3.2T / $245.8B / $12.3M */
export function formatMarketCap(val: number | null | undefined): string | null {
    if (!val || val <= 0) return null;
    if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toFixed(2)}`;
}

export function SearchTickerBar({ currentTicker }: { currentTicker: string }) {
    const [value, setValue] = useState('');
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const t = value.toUpperCase().trim();
        if (!t || t === currentTicker) return;
        setValue('');
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mobile-nav-change', {
                detail: { tab: 'analysis', ticker: t }
            }));
        }
    };
    return (
        <form onSubmit={handleSubmit} className="relative w-full max-w-lg">
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                placeholder="Search ticker (e.g. MSFT)"
                className="w-full h-11 pl-4 pr-28 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all"
            />
            <button
                type="submit"
                className="absolute right-1.5 top-1.5 bottom-1.5 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
            >
                Analyze
            </button>
        </form>
    );
}

interface AnalysisHeaderProps {
    ticker: string;
    hideSearch: boolean;
    data: any;
}

export function AnalysisHeader({ ticker, hideSearch, data }: AnalysisHeaderProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 lg:p-8">

            {/* Quick Search — hidden when a parent (HomeAnalysis) already provides one */}
            {!hideSearch && (
                <div data-html2canvas-ignore="true" className="mb-6">
                    <SearchTickerBar currentTicker={ticker} />
                </div>
            )}

            {/* Company Profile */}
            {data.ticker ? (
                <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
                    {/* Logo - Substantially larger */}
                    <div className="flex-shrink-0 w-32 h-32 md:w-48 md:h-48 lg:w-56 lg:h-56 bg-gray-50 dark:bg-gray-900 rounded-3xl flex items-center justify-center p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                        {data.ticker.logoUrl ? (
                            <img
                                src={data.ticker.logoUrl}
                                alt={data.ticker.name || ticker}
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <span className="text-gray-400 dark:text-gray-500 font-black text-4xl lg:text-5xl">{ticker}</span>
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        {/* Name + Ticker badge + Website */}
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white leading-tight">
                                {data.ticker.name || ticker}
                            </h2>
                            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-sm font-bold rounded-full">
                                {ticker}
                            </span>
                            {data.ticker.websiteUrl && (
                                <a
                                    href={data.ticker.websiteUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors border border-blue-200 dark:border-blue-700 rounded-full px-3 py-1 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                >
                                    Website ↗
                                </a>
                            )}
                        </div>

                        {/* Stats Stack (Inline label & value) */}
                        <div className="flex flex-col gap-2.5 mt-2">
                            {[
                                { label: 'Sector', value: data.ticker.sector },
                                { label: 'Industry', value: data.ticker.industry?.replace('SIC: ', '') },
                                { label: 'Market Cap', value: formatMarketCap(data.ticker.lastMarketCap) },
                                { label: 'Price', value: data.ticker.lastPrice ? `$${data.ticker.lastPrice.toFixed(2)}` : null },
                                { label: 'Employees', value: data.ticker.employees ? data.ticker.employees.toLocaleString() : null },
                            ].map(({ label, value }) => (
                                <div key={label} className="text-left flex flex-row items-baseline gap-2 min-w-0">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold w-28 shrink-0">{label}</p>
                                    {value
                                        ? <p className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-full" title={value}>{value}</p>
                                        : <span className="inline-block animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-4 w-24" aria-label="Loading" />
                                    }
                                </div>
                            ))}
                        </div>

                    </div>

                    {/* About Section (Third Column) */}
                    {data.ticker.description && (
                        <div className="w-full md:w-1/3 xl:w-[30%] flex-shrink-0 mt-4 md:mt-0 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl px-5 py-4">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 font-medium">About</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-6">
                                {data.ticker.description}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-4">
                    <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center border border-gray-200 dark:border-gray-600">
                        <span className="text-gray-600 dark:text-gray-300 font-black text-2xl">{ticker}</span>
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 dark:text-white">{ticker}</h2>
                </div>
            )}
        </div>
    );
}
