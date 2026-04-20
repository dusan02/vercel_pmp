import React, { useState, useEffect } from 'react';
import CompanyLogo from '@/components/CompanyLogo';
import type { AnalysisData } from '@/components/company/AnalysisTab';
import { formatMarketCap as fmtMcap, formatPrice, formatPercent, formatMarketCapDiff } from '@/lib/utils/format';
import { getColorClass, getStrokeColor } from './ScoreCard';

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

function MiniScoreCircle({ label, score }: { label: string; score: number | null }) {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const displayScore = (score != null && !isNaN(score)) ? score : 0;
    const strokeDashoffset = circumference - (displayScore / 100) * circumference;
    const color = getColorClass(score);
    const stroke = getStrokeColor(score);
    return (
        <div className="flex flex-col items-center gap-1">
            <p className="text-[9px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500 text-center">{label}</p>
            <div className="relative w-[60px] h-[60px]">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r={radius} fill="transparent" stroke="currentColor" strokeWidth="10" className="text-gray-100 dark:text-gray-700" />
                    <circle cx="50" cy="50" r={radius} fill="transparent" stroke={stroke} strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-700 ease-out" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-base font-bold leading-none ${color}`}>{score ?? '—'}</span>
                    <span className="text-[8px] text-gray-400 mt-0.5">/100</span>
                </div>
            </div>
        </div>
    );
}

/** Truncate description to first N sentences */
function truncateToSentences(text: string, n: number): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.slice(0, n).join(' ').trim();
}

export function AnalysisHeader({ ticker, hideSearch, data }: AnalysisHeaderProps) {
    const t = data.ticker;

    // Real-time metrics
    const [realTimeData, setRealTimeData] = useState<{currentPrice: number, percentChange: number, marketCapDiff: number} | null>(null);

    useEffect(() => {
        let mounted = true;
        fetch(`/api/prices/cached?tickers=${ticker}`)
            .then(res => res.json())
            .then(json => {
                if (!mounted) return;
                if (json?.data && json.data.length > 0) {
                    setRealTimeData(json.data[0]);
                }
            })
            .catch(err => console.error('Failed to fetch real-time data:', err));
        return () => { mounted = false; };
    }, [ticker]);

    // Staleness detection: if DB price is > 4 hours old, consider it stale
    const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
    const dbPriceUpdated = (t as any)?.lastPriceUpdated ? new Date((t as any).lastPriceUpdated).getTime() : 0;
    const isDbPriceStale = dbPriceUpdated > 0 && (Date.now() - dbPriceUpdated) > STALE_THRESHOLD_MS;
    // Best available price: prefer real-time, then fresh DB, then prevClose as last resort
    const bestPrice = realTimeData?.currentPrice
        ?? (!isDbPriceStale && t?.lastPrice ? t.lastPrice : null)
        ?? (t as any)?.latestPrevClose
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
                    {/* ── TOP: Logo + Identity + Scores ── */}
                    <div className="flex items-center gap-4 px-6 lg:px-8 pt-6 lg:pt-7 pb-5">
                        <CompanyLogo
                            ticker={ticker}
                            logoUrl={t.logoUrl}
                            size={64}
                            priority
                        />
                        <div className="min-w-0 flex items-center gap-3 flex-wrap">
                            <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
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

                        {/* Real-time Price & Movement */}
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
                        {/* ── Score circles (compact, top-right) ── */}
                        <div className="ml-auto flex items-center gap-4 shrink-0 pl-4">
                            <MiniScoreCircle label="Health" score={data.healthScore} />
                            <MiniScoreCircle label="Profitability" score={data.profitabilityScore} />
                            <MiniScoreCircle label="Valuation" score={data.valuationScore} />
                        </div>
                    </div>

                    {/* ── Horizontal divider ── */}
                    <div className="border-t border-gray-100 dark:border-gray-700/60" />

                    {/* ── BOTTOM: Stats left | Description right ── */}
                    <div className="flex flex-col md:flex-row min-h-0">

                        {/* Left: Stats — label + value inline */}
                        <div className="w-full md:w-72 lg:w-80 shrink-0 px-6 lg:px-8 py-5 border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-700/60">
                            <dl className="space-y-2">
                                {stats.map(({ label, value }) => (
                                    <div key={label} className="flex items-baseline gap-2">
                                        <dt className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500 shrink-0 w-[104px]">
                                            {label}
                                        </dt>
                                        <dd className={`text-sm font-semibold leading-snug ${value ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                                            {value || 'N/A'}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </div>

                        {/* Right: Company description */}
                        <div className="flex-1 min-w-0 px-6 lg:px-8 py-5">
                            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Company Description
                            </p>
                            {shortDesc ? (
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                    {shortDesc}
                                </p>
                            ) : (
                                <p className="text-sm text-gray-300 dark:text-gray-600 italic">
                                    No description available. Run Deep Analysis to populate.
                                </p>
                            )}

                            {data.verdictText && (
                                <div className="mt-4 px-3.5 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-lg">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-blue-500 dark:text-blue-400 mb-1">AI Verdict</p>
                                    <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed font-medium">{data.verdictText}</p>
                                </div>
                            )}
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
