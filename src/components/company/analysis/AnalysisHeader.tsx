import React, { useState } from 'react';
import CompanyLogo from '@/components/CompanyLogo';
import type { AnalysisData } from '@/components/company/AnalysisTab';

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
    data: AnalysisData;
}

export function AnalysisHeader({ ticker, hideSearch, data }: AnalysisHeaderProps) {
    const t = data.ticker;

    const stats = t ? [
        { label: 'Sector',      value: t.sector },
        { label: 'Industry',    value: t.industry?.replace('SIC: ', '') },
        { label: 'Market Cap',  value: formatMarketCap(t.lastMarketCap) },
        { label: 'Price',       value: t.lastPrice ? `$${t.lastPrice.toFixed(2)}` : null },
        { label: 'Employees',   value: t.employees ? t.employees.toLocaleString() : null },
    ] : [];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 lg:p-8">

            {/* Quick Search */}
            {!hideSearch && (
                <div data-html2canvas-ignore="true" className="mb-6">
                    <SearchTickerBar currentTicker={ticker} />
                </div>
            )}

            {t ? (
                <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start w-full">

                    {/* Left block: Identity + Info */}
                    <div className="flex flex-col gap-5 lg:w-72 xl:w-80 flex-shrink-0">

                        {/* Identity row — same look as All Stocks table row */}
                        <div className="flex items-center gap-4">
                            <CompanyLogo
                                ticker={ticker}
                                logoUrl={t.logoUrl}
                                size={52}
                                priority
                            />
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full">
                                        {ticker}
                                    </span>
                                    {t.websiteUrl && (
                                        <a
                                            href={t.websiteUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors uppercase font-bold tracking-widest"
                                        >
                                            Website ↗
                                        </a>
                                    )}
                                </div>
                                <h2 className="text-xl font-black text-gray-900 dark:text-white leading-tight mt-1 truncate">
                                    {t.name || ticker}
                                </h2>
                            </div>
                        </div>

                        {/* Info rows */}
                        <div className="flex flex-col divide-y divide-gray-50 dark:divide-gray-800/60">
                            {stats.map(({ label, value }) => (
                                <div key={label} className="flex items-baseline py-2.5">
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.15em] font-bold w-24 flex-shrink-0">{label}</p>
                                    {value
                                        ? <p className="text-sm font-bold text-gray-900 dark:text-white">{value}</p>
                                        : <span className="inline-block animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-4 w-24" />
                                    }
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right block: Company Description — wider now */}
                    {t.description && (
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.15em] font-bold mb-4 flex items-center gap-2">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Company Description
                            </p>
                            <p className="text-[13px] text-gray-900 dark:text-gray-100 leading-relaxed text-justify line-clamp-4 md:not-italic">
                                {t.description}
                            </p>
                            <button className="mt-3 text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-wider">
                                Read full bio ▾
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border border-gray-200 dark:border-gray-600">
                        <span className="text-gray-600 dark:text-gray-300 font-black text-sm">{ticker}</span>
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 dark:text-white">{ticker}</h2>
                </div>
            )}
        </div>
    );
}
