import React, { useState, useEffect } from 'react';
import CompanyLogo from '@/components/CompanyLogo';
import type { AnalysisData } from '@/components/company/AnalysisTab';
import { formatMarketCap as fmtMcap, formatPrice, formatPercent, formatMarketCapDiff } from '@/lib/utils/format';

/** Wraps shared formatMarketCap — adds $ prefix, returns null for empty */
export function formatMarketCap(val: number | null | undefined): string | null {
    if (!val || val <= 0) return null;
    const raw = fmtMcap(val);
    return raw && raw !== '0.00' ? `$${raw}` : null;
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

    // Real-time metrics
    const [realTimeData, setRealTimeData] = useState<{currentPrice: number, percentChange: number, marketCapDiff: number} | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/prices/cached?tickers=${ticker}`, { signal: controller.signal })
            .then(res => res.json())
            .then(json => {
                if (controller.signal.aborted) return;
                if (json?.data && json.data.length > 0) {
                    setRealTimeData(json.data[0]);
                }
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('Failed to fetch real-time data:', err);
                }
            });
        return () => { controller.abort(); };
    }, [ticker]);

    // Staleness detection: if DB price is > 4 hours old, consider it stale
    const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
    const dbPriceUpdated = t?.lastPriceUpdated ? new Date(t.lastPriceUpdated).getTime() : 0;
    const isDbPriceStale = dbPriceUpdated > 0 && (Date.now() - dbPriceUpdated) > STALE_THRESHOLD_MS;
    // Best available price: prefer real-time, then fresh DB, then prevClose as last resort
    const bestPrice = realTimeData?.currentPrice
        ?? (!isDbPriceStale && t?.lastPrice ? t.lastPrice : null)
        ?? t?.latestPrevClose
        ?? t?.lastPrice
        ?? null;
    const hasFreshPrice = !!realTimeData?.currentPrice || !isDbPriceStale;

    const stats = t ? [
        { label: 'Sector',      value: t.sector },
        { label: 'Industry',    value: t.industry?.replace('SIC: ', '') },
        { label: 'Market Cap',  value: formatMarketCap(t.lastMarketCap) },
        { label: 'Price',       value: bestPrice ? `$${bestPrice.toFixed(2)}` : null },
        { label: 'Employees',   value: t.employees ? t.employees.toLocaleString() : null },
        { label: 'HQ',          value: t.headquarters },
    ] : [];

    const companyName = (t?.name && t.name !== ticker) ? t.name : ticker;

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
                    {/* ── TOP: Logo + Identity (row 1) + Scores (row 2 on mobile, same row on sm+) ── */}
                    <div className="flex flex-wrap items-center gap-4 px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 lg:pt-7 pb-4 sm:pb-5">
                        {/* Logo + Name + Badge */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <CompanyLogo
                                ticker={ticker}
                                logoUrl={t.logoUrl}
                                size={48}
                                className=""
                                priority
                            />
                            <div className="min-w-0 flex items-center gap-2 sm:gap-3 flex-wrap">
                                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
                                    {companyName}
                                </h1>
                                <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded tracking-widest uppercase shrink-0">
                                    {ticker}
                                </span>
                                {t.websiteUrl && (
                                    <a
                                        href={t.websiteUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors shrink-0"
                                    >
                                        Website ↗
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Real-time Price & Movement — desktop */}
                        <div className="hidden sm:flex flex-col ml-4 lg:ml-8 border-l border-gray-100 dark:border-gray-700/60 pl-4 lg:pl-8 min-w-[120px]">
                            {bestPrice ? (
                                <>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                                            {`$${formatPrice(bestPrice)}`}
                                        </span>
                                        {hasFreshPrice && (realTimeData?.percentChange ?? t?.lastChangePct) != null && (
                                            <span className={`text-sm xl:text-base font-bold ${(realTimeData?.percentChange ?? t?.lastChangePct ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                                {formatPercent(realTimeData?.percentChange ?? t?.lastChangePct)}
                                            </span>
                                        )}
                                        {!hasFreshPrice && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                                                Prev Close
                                            </span>
                                        )}
                                    </div>
                                    {hasFreshPrice && (realTimeData?.marketCapDiff ?? t?.lastMarketCapDiff) != null && (
                                        <div className={`text-xs font-semibold ${(realTimeData?.marketCapDiff ?? t?.lastMarketCapDiff ?? 0) >= 0 ? 'text-green-600/70 dark:text-green-400/70' : 'text-red-500/70 dark:text-red-400/70'}`}>
                                            {formatMarketCapDiff(realTimeData?.marketCapDiff ?? t?.lastMarketCapDiff)} <span className="opacity-70 font-medium">Market Cap Today</span>
                                        </div>
                                    )}
                                </>
                            ) : null}
                        </div>

                        {/* Compact price badge — mobile only */}
                        {bestPrice && (
                            <div className="flex sm:hidden items-baseline gap-2 ml-auto pl-2">
                                <span className="text-lg font-bold text-gray-900 dark:text-white">
                                    {`$${formatPrice(bestPrice)}`}
                                </span>
                                {hasFreshPrice && (realTimeData?.percentChange ?? t?.lastChangePct) != null && (
                                    <span className={`text-sm font-bold ${(realTimeData?.percentChange ?? t?.lastChangePct ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                        {formatPercent(realTimeData?.percentChange ?? t?.lastChangePct)}
                                    </span>
                                )}
                                {!hasFreshPrice && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                        Prev
                                    </span>
                                )}
                            </div>
                        )}

                    </div>

                    {/* ── Horizontal divider ── */}
                    <div className="border-t border-gray-100 dark:border-gray-700/60" />

                    {/* ── BOTTOM: Clean horizontal stats grid ── */}
                    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3">
                            {stats.map(({ label, value }) => (
                                <div key={label}>
                                    <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500">
                                        {label}
                                    </p>
                                    <p className={`text-sm font-semibold mt-0.5 ${value ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                                        {value || 'N/A'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
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
