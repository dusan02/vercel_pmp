import { useState, useEffect, useRef } from 'react';
import { AnalysisData } from '../components/company/AnalysisTab';

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
    const autoTriggered = useRef(false);

    useEffect(() => {
        let timer: any;
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

    const fetchAnalysis = async (compare?: string) => {
        try {
            setLoading(true);
            setError(null);
            const url = compare
                ? `/api/analysis/${ticker}?compare=${compare}`
                : `/api/analysis/${ticker}`;
            const res = await fetch(url);
            
            if (!res.ok) {
                setData(null);
                setSecondaryData(null);
                return;
            }
            const json = await res.json();
            if (json && json.primary) {
                // Pass through finnhub data from API response
                setData({ ...json.primary, peers: json.peers || [], finnhub: json.primary.finnhub ?? null });
                setSecondaryData(json.secondary ? { ...json.secondary, finnhub: json.secondary.finnhub ?? null } : null);
            } else {
                setData(json ? { ...json, finnhub: json.finnhub ?? null } : null);
                setSecondaryData(null);
            }
        } catch (err) {
            console.error(err);
            setError('Could not load analysis data. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        autoTriggered.current = false;
        fetchAnalysis();
    }, [ticker]);

    // Auto-run deep analysis when no cached data exists for this ticker
    useEffect(() => {
        if (!loading && data === null && !analyzing && !error && !autoTriggered.current) {
            autoTriggered.current = true;
            runDeepAnalysis();
        }
    }, [loading, data, analyzing, error]);

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
            const json = await res.json();
            // Pass through finnhub data from POST response as well
            setData(json ? { ...json, finnhub: json.finnhub ?? null } : null);
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
