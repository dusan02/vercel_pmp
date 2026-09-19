import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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

export function useAnalysis(ticker: string, initialAnalysisData?: any, initialHistoryData?: any) {
    // Build initial data from SSR pre-fetched API responses
    const ssrData = useMemo(() => {
        if (!initialAnalysisData) return null;
        const json = initialAnalysisData;
        const histJson = initialHistoryData ?? {};
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
            return { ...json.primary, ...historyExtras, peers: json.peers || [], finnhub: json.primary.finnhub ?? null } as AnalysisData;
        }
        return { ...json, ...historyExtras, finnhub: json.finnhub ?? null } as AnalysisData;
    }, [initialAnalysisData, initialHistoryData]);

    const [data, setData] = useState<AnalysisData | null>(() => ssrData);
    const [loading, setLoading] = useState(() => !ssrData);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [analysisStep, setAnalysisStep] = useState<string>('');
    const autoTriggered = useRef<string | null>(null);
    const fetchIdRef = useRef(0);
    // Tracks the ticker whose responses may still mutate state — stale-ticker
    // responses (user switched tickers mid-flight) are discarded.
    const tickerRef = useRef(ticker);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        tickerRef.current = ticker;
    }, [ticker]);

    // Abort in-flight requests on unmount
    useEffect(() => () => { abortRef.current?.abort(); }, []);

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

    const fetchAnalysis = useCallback(async () => {
        const reqTicker = ticker;
        const controller = new AbortController();
        // Abort the previous in-flight request (prevents duplicate network work)
        abortRef.current?.abort();
        abortRef.current = controller;
        // Track the latest request so stale responses are discarded
        const reqId = ++fetchIdRef.current;
        try {
            setLoading(true);
            setError(null);

            // Fetch main analysis + history (for correlation/valuation charts) in parallel
            const [res, histRes] = await Promise.all([
                fetch(`/api/analysis/${ticker}`, { signal: controller.signal }),
                fetch(`/api/analysis/${ticker}/history`, { signal: controller.signal }),
            ]);

            // Ticker changed while this request was in flight → discard entirely
            if (tickerRef.current !== reqTicker) return;

            if (!res.ok) {
                if (reqId !== fetchIdRef.current) return; // stale
                setData(null);
                if (res.status === 404) {
                    setError('No analysis data available for this ticker.');
                } else {
                    setError(`Analysis request failed (${res.status}). Please try again.`);
                }
                return;
            }
            const json = await res.json();
            if (tickerRef.current !== reqTicker) return;
            const histJson = histRes && histRes.ok ? await histRes.json().catch(() => ({})) : {};

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
            } else {
                setData(json ? { ...json, ...historyExtras, finnhub: json.finnhub ?? null } : null);
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            if (tickerRef.current !== reqTicker) return;
            if (reqId !== fetchIdRef.current) return; // stale
            console.error(err);
            setError('Could not load analysis data. Please try again later.');
        } finally {
            if (reqId === fetchIdRef.current) {
                setLoading(false);
            }
        }
    }, [ticker]);

    useEffect(() => {
        autoTriggered.current = null;
        // Skip initial fetch if we have SSR data — it will be refreshed in background
        if (ssrData) {
            // Delay background refresh so SSR data shows immediately
            const timer = setTimeout(() => fetchAnalysis(), 5000);
            return () => clearTimeout(timer);
        }
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

    const runDeepAnalysis = async () => {
        const reqTicker = ticker;
        try {
            setAnalyzing(true);
            setError(null);
            const res = await fetch(`/api/analysis/${ticker}`, { method: 'POST' });
            if (tickerRef.current !== reqTicker) return; // user switched tickers mid-flight
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
            if (tickerRef.current !== reqTicker) return;
            console.error(err);
            setError(err?.message || 'An error occurred during deep analysis.');
        } finally {
            if (tickerRef.current === reqTicker) setAnalyzing(false);
        }
    };

    return {
        data,
        loading,
        analyzing,
        error,
        analysisStep,
        runDeepAnalysis,
    };
}
