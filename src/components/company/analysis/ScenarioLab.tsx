import React, { useState, useEffect, useMemo } from 'react';
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

interface PricePoint {
    date: string;
    price: number;
}

type Mode = 'manual' | 'dataDriven';

// ── Normalization constants ──
const GROWTH_CAP = 25;      // Max long-term EPS growth assumption (%)
const GROWTH_FLOOR = -10;   // Min growth (%)
const PE_ABSOLUTE_CAP = 60; // No stock sustains >60× long-term
const PE_DERATING_THRESHOLD = 2.0; // If median > 2× forward P/E → de-rating signal
const PE_DERATING_PREMIUM = 1.5;   // Use forward P/E × 1.5 as normalized base

// Clamp helper
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function ScenarioTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const lines = payload
        .filter((d: any) => d.value !== null && d.value !== undefined)
        .map((d: any) => {
            const isProjected = d?.payload?.projected;
            const name = d.name;
            const color = d.stroke || d.color;
            return (
                <p key={name} className="font-bold" style={{ color }}>
                    {name}: ${d.value?.toFixed(2)}
                    {isProjected ? ' (proj)' : ''}
                </p>
            );
        });
    if (lines.length === 0) return null;
    return (
        <div className="bg-white dark:bg-gray-800 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-xs">
            <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
            {lines}
        </div>
    );
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
    const [mode, setMode] = useState<Mode>('dataDriven');
    const [priceHistory, setPriceHistory] = useState<PricePoint[]>(propPriceHistory ?? []);

    // ── Manual mode state (existing behavior) ──
    const [epsGrowth, setEpsGrowth] = useState<number>(10);
    const [exitPe, setExitPe] = useState<number>(Math.max(5, Math.min(100, currentPe || 20)));
    const [years, setYears] = useState<number>(5);

    // ── Data-Driven mode state ──
    const [ddYears, setDdYears] = useState<number>(5);
    const [showMethodology, setShowMethodology] = useState<boolean>(false);

    // ── Growth inputs ──
    // Three independent growth rates for Bear/Base/Bull scenarios.
    // Smart defaults derived from historical CAGRs + forward implied growth.
    const rawGrowth5y = epsCagr5y ?? null;
    const rawGrowth3y = epsCagr3y ?? null;
    const fwdImplied = forwardImpliedGrowth ?? null;

    // Normalized base growth: cap at GROWTH_CAP
    const normalizedBaseGrowth = clamp(rawGrowth5y ?? rawGrowth3y ?? 10, GROWTH_FLOOR, GROWTH_CAP);
    const growthWasCapped = (rawGrowth5y !== null && rawGrowth5y > GROWTH_CAP) || (rawGrowth5y === null && rawGrowth3y !== null && rawGrowth3y > GROWTH_CAP);

    // Bear: conservative — min of 3Y/5Y, floored at 0 for stability
    const defaultBearGrowth = clamp(
        Math.min(rawGrowth3y ?? normalizedBaseGrowth, rawGrowth5y ?? normalizedBaseGrowth),
        0, GROWTH_CAP
    );
    // Base: normalized 5Y CAGR (capped)
    const defaultBaseGrowth = normalizedBaseGrowth;
    // Bull: higher — min of (max of 3Y/5Y, forward implied), capped at 35%
    const defaultBullGrowth = clamp(
        Math.max(rawGrowth3y ?? normalizedBaseGrowth, rawGrowth5y ?? normalizedBaseGrowth),
        GROWTH_FLOOR, 35
    );

    const [bearGrowth, setBearGrowth] = useState<number>(defaultBearGrowth);
    const [baseGrowth, setBaseGrowth] = useState<number>(defaultBaseGrowth);
    const [bullGrowth, setBullGrowth] = useState<number>(defaultBullGrowth);

    // Fetch historical price data only if not provided via props
    useEffect(() => {
        if (propPriceHistory && propPriceHistory.length > 0) return;
        let cancelled = false;
        fetch(`/api/analysis/${ticker}/history`)
            .then(r => r.json())
            .then(d => { if (!cancelled && d.priceHistory) setPriceHistory(d.priceHistory); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [ticker, propPriceHistory]);

    const isNegativePe = !currentPe || currentPe <= 0;

    // Use the actual reported EPS as the base for projections.
    const baseEps = (currentEps > 0) ? currentEps
        : (currentPe > 0 && currentPrice > 0) ? (currentPrice / currentPe)
        : currentEps;

    // ── Manual mode calculations (unchanged) ──
    const projectedEps = baseEps * Math.pow(1 + epsGrowth / 100, years);
    const targetPrice = projectedEps * exitPe;
    let manualCagr = 0;
    if (currentPrice > 0 && targetPrice > 0) {
        manualCagr = (Math.pow(targetPrice / currentPrice, 1 / years) - 1) * 100;
    }
    const isMarketBeating = manualCagr > 15;

    // ── Data-Driven mode: P/E normalization (mean reversion) ──
    const rawBearPe = peStats?.p25 ?? null;
    const rawBasePe = peStats?.median ?? null;
    const rawBullPe = peStats?.p75 ?? null;

    // Mean reversion: if 5Y median > 2× forward P/E, market signals de-rating
    const isDerating = !!(forwardPe && forwardPe > 0 && rawBasePe && rawBasePe > forwardPe * PE_DERATING_THRESHOLD);
    const peWasNormalized = isDerating;

    function normalizePe(rawPe: number | null): number | null {
        if (rawPe === null) return null;
        if (isDerating && forwardPe && forwardPe > 0) {
            const reverted = forwardPe * PE_DERATING_PREMIUM;
            return Math.min(rawPe, reverted, PE_ABSOLUTE_CAP);
        }
        return Math.min(rawPe, PE_ABSOLUTE_CAP);
    }

    const effectiveBearPe = normalizePe(rawBearPe)
        ?? (currentPe > 0 ? currentPe * 0.8 : null);
    const effectiveBasePe = normalizePe(rawBasePe)
        ?? currentPe ?? null;
    const effectiveBullPe = normalizePe(rawBullPe)
        ?? (currentPe > 0 ? currentPe * 1.2 : null);

    // ── Data-Driven mode: 3 independent scenarios ──
    // Each scenario has its own EPS growth + P/E multiple
    const ddBaseEps = (forwardEps && forwardEps > 0) ? forwardEps : baseEps;

    const bearProjEps = ddBaseEps * Math.pow(1 + bearGrowth / 100, ddYears);
    const baseProjEps = ddBaseEps * Math.pow(1 + baseGrowth / 100, ddYears);
    const bullProjEps = ddBaseEps * Math.pow(1 + bullGrowth / 100, ddYears);

    const bearPrice = (effectiveBearPe && effectiveBearPe > 0) ? bearProjEps * effectiveBearPe : null;
    const basePrice = (effectiveBasePe && effectiveBasePe > 0) ? baseProjEps * effectiveBasePe : null;
    const bullPrice = (effectiveBullPe && effectiveBullPe > 0) ? bullProjEps * effectiveBullPe : null;

    const bearCagr = (bearPrice && currentPrice > 0) ? (Math.pow(bearPrice / currentPrice, 1 / ddYears) - 1) * 100 : null;
    const baseCagr = (basePrice && currentPrice > 0) ? (Math.pow(basePrice / currentPrice, 1 / ddYears) - 1) * 100 : null;
    const bullCagr = (bullPrice && currentPrice > 0) ? (Math.pow(bullPrice / currentPrice, 1 / ddYears) - 1) * 100 : null;

    const hasDataDrivenData = !!(ddBaseEps > 0 && effectiveBasePe && effectiveBasePe > 0);
    const targetYear = new Date().getFullYear() + ddYears;

    // ── Confidence / evidence level ──
    // Flag projections that rely heavily on normalization or have extreme inputs
    const isHighGrowth = baseCagr !== null && baseCagr > 25;
    const confidenceFlags: string[] = [];
    if (growthWasCapped) confidenceFlags.push(`Growth capped at ${GROWTH_CAP}% (raw: ${rawGrowth5y?.toFixed(1)}%)`);
    if (peWasNormalized) confidenceFlags.push(`P/E mean-reverted (raw median: ${rawBasePe?.toFixed(1)}× → ${effectiveBasePe?.toFixed(1)}×)`);
    if (isHighGrowth) confidenceFlags.push(`Base CAGR > 25% — high-growth projection`);
    if (fwdImplied !== null && fwdImplied > 50) confidenceFlags.push(`Forward implied growth ${fwdImplied.toFixed(0)}% — market expects extreme near-term growth`);
    const hasConfidenceWarning = confidenceFlags.length > 0;

    // ── Chart data ──
    const chartData = useMemo(() => {
        const activeYears = mode === 'manual' ? years : ddYears;
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
        const cutoff = fiveYearsAgo.toISOString().slice(0, 10);

        const hist = priceHistory
            .filter(p => p.date >= cutoff)
            .map(p => ({
                date: p.date,
                timestamp: new Date(p.date).getTime(),
                historical: p.price,
                projection: null as number | null,
                bear: null as number | null,
                base: null as number | null,
                bull: null as number | null,
                projected: false,
            }));

        if (hist.length === 0 && currentPrice > 0) {
            const d = new Date().toISOString().slice(0, 10);
            hist.push({ date: d, timestamp: new Date(d).getTime(), historical: currentPrice, projection: null, bear: null, base: null, bull: null, projected: false });
        }

        if (hist.length > 0) {
            hist[hist.length - 1]!.projection = currentPrice;
            if (mode === 'dataDriven') {
                hist[hist.length - 1]!.bear = currentPrice;
                hist[hist.length - 1]!.base = currentPrice;
                hist[hist.length - 1]!.bull = currentPrice;
            }
        }

        const lastDate = hist.length > 0 ? hist[hist.length - 1]!.date : new Date().toISOString().slice(0, 10);
        const today = new Date(lastDate);
        const projPoints: typeof hist = [];

        for (let y = 1; y <= activeYears; y++) {
            const futureDate = new Date(today);
            futureDate.setFullYear(futureDate.getFullYear() + y);
            const label = futureDate.toISOString().slice(0, 10);

            if (mode === 'manual') {
                let priceAtYear: number;
                if (currentPe > 0 && baseEps > 0) {
                    const peAtYear = currentPe + (exitPe - currentPe) * (y / activeYears);
                    priceAtYear = baseEps * Math.pow(1 + epsGrowth / 100, y) * peAtYear;
                } else {
                    priceAtYear = currentPrice + (targetPrice - currentPrice) * (y / activeYears);
                }
                projPoints.push({ date: label, timestamp: futureDate.getTime(), historical: null as any, projection: priceAtYear, bear: null, base: null, bull: null, projected: true });
            } else {
                // Each scenario uses its own growth rate
                const bearEpsAtYear = ddBaseEps * Math.pow(1 + bearGrowth / 100, y);
                const baseEpsAtYear = ddBaseEps * Math.pow(1 + baseGrowth / 100, y);
                const bullEpsAtYear = ddBaseEps * Math.pow(1 + bullGrowth / 100, y);
                const bearP = (effectiveBearPe && effectiveBearPe > 0) ? bearEpsAtYear * effectiveBearPe : null;
                const baseP = (effectiveBasePe && effectiveBasePe > 0) ? baseEpsAtYear * effectiveBasePe : null;
                const bullP = (effectiveBullPe && effectiveBullPe > 0) ? bullEpsAtYear * effectiveBullPe : null;
                projPoints.push({ date: label, timestamp: futureDate.getTime(), historical: null as any, projection: null, bear: bearP, base: baseP, bull: bullP, projected: true });
            }
        }

        return [...hist, ...projPoints];
    }, [priceHistory, currentPrice, mode, years, ddYears, currentPe, baseEps, exitPe, epsGrowth, targetPrice, ddBaseEps, bearGrowth, baseGrowth, bullGrowth, effectiveBearPe, effectiveBasePe, effectiveBullPe]);

    // Y-axis domain
    const allPrices = chartData.map(d => d.historical ?? d.projection ?? d.bear ?? d.base ?? d.bull ?? 0).filter(v => v > 0);
    const yMin = allPrices.length > 0 ? Math.floor(Math.min(...allPrices) * 0.85) : 0;
    const yMax = allPrices.length > 0 ? Math.ceil(Math.max(...allPrices) * 1.1) : 100;

    const hasChart = chartData.length > 2;

    // Helper for growth slider row
    function GrowthSlider({ label, value, onChange, colorClass }: { label: string; value: number; onChange: (v: number) => void; colorClass: string }) {
        return (
            <div>
                <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <span className={colorClass}>{label}</span>
                    <span className={`font-mono ${colorClass}`}>{value > 0 ? '+' : ''}{value}%</span>
                </label>
                <input
                    type="range" min="-20" max="50" step="1" value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
                <button
                    onClick={() => setMode('dataDriven')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        mode === 'dataDriven'
                            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    Data-Driven Valuation
                </button>
                <button
                    onClick={() => setMode('manual')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        mode === 'manual'
                            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    Manual Scenario
                </button>
            </div>

            {isNegativePe && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3 text-sm text-yellow-800 dark:text-yellow-400">
                    ⚠️ Company has negative or no P/E (loss-making). Projection uses assumed exit P/E — treat results as speculative.
                </div>
            )}

            {/* ── DATA-DRIVEN MODE ── */}
            {mode === 'dataDriven' && hasDataDrivenData && (
                <>
                    {/* Compact summary */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900/50 dark:to-gray-800/50 rounded-xl p-5 sm:p-6 border border-blue-100 dark:border-gray-800">
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
                            Estimated {targetYear} Value <span className="text-gray-400 dark:text-gray-500">(base case)</span>
                        </p>
                        <div className="flex items-baseline gap-3 mb-2">
                            <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                                ${basePrice?.toFixed(2) ?? '—'}
                            </p>
                            {baseCagr !== null && (
                                <p className={`text-lg sm:text-xl font-bold ${baseCagr > 15 ? 'text-green-500' : baseCagr > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                    {baseCagr > 0 ? '+' : ''}{baseCagr.toFixed(1)}% CAGR
                                </p>
                            )}
                        </div>
                        {/* Confidence indicator */}
                        {hasConfidenceWarning && (
                            <div className="mt-2 mb-1">
                                <span className="inline-block text-[10px] uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                                    ⚠ High-growth projection
                                </span>
                            </div>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                            Based on {forwardEps ? 'forward EPS' : 'current EPS'}, scenario-based EPS growth, and
                            {peWasNormalized ? ' mean-reverted' : ' 5Y historical'} P/E distribution
                        </p>
                        <button
                            onClick={() => setShowMethodology(!showMethodology)}
                            className="mt-3 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                            {showMethodology ? '↑ Hide methodology' : '↓ Show methodology'}
                        </button>
                    </div>

                    {/* Methodology details */}
                    {showMethodology && (
                        <div className="space-y-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl p-4 sm:p-5 border border-gray-100 dark:border-gray-800">
                            {/* Market assumptions */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Market Assumptions</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                    <div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">Current EPS</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">${currentEps.toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">Forward P/E</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{forwardPe ? `${forwardPe.toFixed(1)}×` : 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">Implied Forward EPS</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{forwardEps ? `$${forwardEps.toFixed(2)}` : 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">Current Price</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">${currentPrice.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* EPS growth inputs */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">EPS Growth Inputs</p>
                                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                                    <div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">Historical 3Y CAGR</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{rawGrowth3y != null ? `${rawGrowth3y > 0 ? '+' : ''}${rawGrowth3y.toFixed(1)}%` : 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">Historical 5Y CAGR</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{rawGrowth5y != null ? `${rawGrowth5y > 0 ? '+' : ''}${rawGrowth5y.toFixed(1)}%` : 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">Forward Implied (1Y)</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{fwdImplied != null ? `${fwdImplied > 0 ? '+' : ''}${fwdImplied.toFixed(1)}%` : 'N/A'}</p>
                                    </div>
                                </div>
                                {growthWasCapped && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                                        ⚠ Historical growth ({rawGrowth5y?.toFixed(1)}%) exceeds {GROWTH_CAP}% cap — sustained growth at this rate over 5 years is economically unrealistic. Base scenario uses {GROWTH_CAP}%.
                                    </p>
                                )}
                            </div>

                            {/* 5Y Historical P/E with normalization */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                    5Y Historical P/E Distribution {peStats ? `(${peStats.count} obs)` : ''}
                                </p>
                                <div className="grid grid-cols-3 gap-3 text-sm">
                                    <div className="text-center bg-red-50 dark:bg-red-900/10 rounded-lg py-2">
                                        <p className="text-xs text-red-400">Bear (P25)</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{effectiveBearPe ? `${effectiveBearPe.toFixed(1)}×` : 'N/A'}</p>
                                        {peWasNormalized && rawBearPe !== effectiveBearPe && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">raw: {rawBearPe?.toFixed(1)}×</p>
                                        )}
                                    </div>
                                    <div className="text-center bg-blue-50 dark:bg-blue-900/10 rounded-lg py-2 ring-1 ring-blue-200 dark:ring-blue-800">
                                        <p className="text-xs text-blue-400">Base (Median)</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{effectiveBasePe ? `${effectiveBasePe.toFixed(1)}×` : 'N/A'}</p>
                                        {peWasNormalized && rawBasePe !== effectiveBasePe && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">raw: {rawBasePe?.toFixed(1)}×</p>
                                        )}
                                    </div>
                                    <div className="text-center bg-green-50 dark:bg-green-900/10 rounded-lg py-2">
                                        <p className="text-xs text-green-400">Bull (P75)</p>
                                        <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{effectiveBullPe ? `${effectiveBullPe.toFixed(1)}×` : 'N/A'}</p>
                                        {peWasNormalized && rawBullPe !== effectiveBullPe && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">raw: {rawBullPe?.toFixed(1)}×</p>
                                        )}
                                    </div>
                                </div>
                                {peWasNormalized && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                        ⚠ P/E normalized: 5Y median ({rawBasePe?.toFixed(1)}×) is {PE_DERATING_THRESHOLD}×+ higher than forward P/E ({forwardPe?.toFixed(1)}×), indicating market expects valuation de-rating. Using forward P/E × {PE_DERATING_PREMIUM} as base.
                                    </p>
                                )}
                            </div>

                            {/* Scenario growth sliders */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Scenario EPS Growth (adjustable)</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <GrowthSlider label="Bear Growth" value={bearGrowth} onChange={setBearGrowth} colorClass="text-red-500" />
                                    <GrowthSlider label="Base Growth" value={baseGrowth} onChange={setBaseGrowth} colorClass="text-blue-500" />
                                    <GrowthSlider label="Bull Growth" value={bullGrowth} onChange={setBullGrowth} colorClass="text-green-500" />
                                </div>
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    <span>-20%</span><span>0%</span><span>+50%</span>
                                </div>
                            </div>

                            {/* Horizon */}
                            <div>
                                <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <span>Investment Horizon</span>
                                    <span className="font-mono text-blue-600 dark:text-blue-400">{ddYears} {ddYears === 1 ? 'year' : 'years'}</span>
                                </label>
                                <input
                                    type="range" min="1" max="5" step="1" value={ddYears}
                                    onChange={(e) => setDdYears(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                                />
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    {[1, 2, 3, 4, 5].map(y => (
                                        <span key={y} className={ddYears === y ? 'text-blue-500 font-bold' : ''}>{y}Y</span>
                                    ))}
                                </div>
                            </div>

                            {/* Bear/Base/Bull table — now with separate growth rates */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200 dark:border-gray-700">
                                            <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"></th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-red-400 uppercase tracking-wider">Bear</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">Base</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-green-400 uppercase tracking-wider">Bull</th>
                                        </tr>
                                    </thead>
                                    <tbody className="font-mono">
                                        <tr className="border-b border-gray-100 dark:border-gray-800">
                                            <td className="py-2 px-2 text-xs text-gray-500 dark:text-gray-400">EPS Growth</td>
                                            <td className="text-right py-2 px-2 text-red-500">{bearGrowth > 0 ? '+' : ''}{bearGrowth}%</td>
                                            <td className="text-right py-2 px-2 text-blue-500">{baseGrowth > 0 ? '+' : ''}{baseGrowth}%</td>
                                            <td className="text-right py-2 px-2 text-green-500">{bullGrowth > 0 ? '+' : ''}{bullGrowth}%</td>
                                        </tr>
                                        <tr className="border-b border-gray-100 dark:border-gray-800">
                                            <td className="py-2 px-2 text-xs text-gray-500 dark:text-gray-400">{targetYear} EPS</td>
                                            <td className="text-right py-2 px-2 text-gray-900 dark:text-gray-100">${bearProjEps.toFixed(2)}</td>
                                            <td className="text-right py-2 px-2 text-gray-900 dark:text-gray-100">${baseProjEps.toFixed(2)}</td>
                                            <td className="text-right py-2 px-2 text-gray-900 dark:text-gray-100">${bullProjEps.toFixed(2)}</td>
                                        </tr>
                                        <tr className="border-b border-gray-100 dark:border-gray-800">
                                            <td className="py-2 px-2 text-xs text-gray-500 dark:text-gray-400">P/E Multiple</td>
                                            <td className="text-right py-2 px-2 text-gray-900 dark:text-gray-100">{effectiveBearPe?.toFixed(1) ?? '—'}×</td>
                                            <td className="text-right py-2 px-2 text-gray-900 dark:text-gray-100">{effectiveBasePe?.toFixed(1) ?? '—'}×</td>
                                            <td className="text-right py-2 px-2 text-gray-900 dark:text-gray-100">{effectiveBullPe?.toFixed(1) ?? '—'}×</td>
                                        </tr>
                                        <tr className="border-b border-gray-100 dark:border-gray-800">
                                            <td className="py-2 px-2 text-xs text-gray-500 dark:text-gray-400">{targetYear} Price</td>
                                            <td className="text-right py-2 px-2 font-semibold text-red-500">${bearPrice?.toFixed(2) ?? '—'}</td>
                                            <td className="text-right py-2 px-2 font-semibold text-blue-500">${basePrice?.toFixed(2) ?? '—'}</td>
                                            <td className="text-right py-2 px-2 font-semibold text-green-500">${bullPrice?.toFixed(2) ?? '—'}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-2 text-xs text-gray-500 dark:text-gray-400">Expected CAGR</td>
                                            <td className={`text-right py-2 px-2 font-semibold ${bearCagr !== null && bearCagr > 0 ? 'text-red-500' : 'text-red-400'}`}>
                                                {bearCagr !== null ? `${bearCagr > 0 ? '+' : ''}${bearCagr.toFixed(1)}%` : '—'}
                                            </td>
                                            <td className={`text-right py-2 px-2 font-semibold ${baseCagr !== null && baseCagr > 0 ? 'text-blue-500' : 'text-blue-400'}`}>
                                                {baseCagr !== null ? `${baseCagr > 0 ? '+' : ''}${baseCagr.toFixed(1)}%` : '—'}
                                            </td>
                                            <td className={`text-right py-2 px-2 font-semibold ${bullCagr !== null && bullCagr > 0 ? 'text-green-500' : 'text-green-400'}`}>
                                                {bullCagr !== null ? `${bullCagr > 0 ? '+' : ''}${bullCagr.toFixed(1)}%` : '—'}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Confidence / evidence details */}
                            {hasConfidenceWarning && (
                                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">Evidence Level</p>
                                    <ul className="space-y-1">
                                        {confidenceFlags.map((flag, i) => (
                                            <li key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                                                <span className="mt-0.5">⚠</span>
                                                <span>{flag}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 italic">
                                        Projection relies on normalization of extreme inputs — treat as directional, not precise.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Data-Driven mode but insufficient data */}
            {mode === 'dataDriven' && !hasDataDrivenData && (
                <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg text-center border border-gray-100 dark:border-gray-700/50">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Not enough data for Data-Driven Valuation. Need valid EPS and historical P/E stats.
                        Switch to Manual Scenario to set assumptions manually.
                    </p>
                </div>
            )}

            {/* ── MANUAL MODE ── */}
            {mode === 'manual' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Inputs */}
                    <div className="space-y-5">
                        {/* Years slider */}
                        <div>
                            <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <span>Investment Horizon</span>
                                <span className="font-mono text-blue-600 dark:text-blue-400">{years} {years === 1 ? 'year' : 'years'}</span>
                            </label>
                            <input
                                type="range" min="1" max="5" step="1" value={years}
                                onChange={(e) => setYears(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                {[1, 2, 3, 4, 5].map(y => (
                                    <span key={y} className={years === y ? 'text-blue-500 font-bold' : ''}>{y}Y</span>
                                ))}
                            </div>
                        </div>

                        {/* EPS Growth slider */}
                        <div>
                            <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <span>Expected Annual EPS Growth</span>
                                <span className="font-mono text-blue-600 dark:text-blue-400">{epsGrowth}%</span>
                            </label>
                            <input
                                type="range" min="-20" max="50" step="1" value={epsGrowth}
                                onChange={(e) => setEpsGrowth(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>-20%</span><span>0%</span><span>+50%</span>
                            </div>
                        </div>

                        {/* Exit P/E slider */}
                        <div>
                            <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <span>Exit P/E Multiple</span>
                                <span className="font-mono text-blue-600 dark:text-blue-400">{exitPe.toFixed(1)}x</span>
                            </label>
                            <input
                                type="range" min="3" max="100" step="0.5" value={exitPe}
                                onChange={(e) => setExitPe(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>3x</span>
                                <span className="text-blue-400 font-semibold">Current: {currentPe.toFixed(1)}x</span>
                                <span>100x</span>
                            </div>
                        </div>
                    </div>

                    {/* Results */}
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-5 sm:p-6 border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
                        <div className="grid grid-cols-2 gap-4 mb-5">
                            <div>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Current Price</p>
                                <p className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">${currentPrice.toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Projected EPS (Y{years})</p>
                                <p className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">${projectedEps.toFixed(2)}</p>
                            </div>
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                            <div className="flex justify-between items-end mb-2">
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Target Price in {years}Y</p>
                                <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">${targetPrice.toFixed(2)}</p>
                            </div>
                            <div className="flex justify-between items-center mt-3">
                                <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Annual Return (CAGR)</p>
                                <p className={`text-xl sm:text-2xl font-bold flex items-center gap-2 ${manualCagr > 15 ? 'text-green-500' : manualCagr > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                    {manualCagr > 0 ? '+' : ''}{manualCagr.toFixed(2)}%
                                    {isMarketBeating && (
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
                <div className="w-full" style={{ minHeight: 220 }}>
                    <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 5 }}>
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
                                width={50}
                                domain={[yMin, yMax]}
                                tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}`}
                            />
                            <Tooltip content={<ScenarioTooltip />} />
                            <ReferenceLine x={chartData.find(d => d.projection !== null && d.historical !== null)?.timestamp ?? chartData.find(d => d.bear !== null && d.historical !== null)?.timestamp ?? ''} stroke="#9CA3AF" strokeDasharray="3 3" label={{ value: 'Today', fontSize: 10, fill: '#9CA3AF', position: 'top' }} />
                            {/* Historical solid line */}
                            <Line
                                type="monotone"
                                dataKey="historical"
                                stroke="#6B7280"
                                strokeWidth={1.5}
                                dot={false}
                                connectNulls={false}
                                isAnimationActive={false}
                            />
                            {mode === 'manual' ? (
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
                                    {/* Bull line */}
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
                                    {/* Base line */}
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
                                    {/* Bear line */}
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
