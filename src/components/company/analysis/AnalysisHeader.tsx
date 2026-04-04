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

interface StatItem {
    label: string;
    value: string;
    icon: React.ReactNode;
}

function StatIcon({ path }: { path: string }) {
    return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={path} />
        </svg>
    );
}

export function AnalysisHeader({ ticker, hideSearch, data }: AnalysisHeaderProps) {
    const t = data.ticker;

    const stats: StatItem[] = t ? [
        {
            label: 'Sector',
            value: t.sector || '—',
            icon: <StatIcon path="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />,
        },
        {
            label: 'Industry',
            value: t.industry?.replace('SIC: ', '') || '—',
            icon: <StatIcon path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
        },
        {
            label: 'Market Cap',
            value: formatMarketCap(t.lastMarketCap) || '—',
            icon: <StatIcon path="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
        },
        {
            label: 'Price',
            value: t.lastPrice ? `$${t.lastPrice.toFixed(2)}` : '—',
            icon: <StatIcon path="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
        },
        {
            label: 'Employees',
            value: t.employees ? t.employees.toLocaleString() : 'N/A',
            icon: <StatIcon path="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
        },
        {
            label: 'Headquarters',
            value: t.headquarters || 'N/A',
            icon: <StatIcon path="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />,
        },
    ] : [];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">

            {/* Quick Search */}
            {!hideSearch && (
                <div data-html2canvas-ignore="true" className="px-6 pt-6">
                    <SearchTickerBar currentTicker={ticker} />
                </div>
            )}

            {t ? (
                <div className="p-6 lg:p-8 space-y-6">

                    {/* ── Identity Row ── */}
                    <div className="flex items-start gap-5">
                        <div className="flex-shrink-0">
                            <CompanyLogo
                                ticker={ticker}
                                logoUrl={t.logoUrl}
                                size={80}
                                priority
                            />
                        </div>

                        <div className="flex-1 min-w-0 pt-1">
                            {/* Ticker badge + website */}
                            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                                <span className="px-2.5 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-md tracking-wider">
                                    {ticker}
                                </span>
                                {t.websiteUrl && (
                                    <a
                                        href={t.websiteUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium transition-colors"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        Website
                                    </a>
                                )}
                            </div>

                            {/* Company name — full, never truncated */}
                            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white leading-tight">
                                {(t.name && t.name !== ticker) ? t.name : ticker}
                            </h1>
                            {t.name && t.name !== ticker && (
                                <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 font-medium tracking-wide">
                                    {ticker}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── Stats Grid: 2×3 ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {stats.map(({ label, value, icon }) => (
                            <div
                                key={label}
                                className="bg-gray-50 dark:bg-gray-900/40 rounded-xl px-4 py-3 flex flex-col gap-1"
                            >
                                <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                                    {icon}
                                    <span className="text-[10px] uppercase tracking-widest font-semibold">{label}</span>
                                </div>
                                <p className={`text-sm font-semibold leading-snug ${value === '—' || value === 'N/A' ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>
                                    {value}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* ── Company Description ── */}
                    {t.description && (
                        <div className="border-t border-gray-100 dark:border-gray-700/60 pt-5">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest font-semibold mb-2">
                                About
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-4">
                                {t.description}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-6 lg:p-8 flex items-center gap-5">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-600 flex-shrink-0">
                        <span className="text-gray-600 dark:text-gray-300 font-bold text-sm">{ticker}</span>
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{ticker}</h1>
                        <p className="text-sm text-gray-400 mt-1">No company data available. Run Deep Analysis to populate.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
