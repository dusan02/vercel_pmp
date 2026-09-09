'use client';

import React from 'react';
import {
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Area,
} from 'recharts';
import type { RatioStats } from './types';
import { GROWTH_CAP, PE_DERATING_THRESHOLD, PE_DERATING_PREMIUM } from './scenarioLab/format';
import { useScenarioModel } from './scenarioLab/useScenarioModel';
import { ScenarioTooltip } from './scenarioLab/ScenarioTooltip';
import { GrowthSlider, StatCard, HorizonSlider } from './scenarioLab/controls';
import { fmtMoney, fmtCompact, fmtPct, fmtPe } from './scenarioLab/format';

interface ScenarioLabProps {
    ticker: string;
    currentEps: number;
    currentPe: number;
    currentPrice: number;
    priceHistory?: { date: string; price: number }[];
    forwardPe?: number | null;
    forwardEps?: number | null;
    forwardImpliedGrowth?: number | null;
    peStats?: RatioStats | null;
    epsCagr3y?: number | null;
    epsCagr5y?: number | null;
}

export function ScenarioLab({
    ticker,
    currentEps,
    currentPe,
    currentPrice,
    priceHistory: propPriceHistory,
    forwardPe,
    forwardEps,
    forwardImpliedGrowth,
    peStats,
    epsCagr3y,
    epsCagr5y,
}: ScenarioLabProps) {
    const m = useScenarioModel({
        ticker, currentEps, currentPe, currentPrice,
        priceHistory: propPriceHistory,
        forwardPe, forwardEps, forwardImpliedGrowth, peStats, epsCagr3y, epsCagr5y,
    });

    const cagrColor = (cagr: number | null) => {
        if (cagr === null) return 'text-gray-400';
        if (cagr > 15) return 'text-green-500';
        if (cagr > 0) return 'text-blue-500';
        return 'text-red-500';
    };

    // Collect EVERY non-null series value — the previous first-non-null-per-point
    // approach clipped the bear/bull lines whenever base was also present.
    const allPrices = m.chartData
        .flatMap(d => [d.historical, d.projection, d.bear, d.base, d.bull])
        .filter((v): v is number => v != null && v > 0);
    const yMin = allPrices.length > 0 ? Math.floor(Math.min(...allPrices) * 0.85) : 0;
    const yMax = allPrices.length > 0 ? Math.ceil(Math.max(...allPrices) * 1.1) : 100;
    const hasChart = m.chartData.length > 2;

    return (
        <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
                <button
                    onClick={() => m.setMode('dataDriven')}
                    className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        m.mode === 'dataDriven'
                            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    Data-Driven Valuation
                </button>
                <button
                    onClick={() => m.setMode('manual')}
                    className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        m.mode === 'manual'
                            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    Manual Scenario
                </button>
            </div>

            {m.isNegativePe && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3 text-sm text-yellow-800 dark:text-yellow-400">
                    ⚠️ Company has negative or no P/E (loss-making). Projection uses assumed exit P/E — treat results as speculative.
                </div>
            )}

            {/* ── DATA-DRIVEN MODE ── */}
            {m.mode === 'dataDriven' && m.hasDataDrivenData && (
                <>
                    {/* Compact summary — hero card */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900/50 dark:to-gray-800/50 rounded-xl p-5 sm:p-6 border border-blue-100 dark:border-gray-800">
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
                            Estimated {m.targetYear} Value <span className="text-gray-400 dark:text-gray-500">(base case)</span>
                        </p>
                        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                            <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tabular-nums">
                                {fmtMoney(m.basePrice)}
                            </p>
                            {m.baseCagr !== null && (
                                <p className={`text-lg sm:text-xl font-bold tabular-nums ${cagrColor(m.baseCagr)}`}>
                                    {fmtPct(m.baseCagr)} CAGR
                                </p>
                            )}
                        </div>
                        {m.hasConfidenceWarning && (
                            <div className="mt-2 mb-1">
                                <span className="inline-block text-[10px] uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                                    ⚠ High-growth projection
                                </span>
                            </div>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                            Based on {forwardEps ? 'forward EPS' : 'current EPS'}, scenario-based EPS growth, and
                            {m.peWasNormalized ? ' mean-reverted' : ' 5Y historical'} P/E distribution
                        </p>
                        <button
                            onClick={() => m.setShowMethodology(!m.showMethodology)}
                            className="mt-3 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                            {m.showMethodology ? '↑ Hide methodology' : '↓ Show methodology'}
                        </button>
                    </div>

                    {/* Methodology details */}
                    {m.showMethodology && (
                        <div className="space-y-5 bg-gray-50 dark:bg-gray-900/30 rounded-xl p-4 sm:p-5 border border-gray-100 dark:border-gray-800">
                            {/* Market assumptions */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5">Market Assumptions</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    <StatCard label="Current EPS" value={fmtMoney(currentEps)} />
                                    <StatCard label="Forward P/E" value={fmtPe(forwardPe)} />
                                    <StatCard label="Implied Forward EPS" value={fmtMoney(forwardEps)} />
                                    <StatCard label="Current Price" value={fmtMoney(currentPrice)} />
                                </div>
                            </div>

                            {/* EPS growth inputs */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5">EPS Growth Inputs</p>
                                <div className="grid grid-cols-3 gap-2.5 mb-3">
                                    <StatCard label="Historical 3Y CAGR" value={m.rawGrowth3y != null ? fmtPct(m.rawGrowth3y) : 'N/A'} />
                                    <StatCard label="Historical 5Y CAGR" value={m.rawGrowth5y != null ? fmtPct(m.rawGrowth5y) : 'N/A'} />
                                    <StatCard label="Forward Implied (1Y)" value={m.fwdImplied != null ? fmtPct(m.fwdImplied) : 'N/A'} />
                                </div>
                                {m.growthWasCapped && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                                        ⚠ Historical growth ({fmtPct(m.rawGrowth5y)}) exceeds {GROWTH_CAP}% cap — sustained growth at this rate over 5 years is economically unrealistic. Base scenario uses {GROWTH_CAP}%.
                                    </p>
                                )}
                            </div>

                            {/* 5Y Historical P/E with normalization */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5">
                                    5Y Historical P/E Distribution {peStats ? `(${peStats.count.toLocaleString()} obs)` : ''}
                                </p>
                                <div className="grid grid-cols-3 gap-2.5">
                                    <div className="text-center bg-red-50 dark:bg-red-900/10 rounded-lg py-2.5 border border-red-100 dark:border-red-900/20">
                                        <p className="text-xs text-red-400 mb-1">Bear (P25)</p>
                                        <p className="font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">{fmtPe(m.effectiveBearPe)}</p>
                                        {m.peWasNormalized && m.rawBearPe !== m.effectiveBearPe && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">raw: {fmtPe(m.rawBearPe)}</p>
                                        )}
                                    </div>
                                    <div className="text-center bg-blue-50 dark:bg-blue-900/10 rounded-lg py-2.5 ring-1 ring-blue-200 dark:ring-blue-800 border border-blue-100 dark:border-blue-900/20">
                                        <p className="text-xs text-blue-400 mb-1">Base (Median)</p>
                                        <p className="font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">{fmtPe(m.effectiveBasePe)}</p>
                                        {m.peWasNormalized && m.rawBasePe !== m.effectiveBasePe && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">raw: {fmtPe(m.rawBasePe)}</p>
                                        )}
                                    </div>
                                    <div className="text-center bg-green-50 dark:bg-green-900/10 rounded-lg py-2.5 border border-green-100 dark:border-green-900/20">
                                        <p className="text-xs text-green-400 mb-1">Bull (P75)</p>
                                        <p className="font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">{fmtPe(m.effectiveBullPe)}</p>
                                        {m.peWasNormalized && m.rawBullPe !== m.effectiveBullPe && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">raw: {fmtPe(m.rawBullPe)}</p>
                                        )}
                                    </div>
                                </div>
                                {m.peWasNormalized && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                        ⚠ P/E normalized: 5Y median ({fmtPe(m.rawBasePe)}) is {PE_DERATING_THRESHOLD}×+ higher than forward P/E ({fmtPe(forwardPe)}), indicating market expects valuation de-rating. Using forward P/E × {PE_DERATING_PREMIUM} as base.
                                    </p>
                                )}
                            </div>

                            {/* Scenario growth sliders */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Scenario EPS Growth (adjustable)</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <GrowthSlider label="Bear Growth" value={m.bearGrowth} onChange={m.setBearGrowth} accentColor="red" />
                                    <GrowthSlider label="Base Growth" value={m.baseGrowth} onChange={m.setBaseGrowth} accentColor="blue" />
                                    <GrowthSlider label="Bull Growth" value={m.bullGrowth} onChange={m.setBullGrowth} accentColor="green" />
                                </div>
                                <div className="flex justify-between text-xs text-gray-400 mt-1.5 px-1">
                                    <span>-20%</span><span>0%</span><span>+50%</span>
                                </div>
                            </div>

                            {/* Horizon */}
                            <HorizonSlider years={m.ddYears} onChange={m.setDdYears} />

                            {/* Bear/Base/Bull projection table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                                            <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"></th>
                                            <th className="text-right py-2.5 px-3 text-xs font-semibold text-red-400 uppercase tracking-wider">Bear</th>
                                            <th className="text-right py-2.5 px-3 text-xs font-semibold text-blue-400 uppercase tracking-wider">Base</th>
                                            <th className="text-right py-2.5 px-3 text-xs font-semibold text-green-400 uppercase tracking-wider">Bull</th>
                                        </tr>
                                    </thead>
                                    <tbody className="font-mono tabular-nums">
                                        <tr className="border-b border-gray-100 dark:border-gray-800">
                                            <td className="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400 font-sans">EPS Growth</td>
                                            <td className="text-right py-2.5 px-3 text-red-500">{fmtPct(m.bearGrowth)}</td>
                                            <td className="text-right py-2.5 px-3 text-blue-500">{fmtPct(m.baseGrowth)}</td>
                                            <td className="text-right py-2.5 px-3 text-green-500">{fmtPct(m.bullGrowth)}</td>
                                        </tr>
                                        <tr className="border-b border-gray-100 dark:border-gray-800">
                                            <td className="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400 font-sans">{m.targetYear} EPS</td>
                                            <td className="text-right py-2.5 px-3 text-gray-900 dark:text-gray-100">{fmtMoney(m.bearProjEps)}</td>
                                            <td className="text-right py-2.5 px-3 text-gray-900 dark:text-gray-100">{fmtMoney(m.baseProjEps)}</td>
                                            <td className="text-right py-2.5 px-3 text-gray-900 dark:text-gray-100">{fmtMoney(m.bullProjEps)}</td>
                                        </tr>
                                        <tr className="border-b border-gray-100 dark:border-gray-800">
                                            <td className="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400 font-sans">P/E Multiple</td>
                                            <td className="text-right py-2.5 px-3 text-gray-900 dark:text-gray-100">{fmtPe(m.effectiveBearPe)}</td>
                                            <td className="text-right py-2.5 px-3 text-gray-900 dark:text-gray-100">{fmtPe(m.effectiveBasePe)}</td>
                                            <td className="text-right py-2.5 px-3 text-gray-900 dark:text-gray-100">{fmtPe(m.effectiveBullPe)}</td>
                                        </tr>
                                        <tr className="border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                                            <td className="py-2.5 px-3 text-xs text-gray-600 dark:text-gray-300 font-sans font-semibold">{m.targetYear} Price</td>
                                            <td className="text-right py-2.5 px-3 font-bold text-red-500">{fmtMoney(m.bearPrice)}</td>
                                            <td className="text-right py-2.5 px-3 font-bold text-blue-500">{fmtMoney(m.basePrice)}</td>
                                            <td className="text-right py-2.5 px-3 font-bold text-green-500">{fmtMoney(m.bullPrice)}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400 font-sans">Expected CAGR</td>
                                            <td className={`text-right py-2.5 px-3 font-semibold ${m.bearCagr !== null && m.bearCagr > 0 ? 'text-red-500' : 'text-red-400'}`}>
                                                {fmtPct(m.bearCagr)}
                                            </td>
                                            <td className={`text-right py-2.5 px-3 font-semibold ${m.baseCagr !== null && m.baseCagr > 0 ? 'text-blue-500' : 'text-blue-400'}`}>
                                                {fmtPct(m.baseCagr)}
                                            </td>
                                            <td className={`text-right py-2.5 px-3 font-semibold ${m.bullCagr !== null && m.bullCagr > 0 ? 'text-green-500' : 'text-green-400'}`}>
                                                {fmtPct(m.bullCagr)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Confidence / evidence details */}
                            {m.hasConfidenceWarning && (
                                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3.5">
                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">Evidence Level</p>
                                    <ul className="space-y-1.5">
                                        {m.confidenceFlags.map((flag, i) => (
                                            <li key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                                                <span className="mt-0.5 shrink-0">⚠</span>
                                                <span>{flag}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2.5 italic">
                                        Projection relies on normalization of extreme inputs — treat as directional, not precise.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Data-Driven mode but insufficient data */}
            {m.mode === 'dataDriven' && !m.hasDataDrivenData && (
                <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg text-center border border-gray-100 dark:border-gray-700/50">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Not enough data for Data-Driven Valuation. Need valid EPS and historical P/E stats.
                        Switch to Manual Scenario to set assumptions manually.
                    </p>
                </div>
            )}

            {/* ── MANUAL MODE ── */}
            {m.mode === 'manual' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Inputs */}
                    <div className="space-y-5">
                        <HorizonSlider years={m.years} onChange={m.setYears} />

                        <div>
                            <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <span>Expected Annual EPS Growth</span>
                                <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">{fmtPct(m.epsGrowth)}</span>
                            </label>
                            <input
                                type="range" min="-20" max="50" step="1" value={m.epsGrowth}
                                onChange={(e) => m.setEpsGrowth(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>-20%</span><span>0%</span><span>+50%</span>
                            </div>
                        </div>

                        <div>
                            <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <span>Exit P/E Multiple</span>
                                <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">{fmtPe(m.exitPe)}</span>
                            </label>
                            <input
                                type="range" min="3" max="100" step="0.5" value={m.exitPe}
                                onChange={(e) => m.setExitPe(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>3×</span>
                                <span className="text-blue-400 font-semibold">Current: {fmtPe(currentPe)}</span>
                                <span>100×</span>
                            </div>
                        </div>
                    </div>

                    {/* Results */}
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-5 sm:p-6 border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
                        <div className="grid grid-cols-2 gap-4 mb-5">
                            <div>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Current Price</p>
                                <p className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{fmtMoney(currentPrice)}</p>
                            </div>
                            <div>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Projected EPS (Y{m.years})</p>
                                <p className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{fmtMoney(m.projectedEps)}</p>
                            </div>
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                            <div className="flex justify-between items-end mb-2">
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Target Price in {m.years}Y</p>
                                <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tabular-nums">{fmtMoney(m.targetPrice)}</p>
                            </div>
                            <div className="flex justify-between items-center mt-3">
                                <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Annual Return (CAGR)</p>
                                <p className={`text-xl sm:text-2xl font-bold flex items-center gap-2 tabular-nums ${m.manualCagr > 15 ? 'text-green-500' : m.manualCagr > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                    {fmtPct(m.manualCagr, 2)}
                                    {m.isMarketBeating && (
                                        <span className="text-[9px] uppercase tracking-wider bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold">
                                            Market Beating
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Chart: Historical + Projected */}
            {hasChart && (
                <div className="w-full" style={{ minHeight: 320 }}>
                    <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart data={m.chartData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                            <defs>
                                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="bullGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.08} />
                                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                            <XAxis
                                dataKey="timestamp"
                                type="number"
                                scale="time"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(val) => new Date(val).getFullYear().toString()}
                                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                                axisLine={false}
                                tickLine={false}
                                minTickGap={60}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                                axisLine={false}
                                tickLine={false}
                                width={55}
                                domain={[yMin, yMax]}
                                tickFormatter={(v: number) => fmtCompact(v)}
                            />
                            <Tooltip content={<ScenarioTooltip />} />
                            <ReferenceLine x={m.chartData.find(d => d.projection !== null && d.historical !== null)?.timestamp ?? m.chartData.find(d => d.bear !== null && d.historical !== null)?.timestamp ?? ''} stroke="#9CA3AF" strokeDasharray="3 3" label={{ value: 'Today', fontSize: 10, fill: '#9CA3AF', position: 'top' }} />
                            <Line
                                type="monotone"
                                dataKey="historical"
                                stroke="#6B7280"
                                strokeWidth={1.5}
                                dot={false}
                                connectNulls={false}
                                isAnimationActive={false}
                            />
                            {m.mode === 'manual' ? (
                                <>
                                    <Line
                                        type="monotone"
                                        dataKey="projection"
                                        stroke="#3B82F6"
                                        strokeWidth={2.5}
                                        strokeDasharray="8 4"
                                        dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }}
                                        connectNulls={false}
                                        isAnimationActive={false}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="projection"
                                        fill="url(#projGrad)"
                                        stroke="none"
                                        connectNulls={false}
                                        isAnimationActive={false}
                                    />
                                </>
                            ) : (
                                <>
                                    <Line
                                        type="monotone"
                                        dataKey="bull"
                                        stroke="#22C55E"
                                        strokeWidth={2}
                                        strokeDasharray="6 3"
                                        dot={{ r: 3, fill: '#22C55E', strokeWidth: 1, stroke: '#fff' }}
                                        connectNulls={false}
                                        isAnimationActive={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="base"
                                        stroke="#3B82F6"
                                        strokeWidth={2.5}
                                        strokeDasharray="8 4"
                                        dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }}
                                        connectNulls={false}
                                        isAnimationActive={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="bear"
                                        stroke="#EF4444"
                                        strokeWidth={2}
                                        strokeDasharray="6 3"
                                        dot={{ r: 3, fill: '#EF4444', strokeWidth: 1, stroke: '#fff' }}
                                        connectNulls={false}
                                        isAnimationActive={false}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="bull"
                                        fill="url(#bullGrad)"
                                        stroke="none"
                                        connectNulls={false}
                                        isAnimationActive={false}
                                    />
                                </>
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
