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

/** Truncate description to first N sentences */
function truncateToSentences(text: string, n: number): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.slice(0, n).join(' ').trim();
}

export function AnalysisHeader({ ticker, hideSearch, data }: AnalysisHeaderProps) {
    const t = data.ticker;

    const stats = t ? [
        { label: 'Sector',      value: t.sector },
        { label: 'Industry',    value: t.industry?.replace('SIC: ', '') },
        { label: 'Market Cap',  value: formatMarketCap(t.lastMarketCap) },
        { label: 'Price',       value: t.lastPrice ? `$${t.lastPrice.toFixed(2)}` : null },
        { label: 'Employees',   value: t.employees ? t.employees.toLocaleString() : null },
        { label: 'HQ',          value: t.headquarters },
    ] : [];

    const companyName = (t?.name && t.name !== ticker) ? t.name : ticker;
    const shortDesc = t?.description ? truncateToSentences(t.description, 4) : null;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">

            {/* Quick Search */}
            {!hideSearch && (
                <div data-html2canvas-ignore="true" className="px-6 pt-6">
                    <SearchTickerBar currentTicker={ticker} />
                </div>
            )}

            {t ? (
                <>
                    {/* ── Identity Section ── */}
                    <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-5">
                        <div className="flex items-center gap-5">
                            <CompanyLogo
                                ticker={ticker}
                                logoUrl={t.logoUrl}
                                size={72}
                                priority
                            />
                            <div className="min-w-0">
                                <h1 className="text-2xl lg:text-[1.75rem] font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
                                    {companyName}
                                </h1>
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                    <span className="px-2 py-0.5 bg-blue-600 text-white text-[11px] font-bold rounded tracking-widest">
                                        {ticker}
                                    </span>
                                    {t.websiteUrl && (
                                        <a
                                            href={t.websiteUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 font-medium transition-colors"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                            {t.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Divider ── */}
                    <div className="border-t border-gray-100 dark:border-gray-700/60" />

                    {/* ── Compact Stats List ── */}
                    <div className="px-6 lg:px-8 py-4">
                        <dl className="space-y-2">
                            {stats.map(({ label, value }) => (
                                <div key={label} className="flex items-baseline gap-3">
                                    <dt className="text-xs text-gray-400 dark:text-gray-500 font-medium w-24 shrink-0">
                                        {label}
                                    </dt>
                                    <dd className={`text-sm font-semibold ${value ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                                        {value || 'N/A'}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>

                    {/* ── About / Description ── */}
                    {shortDesc && (
                        <>
                            <div className="border-t border-gray-100 dark:border-gray-700/60" />
                            <div className="px-6 lg:px-8 py-5">
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-semibold mb-2">
                                    About
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                    {shortDesc}
                                </p>
                            </div>
                        </>
                    )}
                </>
            ) : (
                <div className="p-6 lg:p-8 flex items-center gap-5">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-600 flex-shrink-0">
                        <span className="text-gray-600 dark:text-gray-300 font-bold text-sm">{ticker}</span>
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{ticker}</h1>
                        <p className="text-sm text-gray-400 mt-1">No company data. Run Deep Analysis to populate.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
