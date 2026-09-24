'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import AnalysisTab from '../company/AnalysisTab';
import { IntradayChart } from '../company/IntradayChart';
import { AnalysisStockSearch } from '../AnalysisStockSearch';
import { Search, ExternalLink, ArrowRight } from 'lucide-react';
import { SectionIcon } from '../SectionIcon';
import { formatPrice, formatPercent, formatMarketCap } from '@/lib/utils/format';
import { scoreColor } from '@/lib/utils/screener';
import type { ScreenerResult } from '@/lib/utils/screener';

interface HomeAnalysisProps {
    activeTicker?: string | null;
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

interface PeerChip {
    symbol: string;
    name: string | null;
    lastChangePct: number | null;
}

export function HomeAnalysis({ activeTicker: propTicker, onTickerChange }: HomeAnalysisProps) {
    // Same-sector competitors for the active ticker (clickable chips)
    const [peers, setPeers] = useState<PeerChip[]>([]);

    // Company header data (name, logo context, price) for the active ticker
    const [headerData, setHeaderData] = useState<TickerHeaderData | null>(null);
    const [headerLoading, setHeaderLoading] = useState(false);

    // The currently displayed ticker — null means "empty" (just search bar,
    // like Google's homepage). A ticker is set when navigating from Heatmap,
    // Screener, or searching.
    const activeTicker = propTicker || null;

    useEffect(() => {
        if (!activeTicker) return; // empty state — no fetch
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

    // Competitor chips — cheap lookup, refetched per ticker switch
    useEffect(() => {
        if (!activeTicker) { setPeers([]); return; }
        let cancelled = false;
        fetch(`/api/analysis/peers?symbol=${encodeURIComponent(activeTicker)}`)
            .then(r => r.json())
            .then(d => { if (!cancelled) setPeers(Array.isArray(d?.peers) ? d.peers : []); })
            .catch(() => { if (!cancelled) setPeers([]); });
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

    const trendingTickers = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META'];

    // Fundamental Opportunities — quality names not expensive vs own history.
    // Only fetched while no ticker is selected (the empty-state surface).
    const [opportunities, setOpportunities] = useState<ScreenerResult[]>([]);
    useEffect(() => {
        if (activeTicker) return;
        let cancelled = false;
        fetch('/api/analysis/screener?minQuality=75&minValuation=55&minOverall=65&limit=6&sort=overallScore:desc')
            .then(r => r.json())
            .then(d => { if (!cancelled && Array.isArray(d?.results)) setOpportunities(d.results); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [activeTicker]);

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

                    {/* Inline Search — autocomplete over symbol + company name */}
                    <AnalysisStockSearch
                        onSelect={setTicker}
                        placeholder="Search ticker or company (e.g. MSFT)"
                        className="flex-1 min-w-0"
                    />
                </div>

                {/* Pills: same-sector competitors once a ticker is selected,
                    generic trending list on the empty state */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                    {activeTicker && peers.length > 0 ? (
                        <>
                            <span className="text-xs text-gray-400 mr-1">Competitors:</span>
                            {peers.map(p => (
                                <button
                                    key={p.symbol}
                                    onClick={() => setTicker(p.symbol)}
                                    title={p.name ?? p.symbol}
                                    className="text-xs px-3 py-1 rounded-full border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400 transition-all"
                                >
                                    {p.symbol}
                                    {p.lastChangePct != null && (
                                        <span className={`ml-1 tabular-nums font-semibold ${p.lastChangePct > 0 ? 'text-emerald-600 dark:text-emerald-400' : p.lastChangePct < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
                                            {p.lastChangePct > 0 ? '+' : ''}{p.lastChangePct.toFixed(1)}%
                                        </span>
                                    )}
                                </button>
                            ))}
                        </>
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
            </div>

            {/* Empty state — discovery surface: search hint + opportunities +
                the five-pillar explainer. Shown when no ticker is selected. */}
            {!activeTicker && (
                <div className="space-y-6">
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Search size={48} className="text-gray-300 dark:text-gray-600 mb-4" strokeWidth={1.5} />
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-700 dark:text-gray-300 mb-2">
                            Search for a stock to analyze
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                            Every stock gets a five-dimensional fundamental profile — pick one below or search above.
                        </p>
                    </div>

                    {/* Fundamental Opportunities — quality ≥75, valuation ≥55, overall ≥65 */}
                    {opportunities.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Fundamental Opportunities</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Quality ≥75 · Valuation ≥55 · sorted by overall score</p>
                                </div>
                                <Link href="/screener/quality-at-reasonable-price" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0">
                                    Full screen <ArrowRight size={12} />
                                </Link>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {opportunities.map((r) => (
                                    <button
                                        key={r.symbol}
                                        onClick={() => setTicker(r.symbol)}
                                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left"
                                    >
                                        <img src={`/api/logo/${encodeURIComponent(r.symbol)}?s=64&prefer=icon`} alt="" width={28} height={28} className="rounded shrink-0 bg-gray-100 dark:bg-gray-700" loading="lazy" />
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-sm text-gray-900 dark:text-white">{r.symbol}</div>
                                            <div className="text-[11px] text-gray-400 truncate">{r.ticker?.name || ''}</div>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                            {([r.valuationScore, r.growthScore, r.profitabilityScore, r.healthScore, r.qualityScore] as (number | null)[]).map((v, i) => (
                                                <span key={i} className={`text-[10px] font-bold tabular-nums ${scoreColor(v)}`}>{v !== null ? Math.round(v) : '–'}</span>
                                            ))}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <p className="mt-3 text-[10px] text-gray-400 dark:text-gray-500">Columns: Valuation · Growth · Profitability · Health · Quality</p>
                        </div>
                    )}

                    {/* How we analyze — five-pillar explainer */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">How we analyze stocks</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Every stock gets a 0–100 profile across five equally-weighted pillars.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {[
                                ['Valuation', 'Is the stock cheap vs its own 5-year history?'],
                                ['Growth', 'How fast are revenue, earnings and EPS expanding?'],
                                ['Profitability', 'How efficiently does it turn revenue into profit?'],
                                ['Financial Health', 'Can the balance sheet withstand stress?'],
                                ['Quality', 'Are reported earnings reliable and cash-backed?'],
                            ].map(([name, desc]) => (
                                <div key={name} className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3">
                                    <div className="text-xs font-bold text-gray-900 dark:text-white mb-1">{name}</div>
                                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Full analysis — only when a ticker is selected */}
            {activeTicker && (
                <>
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
                </>
            )}
        </div>
    );
}
