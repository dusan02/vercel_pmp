'use client';

import React, { useMemo } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Zap, TrendingUp, TrendingDown, RefreshCw, Info, AlertCircle } from 'lucide-react';
import { SectionSkeleton } from './SectionSkeleton';
import CompanyLogo from './CompanyLogo';
import { CustomDropdown } from './CustomDropdown';
import { SectionIcon } from './SectionIcon';
import { getCompanyName } from '@/lib/companyNames';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatCompactNumber } from '@/lib/utils/heatmapFormat';

/**
 * Mover data structure from API
 */
interface MoverData {
    symbol: string;
    name: string;
    logoUrl: string | null;
    sector: string | null;
    lastPrice: number | null;
    lastChangePct: number | null;
    lastVolume?: number | null;
    latestMoversZScore: number | null;
    latestMoversRVOL: number | null;
    moversReason: string | null;
    moversCategory: string | null;
    analysis?: MoverAnalysis | null;
}

interface MoverAnalysis {
    zScore: number | null;
    rvol: number | null;
    sigmaLevel: 'normal' | 'unusual' | 'very_unusual' | 'extreme';
    marketChangePct: number | null;
    sectorChangePct: number | null;
    excessMovePct: number | null;
    attribution: 'stock' | 'sector' | 'market' | 'mixed' | 'unknown';
    catalyst: {
        type: string;
        status: 'found' | 'none' | 'unavailable';
        confidence: 'high' | 'medium' | 'low';
        label: string;
        explanation: string;
        evidence: { source: string; headline: string; url?: string | null; publishedAt: string }[];
    };
    pillars: {
        valuation: number | null; growth: number | null; profitability: number | null;
        health: number | null; quality: number | null; overall: number | null;
        ewScore: number | null; ewMaxPossible: number | null;
    } | null;
}

type MoversTab = 'all' | 'unusual' | 'explained' | 'unexplained';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SESSION_LABELS: Record<string, string> = {
    pre: 'Premarket',
    live: 'Regular session',
    after: 'After hours',
    closed: 'Market closed',
};

export function MoversSection({ onTileClick, initialData }: { onTileClick?: (ticker: string) => void; initialData?: any[] | undefined }) {
    const [selectedSector, setSelectedSector] = React.useState<string | null>(null);
    const [activeTab, setActiveTab] = React.useState<MoversTab>('all');
    const isDesktop = useMediaQuery('(min-width: 1024px)');
    const { data, error, isLoading, mutate } = useSWR('/api/stocks/movers?limit=50', fetcher, {
        refreshInterval: 30000, // Refresh every 30 seconds for better real-time experience
        revalidateOnFocus: true,
        fallbackData: initialData ? { movers: initialData } : undefined,
    });

    const movers: MoverData[] = data?.movers || [];

    // Extract unique sectors and calculate performance
    const sectors = useMemo(() => {
        const sectorMap = new Map<string, { count: number, totalChange: number }>();
        movers.forEach(m => {
            if (m.sector) {
                const existing = sectorMap.get(m.sector) || { count: 0, totalChange: 0 };
                sectorMap.set(m.sector, {
                    count: existing.count + 1,
                    totalChange: existing.totalChange + (m.lastChangePct || 0)
                });
            }
        });
        return Array.from(sectorMap.entries())
            .map(([name, stats]) => ({
                name,
                avgChange: stats.totalChange / stats.count,
                count: stats.count
            }))
            .sort((a, b) => b.count - a.count);
    }, [movers]);

    const filteredMovers = useMemo(() => {
        let list = movers;
        if (selectedSector) list = list.filter(m => m.sector === selectedSector);
        switch (activeTab) {
            case 'unusual':
                return [...list].sort((a, b) => Math.abs(b.latestMoversZScore ?? 0) - Math.abs(a.latestMoversZScore ?? 0));
            case 'explained':
                return list.filter(m => m.analysis?.catalyst?.status === 'found');
            case 'unexplained':
                return list.filter(m => m.analysis && m.analysis.catalyst.status !== 'found');
            default:
                return list; // keep API significance ordering
        }
    }, [movers, selectedSector, activeTab]);

    const gainers = useMemo(() => filteredMovers.filter(m => (m.lastChangePct || 0) >= 0), [filteredMovers]);
    const losers = useMemo(() => filteredMovers.filter(m => (m.lastChangePct || 0) < 0), [filteredMovers]);

    const renderZScoreBadge = (zscore: number | null) => {
        if (zscore === null) return null;
        const absZ = Math.abs(zscore);
        let colorClass = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
        let level = 0;

        if (absZ >= 3) {
            colorClass = zscore > 0
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30';
            level = 3;
        } else if (absZ >= 2) {
            colorClass = zscore > 0
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                : 'bg-orange-500/15 text-orange-400 border-orange-500/20';
            level = 2;
        } else if (absZ >= 1) {
            level = 1;
        }

        const renderConfidenceMeter = () => {
            return (
                <div className="flex gap-0.5 ml-1">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className={`w-1 h-3 rounded-full ${i <= level
                                ? level === 3 ? 'bg-red-500' : level === 2 ? 'bg-orange-500' : 'bg-green-500'
                                : 'bg-white/10'
                                }`}
                        />
                    ))}
                </div>
            );
        };

        const sigmaLabel = absZ >= 5 ? 'Extreme' : absZ >= 3 ? 'Very unusual' : absZ >= 2 ? 'Unusual' : '';
        return (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorClass}`}>
                <Zap size={10} fill="currentColor" />
                <span>{absZ.toFixed(1)}σ{sigmaLabel ? ` ${sigmaLabel}` : ''}</span>
                {renderConfidenceMeter()}
            </div>
        );
    };

    const renderContextLine = (a: MoverAnalysis) => {
        const fmt = (v: number | null) => v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
        return (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500 tabular-nums">
                <span>Sector <span className="font-semibold text-slate-600">{fmt(a.sectorChangePct)}</span></span>
                <span>Mkt <span className="font-semibold text-slate-600">{fmt(a.marketChangePct)}</span></span>
                {a.excessMovePct !== null && (
                    <span>Excess <span className={`font-semibold ${a.excessMovePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(a.excessMovePct)}</span></span>
                )}
            </div>
        );
    };

    const renderCatalyst = (a: MoverAnalysis) => {
        const c = a.catalyst;
        if (!c) return null;
        const dot = c.confidence === 'high' ? 'bg-green-500' : c.confidence === 'medium' ? 'bg-amber-500' : 'bg-slate-400';
        const evidence = c.evidence?.find(e => e.url);
        return (
            <div className="mt-1.5 text-[11px] leading-snug">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    <span>{c.label}</span>
                    {c.status === 'found' && c.confidence !== 'high' && (
                        <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wide">
                            {c.confidence === 'medium' ? 'likely' : 'weak'}
                        </span>
                    )}
                </div>
                {c.explanation && (
                    <div className="text-slate-500 mt-0.5">{c.explanation}</div>
                )}
                {evidence?.url && (
                    <a href={evidence.url} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-blue-500 hover:underline inline-block mt-0.5 truncate max-w-full">
                        {evidence.headline}
                    </a>
                )}
            </div>
        );
    };

    const renderPillarStrip = (a: MoverAnalysis) => {
        const p = a.pillars;
        if (!p) return null;
        const seg = (label: string, v: number | null) => v === null ? null : `${label} ${Math.round(v)}`;
        const parts = [seg('V', p.valuation), seg('G', p.growth), seg('P', p.profitability), seg('H', p.health), seg('Q', p.quality)].filter(Boolean);
        if (parts.length === 0) return null;
        return (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-slate-500">
                <span className="font-semibold text-slate-400 uppercase tracking-wide">PMP</span>
                {parts.map((s, i) => <span key={i} className="font-medium">{s}</span>)}
                {p.ewScore !== null && (
                    <span className="font-semibold text-indigo-500">
                        EW {p.ewScore}{p.ewMaxPossible !== null && p.ewMaxPossible !== 100 ? `/${p.ewMaxPossible}` : ''}
                    </span>
                )}
            </div>
        );
    };

    const renderRVOLBadge = (rvol: number | null) => {
        if (rvol === null || rvol < 1.5) return null; // Increased threshold for better relevance
        // High RVOL highlighting
        const colorClass = rvol > 5
            ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 animate-pulse'
            : 'bg-blue-500/15 text-blue-400 border-blue-500/20';

        return (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorClass}`}>
                VOL: {rvol.toFixed(1)}x
            </div>
        );
    };

    const renderNewsBadge = (reason: string | null) => {
        if (!reason) return null;
        // now handled inline in the card – keep for backwards compatibility
        return null;
    };


    const renderCategoryBadge = (category: string | null) => {
        if (!category) return null;
        const colors: Record<string, string> = {
            'Earnings': 'bg-purple-100/50 text-purple-700 border-purple-200',
            'Guidance': 'bg-indigo-100/50 text-indigo-700 border-indigo-200',
            'M&A': 'bg-pink-100/50 text-pink-700 border-pink-200',
            'Macro': 'bg-amber-100/50 text-amber-700 border-amber-200',
            'Product': 'bg-cyan-100/50 text-cyan-700 border-cyan-200',
            'Technical': 'bg-slate-100/50 text-slate-700 border-slate-200',
            'Legal': 'bg-rose-100/50 text-rose-700 border-rose-200',
            'Financial': 'bg-emerald-100/50 text-emerald-700 border-emerald-200',
        };

        return (
            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-black border ${colors[category] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}>
                {category}
            </span>
        );
    };



    if (isLoading && movers.length === 0) {
        return <SectionSkeleton rows={10} />;
    }

    const renderMoverCard = (mover: MoverData, index: number) => {
        const sectorData = sectors.find(s => s.name === mover.sector);
        const isIdiosyncratic = mover.sector && sectorData &&
            Math.abs((mover.lastChangePct || 0) - sectorData.avgChange) > 5;

        return (
            <motion.div
                key={mover.symbol}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`group relative bg-white hover:bg-slate-50 border p-4 rounded-2xl transition-all shadow-sm hover:shadow-md ${isIdiosyncratic ? 'border-yellow-400 border-2' : 'border-slate-200'
                    }`}
            >
                {/* Left accent line */}
                <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full transition-colors ${mover.lastChangePct && mover.lastChangePct >= 0 ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                {isIdiosyncratic && (
                    <div className="absolute -top-2 -right-2 bg-yellow-500 text-black text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg z-10">
                        IDIOSYNCRATIC MOVE
                    </div>
                )}

                <div className="flex items-start gap-3">
                    {/* Logo & Symbol */}
                    <div className="flex-shrink-0 cursor-pointer mt-1" onClick={() => onTileClick?.(mover.symbol)}>
                        <CompanyLogo ticker={mover.symbol} logoUrl={mover.logoUrl} size={40} className="rounded-md shadow-sm border border-gray-100 dark:border-gray-800 bg-gray-100 dark:bg-gray-800" />
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Row 1: Symbol + Name + Category + Price */}
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 cursor-pointer" onClick={() => onTileClick?.(mover.symbol)}>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-base text-gray-900 dark:text-gray-100 leading-tight">{mover.symbol}</span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate hidden sm:inline leading-tight">{getCompanyName(mover.symbol)}</span>
                                    {renderCategoryBadge(mover.moversCategory)}
                                </div>

                                {/* Row 2: deterministic catalyst (primary) or AI reason */}
                                {mover.analysis ? renderCatalyst(mover.analysis) : (
                                    <div className={`mt-1.5 text-[11px] leading-tight font-medium ${!mover.moversReason
                                        ? 'text-slate-300 italic'
                                        : mover.lastChangePct && mover.lastChangePct >= 2
                                            ? 'text-green-700'
                                            : mover.lastChangePct && mover.lastChangePct <= -2
                                                ? 'text-red-600'
                                                : 'text-slate-500'
                                        }`}>
                                        {mover.moversReason
                                            ? `"${mover.moversReason}"`
                                            : 'Analyzing market catalyst...'}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col items-end min-w-[70px] shrink-0">
                                <span className="font-mono font-medium text-sm text-gray-900 dark:text-gray-100 tabular-nums">
                                    ${mover.lastPrice?.toFixed(2) || '---'}
                                </span>
                                <div className={`px-1.5 py-0.5 rounded text-[11px] font-bold mt-0.5 tabular-nums ${mover.lastChangePct && mover.lastChangePct >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                                    {mover.lastChangePct != null
                                        ? `${mover.lastChangePct >= 0 ? '+' : ''}${mover.lastChangePct.toFixed(2)}%`
                                        : '0.00%'}
                                </div>
                                {mover.lastVolume != null && mover.lastVolume > 0 && (
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums mt-0.5 whitespace-nowrap">
                                        Vol {formatCompactNumber(mover.lastVolume)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Row 3: Metric Badges + context + pillars */}
                        <div className="flex flex-wrap gap-2 items-center">
                            {renderZScoreBadge(mover.latestMoversZScore)}
                            {renderRVOLBadge(mover.latestMoversRVOL)}
                        </div>
                        {mover.analysis && (
                            <div className="mt-1.5">
                                {renderContextLine(mover.analysis)}
                                {renderPillarStrip(mover.analysis)}
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        );
    };

    return (
        <div className="movers-container space-y-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                <div>
                    <h2 className="flex items-center gap-3 text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white m-0 relative -top-1.5">
                        <SectionIcon type="zap" size={28} className="text-gray-900 dark:text-white shrink-0" />
                        <span>Movers</span>
                        {data?.session && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 self-center">
                                {SESSION_LABELS[data.session] ?? data.session}
                            </span>
                        )}
                    </h2>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Info size={12} />
                        Statistically unusual moves vs each stock&apos;s own volatility — with the likely catalyst when detected
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="w-56 flex-shrink-0">
                        <CustomDropdown
                            value={selectedSector || 'all'}
                            onChange={(val: string) => setSelectedSector(val === 'all' ? null : val)}
                            options={[
                                { value: 'all', label: 'All Sectors' },
                                ...sectors.map(s => ({
                                    value: s.name,
                                    label: `${s.name} (${s.count})`
                                }))
                            ]}
                            className="sector-filter"
                            ariaLabel="Filter by sector"
                            placeholder="All Sectors"
                        />
                    </div>
                    <button
                        onClick={() => mutate()}
                        disabled={isLoading}
                        className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900 disabled:opacity-50"
                        title="Refresh Movers"
                    >
                        <RefreshCw className={`${isLoading ? 'animate-spin' : ''}`} size={20} />
                    </button>
                </div>
            </div>

            {/* Tabs: All / Most Unusual / Explained / Unexplained */}
            <div className="flex gap-1.5 flex-wrap px-1">
                {([
                    ['all', 'All'],
                    ['unusual', 'Most Unusual'],
                    ['explained', 'Explained'],
                    ['unexplained', 'Unexplained'],
                ] as [MoversTab, string][]).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${activeTab === key
                                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 dark:bg-transparent dark:text-slate-400 dark:border-white/10'
                            }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* API failure ≠ no movers — distinguish error from empty state */}
            {error && movers.length === 0 && (
                <div className="text-center p-6 text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                    Market movers data is temporarily unavailable.{' '}
                    <button onClick={() => mutate()} className="text-blue-500 hover:underline font-medium">Retry</button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gainers Column */}
                <div>
                    <h3 className="text-lg font-bold text-green-500 mb-3 flex items-center gap-2 px-2">
                        <TrendingUp size={20} />
                        Gainers <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full ml-1">{gainers.length}</span>
                    </h3>
                    <div className="grid gap-3">
                        {gainers.map((mover, index) => renderMoverCard(mover, index))}
                    </div>
                    {gainers.length === 0 && !isLoading && !error && (
                        <div className="text-center p-8 text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl mt-3">
                            No significant gainers.
                        </div>
                    )}
                </div>

                {/* Losers Column */}
                <div>
                    <h3 className="text-lg font-bold text-red-500 mb-3 flex items-center gap-2 px-2">
                        <TrendingDown size={20} />
                        Losers <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full ml-1">{losers.length}</span>
                    </h3>
                    <div className="grid gap-3">
                        {losers.map((mover, index) => renderMoverCard(mover, index))}
                    </div>
                    {losers.length === 0 && !isLoading && !error && (
                        <div className="text-center p-8 text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl mt-3">
                            No significant losers.
                        </div>
                    )}
                </div>
            </div>

            {/* Methodology Section */}
            <div className="mt-8 pt-6 border-t border-slate-200">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <Info size={16} className="text-blue-500" />
                        How are Market Movers selected?
                    </h4>
                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                        To cut through market noise and highlight truly significant price action, a stock must meet <strong>at least one</strong> of the following criteria to appear on this list:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <div className="text-green-600 font-bold text-sm mb-1">1. Absolute Move</div>
                            <p className="text-[11px] text-slate-500">
                                Stock price changed by <strong>&ge; &plusmn;5.0%</strong> during the current session. Captures major absolute price swings.
                            </p>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <div className="text-blue-600 font-bold text-sm mb-1">2. Volume Surge (RVOL)</div>
                            <p className="text-[11px] text-slate-500">
                                Relative Volume is <strong>&ge; 3.0x</strong> the 20-day average. Highlights massive institutional buying or selling pressure.
                            </p>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <div className="text-purple-600 font-bold text-sm mb-1">3. Statistical Outlier</div>
                            <p className="text-[11px] text-slate-500">
                                Price movement Z-Score is <strong>&ge; &plusmn;2.0</strong>. Flags highly unusual deviation based on the stock's own historical volatility.
                            </p>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                        Each mover is then checked for a likely catalyst — earnings surprises, company news and analyst actions — ranked deterministically by proximity and relevance. &quot;No obvious catalyst detected&quot; is a valid result: we never invent an explanation when the evidence is not there. Sector/market context shows how much of the move is stock-specific (Excess) vs. riding the tape.
                    </p>
                </div>
            </div>
        </div>
    );
}
