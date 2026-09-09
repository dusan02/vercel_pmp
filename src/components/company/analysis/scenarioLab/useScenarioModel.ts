'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { RatioStats } from '../types';
import { clamp, GROWTH_CAP, PE_ABSOLUTE_CAP, PE_DERATING_THRESHOLD, PE_DERATING_PREMIUM } from './format';
import { fmtPe } from './format';

/** Format a raw growth number for flag text (null-safe). */
function fmtPctRaw(n: number | null): string {
    return n === null ? 'N/A' : `${n.toFixed(1)}%`;
}

export interface PricePoint {
    date: string;
    price: number;
}

export type Mode = 'manual' | 'dataDriven';

export interface ScenarioModelProps {
    ticker: string;
    currentEps: number;
    currentPe: number;
    currentPrice: number;
    priceHistory?: PricePoint[] | undefined;
    forwardPe?: number | null | undefined;
    forwardEps?: number | null | undefined;
    forwardImpliedGrowth?: number | null | undefined;
    peStats?: RatioStats | null | undefined;
    epsCagr3y?: number | null | undefined;
    epsCagr5y?: number | null | undefined;
}

/**
 * All ScenarioLab math in one hook:
 * manual scenario, data-driven scenarios (bear/base/bull),
 * P/E normalization, confidence flags and chart series.
 */
export function useScenarioModel({
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
}: ScenarioModelProps) {
    const [mode, setMode] = useState<Mode>('dataDriven');
    const [priceHistory, setPriceHistory] = useState<PricePoint[]>(propPriceHistory ?? []);

    // ── Manual mode state ──
    const [epsGrowth, setEpsGrowth] = useState<number>(10);
    const [exitPe, setExitPe] = useState<number>(Math.max(5, Math.min(100, currentPe || 20)));
    const [years, setYears] = useState<number>(5);

    // ── Data-Driven mode state ──
    const [ddYears, setDdYears] = useState<number>(5);
    const [showMethodology, setShowMethodology] = useState<boolean>(false);

    // ── Growth inputs ──
    const rawGrowth5y = epsCagr5y ?? null;
    const rawGrowth3y = epsCagr3y ?? null;
    const fwdImplied = forwardImpliedGrowth ?? null;

    const normalizedBaseGrowth = clamp(rawGrowth5y ?? rawGrowth3y ?? 10, -10, GROWTH_CAP);
    const growthWasCapped = (rawGrowth5y !== null && rawGrowth5y > GROWTH_CAP) || (rawGrowth5y === null && rawGrowth3y !== null && rawGrowth3y > GROWTH_CAP);

    const defaultBearGrowth = clamp(
        Math.min(rawGrowth3y ?? normalizedBaseGrowth, rawGrowth5y ?? normalizedBaseGrowth),
        0, GROWTH_CAP
    );
    const defaultBaseGrowth = normalizedBaseGrowth;
    const defaultBullGrowth = clamp(
        Math.max(rawGrowth3y ?? normalizedBaseGrowth, rawGrowth5y ?? normalizedBaseGrowth),
        -10, 35
    );

    const [bearGrowth, setBearGrowth] = useState<number>(defaultBearGrowth);
    const [baseGrowth, setBaseGrowth] = useState<number>(defaultBaseGrowth);
    const [bullGrowth, setBullGrowth] = useState<number>(defaultBullGrowth);

    // ── Sync defaults when analysis data arrives async ──
    // useState initializers run before the parent's data resolves, so
    // exitPe/bear/base/bull would stay on generic fallbacks (20×, 10%)
    // instead of the company's real values. Sync until the user touches
    // a control — after that their manual input wins.
    const touched = useRef({ exitPe: false, bear: false, base: false, bull: false });

    useEffect(() => {
        if (!touched.current.exitPe && currentPe > 0) {
            setExitPe(Math.max(5, Math.min(100, currentPe)));
        }
    }, [currentPe]);

    useEffect(() => {
        if (touched.current.bear) return;
        setBearGrowth(defaultBearGrowth);
    }, [defaultBearGrowth]);

    useEffect(() => {
        if (touched.current.base) return;
        setBaseGrowth(defaultBaseGrowth);
    }, [defaultBaseGrowth]);

    useEffect(() => {
        if (touched.current.bull) return;
        setBullGrowth(defaultBullGrowth);
    }, [defaultBullGrowth]);

    const setExitPeTouched = useCallback((v: number) => {
        touched.current.exitPe = true;
        setExitPe(v);
    }, []);
    const setBearGrowthTouched = useCallback((v: number) => { touched.current.bear = true; setBearGrowth(v); }, []);
    const setBaseGrowthTouched = useCallback((v: number) => { touched.current.base = true; setBaseGrowth(v); }, []);
    const setBullGrowthTouched = useCallback((v: number) => { touched.current.bull = true; setBullGrowth(v); }, []);

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

    const baseEps = (currentEps > 0) ? currentEps
        : (currentPe > 0 && currentPrice > 0) ? (currentPrice / currentPe)
        : currentEps;

    // ── Manual mode calculations ──
    const projectedEps = baseEps * Math.pow(1 + epsGrowth / 100, years);
    const targetPrice = projectedEps * exitPe;
    let manualCagr = 0;
    if (currentPrice > 0 && targetPrice > 0) {
        manualCagr = (Math.pow(targetPrice / currentPrice, 1 / years) - 1) * 100;
    }
    const isMarketBeating = manualCagr > 15;

    // ── Data-Driven: P/E normalization ──
    const rawBearPe = peStats?.p25 ?? null;
    const rawBasePe = peStats?.median ?? null;
    const rawBullPe = peStats?.p75 ?? null;

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

    const effectiveBearPe = normalizePe(rawBearPe) ?? (currentPe > 0 ? currentPe * 0.8 : null);
    const effectiveBasePe = normalizePe(rawBasePe) ?? currentPe ?? null;
    const effectiveBullPe = normalizePe(rawBullPe) ?? (currentPe > 0 ? currentPe * 1.2 : null);

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

    const isHighGrowth = baseCagr !== null && baseCagr > 25;
    const confidenceFlags: string[] = [];
    // "raw" in the flag = whichever input actually exceeded the cap (5Y preferred, else 3Y)
    const cappedRawGrowth = rawGrowth5y ?? rawGrowth3y;
    if (growthWasCapped) confidenceFlags.push(`Growth capped at ${GROWTH_CAP}% (raw: ${fmtPctRaw(cappedRawGrowth)})`);
    if (peWasNormalized) confidenceFlags.push(`P/E mean-reverted (raw median: ${fmtPe(rawBasePe)} → ${fmtPe(effectiveBasePe)})`);
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

    return {
        mode, setMode,
        epsGrowth, setEpsGrowth,
        exitPe, setExitPe: setExitPeTouched,
        years, setYears,
        ddYears, setDdYears,
        showMethodology, setShowMethodology,
        bearGrowth, setBearGrowth: setBearGrowthTouched,
        baseGrowth, setBaseGrowth: setBaseGrowthTouched,
        bullGrowth, setBullGrowth: setBullGrowthTouched,
        baseEps,
        projectedEps, targetPrice, manualCagr, isMarketBeating,
        bearProjEps, baseProjEps, bullProjEps,
        bearPrice, basePrice, bullPrice,
        bearCagr, baseCagr, bullCagr,
        hasDataDrivenData, targetYear,
        isNegativePe,
        effectiveBearPe, effectiveBasePe, effectiveBullPe,
        rawBearPe, rawBasePe, rawBullPe,
        rawGrowth3y, rawGrowth5y, fwdImplied,
        growthWasCapped, peWasNormalized, isHighGrowth,
        confidenceFlags, hasConfidenceWarning,
        chartData,
    };
}
