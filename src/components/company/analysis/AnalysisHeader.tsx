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
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 items-start w-full">
                    {/* Column 1: Logo & Title */}
                    <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center gap-5 w-full text-center">
                        {/* Logo Box - Clearbit integration for high-res logo */}
                        <div className="w-32 h-32 md:w-40 md:h-40 xl:w-48 xl:h-48 mx-auto bg-white dark:bg-gray-800 rounded-[2rem] flex items-center justify-center p-5 lg:p-7 shadow-sm border border-gray-100 dark:border-gray-700">
                            {data.ticker.websiteUrl || data.ticker.logoUrl ? (
                                <img
                                    src={data.ticker.websiteUrl ? `https://logo.clearbit.com/${data.ticker.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}` : data.ticker.logoUrl}
                                    alt={data.ticker.name || ticker}
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        // Fallback to Polygon logo if Clearbit fails
                                        if (e.currentTarget.src.includes('clearbit') && data.ticker.logoUrl) {
                                            e.currentTarget.src = data.ticker.logoUrl;
                                        } else {
                                            e.currentTarget.style.display = 'none';
                                            const span = document.createElement('span');
                                            span.className = 'text-gray-400 font-black text-4xl';
                                            span.innerText = ticker;
                                            e.currentTarget.parentElement?.appendChild(span);
                                        }
                                    }}
                                />
                            ) : (
                                <span className="text-gray-400 dark:text-gray-500 font-black text-4xl lg:text-5xl">{ticker}</span>
                            )}
                        </div>

                        {/* Name + Ticker badge + Website */}
                        <div className="text-center flex flex-col items-center gap-2">
                            <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white leading-tight break-words px-2">
                                {data.ticker.name || ticker}
                            </h2>
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-sm font-bold rounded-full">
                                    {ticker}
                                </span>
                                {data.ticker.websiteUrl && (
                                    <a
                                        href={data.ticker.websiteUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-gray-600 dark:text-gray-300 hover:text-blue-600 transition-colors border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1 font-medium bg-white dark:bg-gray-900 shadow-sm"
                                    >
                                        Website
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Info (Stats) */}
                    <div className="md:col-span-8 lg:col-span-4 min-w-0 mt-2 md:mt-0 md:border-l border-gray-100 dark:border-gray-800 md:pl-8 lg:pl-10">
                        {/* Stats - Tighter gap */}
                        <div className="flex flex-col">
                            {[
                                { label: 'Sector', value: data.ticker.sector },
                                { label: 'Industry', value: data.ticker.industry?.replace('SIC: ', '') },
                                { label: 'Market Cap', value: formatMarketCap(data.ticker.lastMarketCap) },
                                { label: 'Price', value: data.ticker.lastPrice ? `$${data.ticker.lastPrice.toFixed(2)}` : null },
                                { label: 'Employees', value: data.ticker.employees ? data.ticker.employees.toLocaleString() : null },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex flex-row items-center py-2.5 border-b border-gray-50 dark:border-gray-800/60 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold w-28 md:w-32 flex-shrink-0">{label}</p>
                                    {value
                                        ? <p className="text-sm font-bold text-gray-900 dark:text-white truncate" title={value}>{value}</p>
                                        : <span className="inline-block animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-4 w-24" aria-label="Loading" />
                                    }
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Column 3: Company Description */}
                    {data.ticker.description && (
                        <div className="md:col-span-12 lg:col-span-5 mt-6 lg:mt-0 min-w-0 lg:pl-4">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 font-semibold flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Company Description
                            </p>
                            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed text-justify">
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
