import React, { useState } from 'react';
import Image from 'next/image';

/** Format large numbers as $3.2T / $245.8B / $12.3M */
export function formatMarketCap(val: number | null | undefined): string | null {
    if (!val || val <= 0) return null;
    if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toFixed(2)}`;
}

/** CompanyLogo: next/image wrapper with 3-level fallback */
function CompanyLogo({ logoUrl, websiteUrl, name, ticker }: {
    logoUrl?: string | null;
    websiteUrl?: string | null;
    name?: string | null;
    ticker: string;
}) {
    const clearbitUrl = websiteUrl
        ? `https://logo.clearbit.com/${websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}?format=svg`
        : null;

    // Priority order: local archived → Clearbit SVG → Polygon URL
    const initialSrc = logoUrl?.startsWith('/') ? logoUrl : (clearbitUrl ?? logoUrl ?? null);
    const [src, setSrc] = useState<string | null>(initialSrc ?? null);
    const [failed, setFailed] = useState(false);

    if (failed || !src) {
        return <span className="text-gray-400 dark:text-gray-500 font-black text-4xl">{ticker}</span>;
    }

    return (
        <Image
            src={src}
            alt={`${name || ticker} logo`}
            fill
            className="object-contain"
            sizes="160px"
            priority
            unoptimized={src.endsWith('.svg') || src.includes('format=svg')}
            onError={() => {
                // Fallback: Clearbit → Polygon logoUrl → text
                if (src === clearbitUrl && logoUrl && !logoUrl.startsWith('/')) {
                    setSrc(logoUrl);
                } else {
                    setFailed(true);
                }
            }}
        />
    );
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
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start w-full">
                    {/* Column 1: Identity (Logo + Name + Stats) */}
                    <div className="lg:col-span-7 xl:col-span-8 flex flex-col md:flex-row gap-8 items-start">
                        {/* Logo & Basic Info */}
                        <div className="flex flex-col items-center gap-4 w-full md:w-48 flex-shrink-0">
                            <div className="relative w-32 h-32 md:w-40 md:h-40 bg-white dark:bg-gray-800 rounded-[2.5rem] flex items-center justify-center p-5 shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <CompanyLogo
                                    logoUrl={data.ticker.logoUrl}
                                    websiteUrl={data.ticker.websiteUrl}
                                    name={data.ticker.name}
                                    ticker={ticker}
                                />
                            </div>
                            <div className="text-center">
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight mb-2">
                                    {data.ticker.name || ticker}
                                </h2>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="px-3 py-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full">
                                        {ticker}
                                    </span>
                                    {data.ticker.websiteUrl && (
                                        <a
                                            href={data.ticker.websiteUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors uppercase font-bold tracking-widest"
                                        >
                                            Website ↗
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Stats Section - Tighter & More space */}
                        <div className="flex-1 w-full md:border-l border-gray-100 dark:border-gray-800 md:pl-8">
                            <div className="flex flex-col">
                                {[
                                    { label: 'Sector', value: data.ticker.sector },
                                    { label: 'Industry', value: data.ticker.industry?.replace('SIC: ', '') },
                                    { label: 'Market Cap', value: formatMarketCap(data.ticker.lastMarketCap) },
                                    { label: 'Price', value: data.ticker.lastPrice ? `$${data.ticker.lastPrice.toFixed(2)}` : null },
                                    { label: 'Employees', value: data.ticker.employees ? data.ticker.employees.toLocaleString() : null },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex flex-row items-baseline py-3 border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.15em] font-bold w-24 md:w-28 flex-shrink-0">{label}</p>
                                        {value
                                            ? <p className="text-sm font-bold text-gray-900 dark:text-white whitespace-normal line-clamp-2" title={value}>{value}</p>
                                            : <span className="inline-block animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-4 w-24" aria-label="Loading" />
                                        }
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Company Description - Shortened */}
                    {data.ticker.description && (
                        <div className="lg:col-span-5 xl:col-span-4 min-w-0">
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.15em] font-bold mb-4 flex items-center gap-2">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Company Description
                            </p>
                            <p className="text-[13px] text-gray-900 dark:text-gray-100 leading-relaxed text-justify line-clamp-4 italic md:not-italic">
                                {data.ticker.description}
                            </p>
                            <button className="mt-3 text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-wider">
                                Read full bio ▾
                            </button>
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
