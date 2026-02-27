'use client';

import React, { useMemo } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TrendingUp, TrendingDown, RefreshCw, Info, AlertCircle, Share2, Camera } from 'lucide-react';
import { SectionSkeleton } from './SectionSkeleton';
import CompanyLogo from './CompanyLogo';
import { CustomDropdown } from './CustomDropdown';

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
    latestMoversZScore: number | null;
    latestMoversRVOL: number | null;
    moversReason: string | null;
    moversCategory: string | null;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function MoversSection() {
    const [selectedSector, setSelectedSector] = React.useState<string | null>(null);
    const { data, error, isLoading, mutate } = useSWR('/api/stocks/movers?limit=30', fetcher, {
        refreshInterval: 60000, // Refresh every minute
        revalidateOnFocus: true
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
        if (!selectedSector) return movers;
        return movers
            .filter(m => m.sector === selectedSector)
            .sort((a, b) => Math.abs(b.latestMoversZScore ?? 0) - Math.abs(a.latestMoversZScore ?? 0));
    }, [movers, selectedSector]);

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

        return (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorClass}`}>
                <Zap size={10} fill="currentColor" />
                <span>Z: {zscore > 0 ? '+' : ''}{zscore.toFixed(1)}</span>
                {renderConfidenceMeter()}
            </div>
        );
    };

    const renderRVOLBadge = (rvol: number | null) => {
        if (rvol === null || rvol < 1.1) return null;
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

    const handleShareAsImage = (mover: MoverData) => {
        const params = new URLSearchParams({
            symbol: mover.symbol,
            name: mover.name || '',
            price: (mover.lastPrice || 0).toFixed(2),
            changePct: (mover.lastChangePct || 0).toFixed(2),
            zScore: (mover.latestMoversZScore || 0).toFixed(2),
            rvol: (mover.latestMoversRVOL || 0).toFixed(1),
            category: mover.moversCategory || 'Technical',
            reason: mover.moversReason || '',
            // We fetch these from the mover object if available or default
            sbc: '0',
            confidence: '80'
        });
        window.open(`/api/og?${params.toString()}`, '_blank');
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
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
                className={`group relative bg-white hover:bg-slate-50 border p-4 rounded-2xl transition-all shadow-sm hover:shadow-md ${isIdiosyncratic ? 'border-yellow-400 border-2' : 'border-slate-200'
                    }`}
            >
                {/* Left accent line */}
                <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full transition-colors ${mover.lastChangePct && mover.lastChangePct >= 0 ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                {isIdiosyncratic && (
                    <div className="absolute -top-2 -right-2 bg-yellow-500 text-black text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg z-10 animate-bounce">
                        IDIOSYNCRATIC MOVE
                    </div>
                )}

                <div className="flex items-start gap-4">
                    {/* Logo & Symbol */}
                    <div className="flex-shrink-0">
                        <CompanyLogo ticker={mover.symbol} logoUrl={mover.logoUrl} size={48} className="rounded-xl shadow-sm border border-slate-100" />
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Row 1: Symbol + Name + Category + Price */}
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-lg font-black text-slate-900 leading-none">{mover.symbol}</span>
                                    <span className="text-xs text-slate-400 truncate hidden sm:inline">{mover.name}</span>
                                    {renderCategoryBadge(mover.moversCategory)}
                                </div>

                                {/* Row 2: AI Reason */}
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
                            </div>

                            <div className="text-right flex-shrink-0">
                                <div className={`text-lg font-black flex items-center justify-end gap-1 ${mover.lastChangePct && mover.lastChangePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {mover.lastChangePct != null
                                        ? `${mover.lastChangePct >= 0 ? '+' : ''}${mover.lastChangePct.toFixed(2)}%`
                                        : '0.00%'}
                                </div>
                                <div className="text-[10px] text-slate-400 font-medium font-mono">
                                    ${mover.lastPrice?.toFixed(2) || '---'}
                                </div>
                            </div>
                        </div>

                        {/* Row 3: Metric Badges */}
                        <div className="flex flex-wrap gap-2 items-center">
                            {renderZScoreBadge(mover.latestMoversZScore)}
                            {renderRVOLBadge(mover.latestMoversRVOL)}
                            <button
                                onClick={() => handleShareAsImage(mover)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                                title="Share as Bloomberg-style Image"
                            >
                                <Share2 size={10} />
                                SHARE
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    };

    return (
        <div className="movers-container space-y-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-2">
                        <Zap className="text-yellow-400" fill="currentColor" />
                        Market Movers
                    </h2>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Info size={12} />
                        Stocks with significant statistical deviations (Z-Score & RVVOL)
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
                        className="p-2 hover:bg-white/5 rounded-full transition-all text-gray-400 hover:text-white disabled:opacity-50"
                        title="Refresh Movers"
                    >
                        <RefreshCw className={`${isLoading ? 'animate-spin' : ''}`} size={20} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gainers Column */}
                <div>
                    <h3 className="text-lg font-bold text-green-500 mb-3 flex items-center gap-2 px-2">
                        <TrendingUp size={20} />
                        Gainers <span className="text-sm font-normal text-slate-500 bg-white/10 px-2 py-0.5 rounded-full ml-1">{gainers.length}</span>
                    </h3>
                    <div className="grid gap-3">
                        <AnimatePresence mode="popLayout">
                            {gainers.map((mover, index) => renderMoverCard(mover, index))}
                        </AnimatePresence>
                    </div>
                    {gainers.length === 0 && !isLoading && (
                        <div className="text-center p-8 text-slate-400 bg-white/5 border border-dashed border-white/10 rounded-2xl mt-3">
                            No significant gainers.
                        </div>
                    )}
                </div>

                {/* Losers Column */}
                <div>
                    <h3 className="text-lg font-bold text-red-500 mb-3 flex items-center gap-2 px-2">
                        <TrendingDown size={20} />
                        Losers <span className="text-sm font-normal text-slate-500 bg-white/10 px-2 py-0.5 rounded-full ml-1">{losers.length}</span>
                    </h3>
                    <div className="grid gap-3">
                        <AnimatePresence mode="popLayout">
                            {losers.map((mover, index) => renderMoverCard(mover, index))}
                        </AnimatePresence>
                    </div>
                    {losers.length === 0 && !isLoading && (
                        <div className="text-center p-8 text-slate-400 bg-white/5 border border-dashed border-white/10 rounded-2xl mt-3">
                            No significant losers.
                        </div>
                    )}
                </div>
            </div>

            {/* Methodology Section */}
            <div className="mt-8 pt-6 border-t border-white/5">
                <div className="bg-slate-900/50 rounded-2xl p-6 border border-white/5">
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                        <Info size={16} className="text-blue-400" />
                        How are Market Movers selected?
                    </h4>
                    <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                        To cut through market noise and highlight truly significant price action, a stock must meet <strong>at least one</strong> of the following criteria to appear on this list:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-green-400 font-bold text-sm mb-1">1. Absolute Move</div>
                            <p className="text-[11px] text-gray-400">
                                Stock price changed by <strong>&ge; &plusmn;5.0%</strong> during the current session. Captures major absolute price swings.
                            </p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-blue-400 font-bold text-sm mb-1">2. Volume Surge (RVOL)</div>
                            <p className="text-[11px] text-gray-400">
                                Relative Volume is <strong>&ge; 3.0x</strong> the 20-day average. Highlights massive institutional buying or selling pressure.
                            </p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-purple-400 font-bold text-sm mb-1">3. Statistical Outlier</div>
                            <p className="text-[11px] text-gray-400">
                                Price movement Z-Score is <strong>&ge; &plusmn;2.0</strong>. Flags highly unusual deviation based on the stock's own historical volatility.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
