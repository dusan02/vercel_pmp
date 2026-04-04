import { useState, useEffect, useRef } from 'react';
import { AnalysisData } from '../components/company/AnalysisTab';

export function useAnalysis(ticker: string) {
    const [data, setData] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Comparison state
    const [compareWith, setCompareWith] = useState<string>('');
    const [compareInput, setCompareInput] = useState<string>('');
    const [secondaryData, setSecondaryData] = useState<AnalysisData | null>(null);
    const [loadingCompare, setLoadingCompare] = useState(false);
    const [openPanel, setOpenPanel] = useState<'health' | 'profitability' | 'valuation' | null>(null);
    
    const [analysisStep, setAnalysisStep] = useState<string>('');
    const autoTriggered = useRef(false);

    const togglePanel = (p: 'health' | 'profitability' | 'valuation') => setOpenPanel(prev => prev === p ? null : p);

    const analysisSteps = [
        'Connecting to Polygon API...',
        'Syncing financial statements (V3)...',
        'Fetching 1 year of daily aggregates...',
        'Computing valuation multiples...',
        'Calculating Altman Z-Score & Beneish M-Score...',
        'Running Piotroski F-Score analysis...',
        'Finalizing AI Verdict...'
    ];

    useEffect(() => {
        let timer: any;
        if (analyzing) {
            let step = 0;
            setAnalysisStep(analysisSteps[0] || '');
            timer = setInterval(() => {
                step = (step + 1) % analysisSteps.length;
                setAnalysisStep(analysisSteps[step] || '');
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
                setData({ ...json.primary, peers: json.peers || [] });
                setSecondaryData(json.secondary || null);
            } else {
                setData(json ? { ...json } : null);
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
            if (!res.ok) throw new Error('Analysis failed');
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error(err);
            setError('An error occurred during deep analysis.');
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
        openPanel,
        togglePanel,
        setCompareInput,
        runDeepAnalysis,
        handleAddComparison,
        handleRemoveComparison,
        setData
    };
}
