import { useState, useEffect, useRef, useCallback } from 'react';
import type { AnalysisData } from '../components/company/analysis/types';

const ANALYSIS_STEPS = [
    'Fetching Finnhub financial data...',
    'Syncing XBRL financial statements...',
    'Fetching 10Y daily price aggregates...',
    'Computing valuation multiples & P/E bands...',
    'Calculating Altman Z-Score & Beneish M-Score...',
    'Running Piotroski F-Score analysis...',
    'Finalizing AI Verdict...',
] as const;

export function useAnalysis(ticker: string) {
    const [data, setData] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [compareWith, setCompareWith] = useState<string>('');
    const [compareInput, setCompareInput] = useState<string>('');
    const [secondaryData, setSecondaryData] = useState<AnalysisData | null>(null);
    const [loadingCompare, setLoadingCompare] = useState(false);
    const [analysisStep, setAnalysisStep] = useState<string>('');
    const autoTriggered = useRef<string | null>(null);
    const fetchIdRef = useRef(0);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | undefined;
        if (analyzing) {
            let step = 0;
            setAnalysisStep(ANALYSIS_STEPS[0]);
            timer = setInterval(() => {
                step = (step + 1) % ANALYSIS_STEPS.length;
                setAnalysisStep(ANALYSIS_STEPS[step] ?? ANALYSIS_STEPS[0]);
            }, 3000);
        } else {
            setAnalysisStep('');
        }
        return () => clearInterval(timer);
    }, [analyzing]);

    const fetchAnalysis = useCallback(async (compare?: string) => {
        const controller = new AbortController();
        // Track the latest request so stale responses are discarded
        const reqId = ++fetchIdRef.current;
        const isCompare = !!compare;
        try {
            // Only show full-page loading skeleton for primary fetches,
            // not for compare requests (which use loadingCompare instead)
            if (!isCompare) {
                setLoading(true);
            }
            setError(null);
            const url = compare
                ? `/api/analysis/${ticker}?compare=${compare}`
                : `/api/analysis/${ticker}`;

            // Fetch main analysis + history (for correlation/valuation charts) in parallel
            // Skip history fetch for compare requests — secondary data doesn't need charts
            const fetches: Promise<Response>[] = [fetch(url, { signal: controller.signal })];
            if (!isCompare) {
                fetches.push(fetch(`/api/analysis/${ticker}/history`, { signal: controller.signal }));
            }
            const [res, histRes] = await Promise.all(fetches);

            if (!res.ok) {
                if (reqId !== fetchIdRef.current) return; // stale
                setData(null);
                setSecondaryData(null);
                if (res.status === 404) {
                    setError('No analysis data available for this ticker.');
                } else {
                    setError(`Analysis request failed (${res.status}). Please try again.`);
                }
                return;
            }
            const json = await res.json();
            const histJson = !isCompare && histRes && histRes.ok ? await histRes.json().catch(() => ({})) : {};

            // Discard if a newer request was started
            if (reqId !== fetchIdRef.current) return;

            // Fields sourced from /history endpoint
            const historyExtras = {
                priceHistory: histJson.priceHistory ?? [],
                impliedPricePS: histJson.impliedPricePS ?? [],
                impliedPricePE: histJson.impliedPricePE ?? [],
                correlation: histJson.correlation ?? undefined,
                valuationHistory: histJson.valuationHistory ?? [],
                valuationHistoryPE: histJson.valuationHistoryPE ?? [],
                valuationHistoryPS: histJson.valuationHistoryPS ?? [],
                valuationSummary: histJson.valuationSummary ?? null,
                valuationSummaryPE: histJson.valuationSummaryPE ?? null,
                valuationSummaryPS: histJson.valuationSummaryPS ?? null,
                valuationForecast: histJson.valuationForecast ?? [],
                valuationForecastPE: histJson.valuationForecastPE ?? [],
                valuationForecastPS: histJson.valuationForecastPS ?? [],
                peHistory: histJson.peHistory ?? [],
                psHistory: histJson.psHistory ?? [],
                valuationCurrent: histJson.current ?? null,
                valuationStats: histJson.stats ?? null,
                epsCagr3y: histJson.epsCagr3y ?? null,
                epsCagr5y: histJson.epsCagr5y ?? null,
            };

            if (json && json.primary) {
                // Pass through finnhub data from API response
                setData({ ...json.primary, ...historyExtras, peers: json.peers || [], finnhub: json.primary.finnhub ?? null });
                setSecondaryData(json.secondary ? { ...json.secondary, finnhub: json.secondary.finnhub ?? null } : null);
            } else {
                setData(json ? { ...json, ...historyExtras, finnhub: json.finnhub ?? null } : null);
                setSecondaryData(null);
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            if (reqId !== fetchIdRef.current) return; // stale
            console.error(err);
            if (!isCompare) {
                setError('Could not load analysis data. Please try again later.');
            }
        } finally {
            if (reqId === fetchIdRef.current) {
                if (!isCompare) {
                    setLoading(false);
                }
            }
        }
    }, [ticker]);

    useEffect(() => {
        // Reset comparison state when ticker changes
        setCompareWith('');
        setCompareInput('');
        setSecondaryData(null);
        autoTriggered.current = null;
        fetchAnalysis();
    }, [ticker, fetchAnalysis]);

    // Auto-run deep analysis when no cached data exists for this ticker.
    // Use per-ticker guard to avoid re-triggering on the same ticker.
    useEffect(() => {
        if (!loading && data === null && !analyzing && !error && autoTriggered.current !== ticker) {
            autoTriggered.current = ticker;
            runDeepAnalysis();
        }
    }, [loading, data, analyzing, error, ticker]);

    const handleAddComparison = async (symbol?: string) => {
        const target = (symbol || compareInput).toUpperCase().trim();
        if (!target) return;
        setCompareWith(target);
        setLoadingCompare(true);
        await fetchAnalysis(target);
        setLoadingCompare(false);
    };

    const handleRemoveComparison = () => {
        setCompareWith('');
        setCompareInput('');
        setSecondaryData(null);
        fetchAnalysis();
    };

    const runDeepAnalysis = async () => {
        try {
            setAnalyzing(true);
            setError(null);
            const res = await fetch(`/api/analysis/${ticker}`, { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const msg = body?.details || body?.error || `Analysis failed (${res.status})`;
                throw new Error(msg);
            }
            await res.json();
            // POST response lacks historyExtras (priceHistory, valuationHistory, etc.)
            // Fetch full data (including /history endpoint) to populate all charts correctly
            await fetchAnalysis();
        } catch (err: any) {
            console.error(err);
            setError(err?.message || 'An error occurred during deep analysis.');
        } finally {
            setAnalyzing(false);
        }
    };

    return {
        data,
        loading,
        analyzing,
        error,
        compareWith,
        compareInput,
        secondaryData,
        loadingCompare,
        analysisStep,
        setCompareInput,
        runDeepAnalysis,
        handleAddComparison,
        handleRemoveComparison,
        setData
    };
}
